import { getCatalog, labeledCatalog, type AppCatalog } from "./catalog";
import type {
  AccountRef,
  AppSettings,
  DataSet,
  DataSource,
  DateRange,
  Level,
  Network,
  NormalizedRow,
  TimeSeriesPoint,
} from "./types";
import { AppError } from "./errors";
import { readSettings, connectionState } from "./settings";
import { resolveRange } from "./dates";
import { cacheDelete, cacheGetOrLoad } from "./cache";
import { aggregateRows, computeTotals, seriesFromRows, str } from "./normalize/common";
import { normalizeGoogleRows } from "./normalize/google-ads";
import { normalizeMetaRows } from "./normalize/meta";
import { normalizeTikTokRows } from "./normalize/tiktok";
import { normalizeYouTubeRows, type YouTubeChannelMeta, type YouTubeTable } from "./normalize/youtube";
import { demoAdLibrary, demoGoogle, demoMeta, demoTikTok, demoYouTube } from "./demo";
import { GoogleAdsClient } from "./clients/google-ads";
import { MetaClient } from "./clients/meta";
import { TikTokClient } from "./clients/tiktok";
import { YouTubeClient } from "./clients/youtube";

export interface DataQuery {
  network: Network;
  preset?: string;
  start?: string;
  end?: string;
  level?: Level;
  accountId?: string;
  subtab?: string;
  platform?: "facebook" | "instagram" | "both";
  actionType?: string;
  metricKeys?: string[];
  refresh?: boolean;
  section?: string;
  dimension?: string;
}

export interface DataResponse extends DataSet {
  range?: DateRange;
  extras?: Record<string, unknown>;
  breakdowns?: { label: string; value: number; secondary?: number }[];
  isolated?: Record<string, unknown>;
}

function metricKeys(catalog: AppCatalog, requested?: string[]): string[] {
  const valid = (requested ?? []).filter((key) => catalog.metrics.some((metric) => metric.key === key)).slice(0, 60);
  if (valid.length > 0) return valid;
  // Fetch the whole verified catalog so every offered column has real values.
  return catalog.metrics.map((metric) => metric.key).slice(0, 60);
}

function buildResponse(options: {
  network: Network;
  catalog: AppCatalog;
  rows: NormalizedRow[];
  series: TimeSeriesPoint[];
  previousRows: NormalizedRow[];
  previousSeries: TimeSeriesPoint[];
  currency: string;
  accounts: AccountRef[];
  accountId?: string;
  source: DataSource;
  notices: string[];
  extras?: Record<string, unknown>;
  breakdowns?: { label: string; value: number; secondary?: number }[];
  isolated?: Record<string, unknown>;
}): DataResponse {
  return {
    network: options.network,
    level: options.rows[0]?.level ?? options.catalog.defaultLevel,
    currency: options.currency,
    rows: options.rows,
    totals: computeTotals(options.rows, options.catalog),
    previousTotals: computeTotals(options.previousRows, options.catalog),
    series: options.series,
    previousSeries: options.previousSeries,
    source: options.source,
    accounts: options.accounts,
    accountId: options.accountId,
    catalog: options.catalog,
    notices: options.notices,
    fetchedAt: new Date().toISOString(),
    extras: options.extras,
    breakdowns: options.breakdowns,
    isolated: options.isolated,
  };
}

function googleCatalogForSubtab(subtab: string, catalog: AppCatalog, includeExperimental: boolean): AppCatalog {
  const groupsBySubtab: Record<string, string[]> = {
    search: ["Performance", "Conversions", "Impression share", "Quality"],
    pmax: ["Performance", "Conversions", "Video", "Shopping"],
    demand_gen: ["Performance", "Conversions", "Video", "Engagement"],
    shopping: ["Performance", "Conversions", "Shopping"],
    video: ["Performance", "Conversions", "Video", "Engagement"],
    all: [],
  };
  const groups = groupsBySubtab[subtab];
  if (!groups || groups.length === 0) {
    return labeledCatalog("google-ads", { includeExperimental });
  }
  const metrics = catalog.metrics.filter((metric) => groups.includes(metric.group) && (includeExperimental || !metric.experimental));
  const allowed = new Set(metrics.map((metric) => metric.key));
  return {
    ...catalog,
    metrics,
    defaultMetrics: catalog.defaultMetrics.filter((key) => allowed.has(key)),
  };
}

function normalizeGoogleFor(
  raw: ReturnType<typeof demoGoogle>,
  catalog: AppCatalog,
  level: Level,
  start: string,
  end: string,
): { rows: NormalizedRow[]; series: TimeSeriesPoint[] } {
  const daily = normalizeGoogleRows(raw.results, {
    level,
    currency: raw.accounts[0]?.currency ?? "USD",
    catalog,
    source: "demo",
  });
  const rows = aggregateRows(daily, catalog);
  const series = seriesFromRows(daily, catalog);
  void start;
  void end;
  return { rows, series };
}

async function googleData(query: DataQuery, settings: AppSettings, range: DateRange): Promise<DataResponse> {
  const subtab = query.subtab || "search";
  const level = query.level || "campaign";
  const notices: string[] = [];

  if (settings.demoMode) {
    const accountId = query.accountId || "demo-google-1001";
    const catalog = googleCatalogForSubtab(subtab, labeledCatalog("google-ads", { includeExperimental: true }), true);
    const current = demoGoogle(accountId, subtab, level, range);
    const previous = demoGoogle(accountId, subtab, level, resolveRange({ preset: "custom", start: range.previousStart, end: range.previousEnd, timezone: range.timezone }));
    const normalCurrent = normalizeGoogleFor(current, catalog, level, range.start, range.end);
    const normalPrevious = normalizeGoogleFor(previous, catalog, level, range.start, range.end);
    return buildResponse({
      network: "google-ads",
      catalog,
      rows: normalCurrent.rows,
      series: normalCurrent.series,
      previousRows: normalPrevious.rows,
      previousSeries: normalPrevious.series,
      currency: current.accounts.find((account) => account.id === accountId)?.currency ?? "USD",
      accounts: current.accounts,
      accountId,
      source: "demo",
      notices,
      extras: current.summary,
    });
  }

  const client = new GoogleAdsClient(settings);
  const { catalog: verifiedCatalog, verified: fieldsVerified } = await client.verifiedCatalog(true);
  const catalog = googleCatalogForSubtab(subtab, verifiedCatalog, false);
  if (!fieldsVerified) {
    notices.push("Live Google Ads field metadata could not be confirmed, so only the safest default metrics are shown.");
  }
  let accounts: AccountRef[] = settings.googleAds.customerIds.map((id) => ({ id, name: id, currency: undefined }));
  if (accounts.length === 0) {
    const accessible = await client.listAccessibleCustomers();
    accounts = accessible.map((id) => ({ id, name: id }));
  }
  const accountId = (query.accountId || accounts[0]?.id || "").replace(/[^0-9]/g, "");
  if (!accountId) {
    throw new AppError("CONFIG", { provider: "google-ads", detail: "Add a Google Ads customer ID in Settings." });
  }
  const selected = metricKeys(catalog, query.metricKeys);
  const report = await client.getReport({
    customerId: accountId,
    level,
    subtab,
    start: range.start,
    end: range.end,
    metrics: selected,
  });
  const previous = await client.getReport({
    customerId: accountId,
    level,
    subtab,
    start: range.previousStart,
    end: range.previousEnd,
    metrics: selected,
  });
  let summary: Record<string, unknown> = {};
  try {
    summary = await client.getAccountSummary(accountId);
  } catch {
    notices.push("The account summary (budgets and bidding) is not available with the current Google Ads access level.");
  }
  const mergedAccounts = accounts.map((account) => (account.id === accountId ? { ...account, name: report.accountName, currency: report.currency } : account));
  return buildResponse({
    network: "google-ads",
    catalog,
    rows: report.rows,
    series: report.series,
    previousRows: previous.rows,
    previousSeries: previous.series,
    currency: report.currency,
    accounts: mergedAccounts,
    accountId,
    source: "google_ads_api",
    notices,
    extras: summary,
  });
}

async function metaData(query: DataQuery, settings: AppSettings, range: DateRange): Promise<DataResponse> {
  const level = query.level || "campaign";
  const platform = query.platform || "both";
  const actionType = query.actionType || "purchase";
  const notices: string[] = [];

  if (settings.demoMode) {
    const catalog = labeledCatalog("meta", { includeExperimental: true });
    const current = demoMeta(level, platform, range);
    const previous = demoMeta(level, platform, resolveRange({ preset: "custom", start: range.previousStart, end: range.previousEnd, timezone: range.timezone }));
    const normalCurrent = normalizeMetaRows(current.data, { level, currency: "USD", catalog, source: "demo", actionType, platform });
    const normalPrevious = normalizeMetaRows(previous.data, { level, currency: "USD", catalog, source: "demo", actionType, platform });
    const rows = aggregateRows(normalCurrent, catalog);
    const prevRows = aggregateRows(normalPrevious, catalog);
    return buildResponse({
      network: "meta",
      catalog,
      rows,
      series: seriesFromRows(normalCurrent, catalog),
      previousRows: prevRows,
      previousSeries: seriesFromRows(normalPrevious, catalog),
      currency: "USD",
      accounts: current.accounts.map((account) => ({ id: str(account.id), name: str(account.name), currency: str(account.currency), status: str(account.status) })),
      accountId: "act_2001",
      source: "demo",
      notices,
      breakdowns: current.breakdowns.map((item) => ({ label: str(item.platform), value: Number(item.spend ?? 0), secondary: Number(item.clicks ?? 0) })),
      extras: {
        objects: [
          { id: "m-prospect", name: "Prospecting — Broad", status: "ACTIVE", objective: "OUTCOME_SALES", budget: 250, bidStrategy: "LOWEST_COST_WITHOUT_CAP" },
          { id: "m-retarget", name: "Retargeting — 30 days", status: "ACTIVE", objective: "OUTCOME_SALES", budget: 120, bidStrategy: "COST_CAP" },
          { id: "m-lead", name: "Lead form — Demo bookings", status: "ACTIVE", objective: "OUTCOME_LEADS", budget: 90, bidStrategy: "LOWEST_COST_WITHOUT_CAP" },
        ],
      },
    });
  }

  const client = new MetaClient(settings);
  const catalog = labeledCatalog("meta", { includeExperimental: false });
  const accountsRaw = await client.listAccounts();
  const accounts: AccountRef[] = accountsRaw.map((account) => ({ id: account.id, name: account.name, currency: account.currency, status: account.status }));
  if (accounts.length === 0) throw new AppError("NOT_FOUND", { provider: "meta", detail: "No Meta ad accounts were found." });
  const preferred = settings.meta.adAccountIds.length > 0 ? accounts.find((account) => account.id.endsWith(settings.meta.adAccountIds[0])) : undefined;
  const account = preferred ?? accounts[0];
  const selected = metricKeys(catalog, query.metricKeys);
  const report = await client.getInsights({
    accountId: account.id,
    level,
    start: range.start,
    end: range.end,
    metrics: selected,
    platform,
    actionType,
  });
  const previous = await client.getInsights({
    accountId: account.id,
    level,
    start: range.previousStart,
    end: range.previousEnd,
    metrics: selected,
    platform,
    actionType,
  });

  let objects: Record<string, unknown>[] = [];
  try {
    objects = await client.getCampaignObjects(account.id);
  } catch {
    notices.push("Campaign status and budget details need the ads_read permission; the performance numbers are unaffected.");
  }
  const statusById = new Map(objects.map((item) => [str(item.id), str(item.effective_status)]));
  for (const row of report.rows) {
    if (row.level === "campaign" && statusById.has(row.id)) row.status = statusById.get(row.id)!;
  }

  let breakdowns: { label: string; value: number; secondary?: number }[] = [];
  try {
    const placement = await client.getPlacementBreakdown(account.id, range.start, range.end);
    breakdowns = placement.map((item) => ({
      label: str(item.publisher_platform, "Other"),
      value: Number(item.spend ?? 0),
      secondary: Number(item.clicks ?? 0),
    }));
  } catch {
    notices.push("The Facebook vs Instagram placement chart is not available for this account.");
  }

  return buildResponse({
    network: "meta",
    catalog,
    rows: report.rows,
    series: report.series,
    previousRows: previous.rows,
    previousSeries: previous.series,
    currency: report.currency,
    accounts,
    accountId: account.id,
    source: "meta_api",
    notices,
    breakdowns,
    extras: { objects },
  });
}

async function tiktokData(query: DataQuery, settings: AppSettings, range: DateRange): Promise<DataResponse> {
  const level = query.level || "campaign";
  const notices: string[] = [];

  if (query.section === "adlib") {
    if (settings.demoMode) {
      return {
        ...emptyResponse("tiktok"),
        source: "tiktok_adlib",
        isolated: demoAdLibrary(),
        notices: ["Public transparency data only. This is not spend, click or conversion data."],
      };
    }
    if (!settings.tiktok.ccAccessToken && !(settings.tiktok.ccClientKey && settings.tiktok.ccClientSecret)) {
      throw new AppError("NOT_CONNECTED", { provider: "tiktok", detail: "The Commercial Content API needs separate TikTok approval." });
    }
    const client = new TikTokClient(settings);
    const report = await client.adReport(range.start.replace(/-/g, ""), range.end.replace(/-/g, ""));
    return {
      ...emptyResponse("tiktok"),
      source: "tiktok_adlib",
      isolated: { report, note: "Public transparency data only. No spend, clicks or conversions." },
      notices: ["Public transparency data only. This is not spend, click or conversion data."],
    };
  }

  if (settings.demoMode) {
    const catalog = labeledCatalog("tiktok", { includeExperimental: true });
    const current = demoTikTok(level, range);
    const previous = demoTikTok(level, resolveRange({ preset: "custom", start: range.previousStart, end: range.previousEnd, timezone: range.timezone }));
    const normalCurrent = normalizeTikTokRows(current.list, { level, currency: "USD", catalog, source: "demo" });
    const normalPrevious = normalizeTikTokRows(previous.list, { level, currency: "USD", catalog, source: "demo" });
    return buildResponse({
      network: "tiktok",
      catalog,
      rows: aggregateRows(normalCurrent, catalog),
      series: seriesFromRows(normalCurrent, catalog),
      previousRows: aggregateRows(normalPrevious, catalog),
      previousSeries: seriesFromRows(normalPrevious, catalog),
      currency: "USD",
      accounts: current.advertisers.map((item) => ({ id: str(item.advertiser_id), name: str(item.advertiser_name), currency: str(item.currency), status: str(item.status) })),
      accountId: "demo-tiktok-3001",
      source: "demo",
      notices,
      extras: { reportTypes: current.reportTypes },
    });
  }

  const client = new TikTokClient(settings);
  const catalog = labeledCatalog("tiktok", { includeExperimental: false });
  if (settings.tiktok.advertiserIds.length === 0) {
    throw new AppError("CONFIG", { provider: "tiktok", detail: "Add a TikTok advertiser ID in Settings." });
  }
  const accounts = await client.listAdvertisers(settings.tiktok.advertiserIds);
  const accountId = query.accountId || accounts[0]?.id || settings.tiktok.advertiserIds[0];
  const selected = metricKeys(catalog, query.metricKeys);
  const report = await client.getReport({
    advertiserId: accountId,
    level,
    start: range.start,
    end: range.end,
    metrics: selected,
  });
  const previous = await client.getReport({
    advertiserId: accountId,
    level,
    start: range.previousStart,
    end: range.previousEnd,
    metrics: selected,
  });
  return buildResponse({
    network: "tiktok",
    catalog,
    rows: report.rows,
    series: report.series,
    previousRows: previous.rows,
    previousSeries: previous.series,
    currency: report.currency,
    accounts,
    accountId,
    source: "tiktok_api",
    notices,
    extras: {},
  });
}

function emptyResponse(network: Network): DataSet {
  const catalog = getCatalog(network);
  return {
    network,
    level: catalog.defaultLevel,
    currency: "USD",
    rows: [],
    totals: {},
    previousTotals: {},
    series: [],
    previousSeries: [],
    source: "demo",
    accounts: [],
    catalog,
    notices: [],
    fetchedAt: new Date().toISOString(),
  };
}

function youtubeTable(rows: Record<string, unknown>[], keys: string[], dimension: "day" | "video"): YouTubeTable {
  const columnHeaders = [
    { name: dimension, dataType: "STRING", columnType: "DIMENSION" },
    ...keys.map((name) => ({ name, dataType: "INTEGER", columnType: "METRIC" })),
  ];
  return {
    columnHeaders,
    rows: rows.map((row) => [row[dimension] as string, ...keys.map((key) => Number(row[key] ?? 0))]),
  };
}

function youtubeDemoResponse(range: DateRange, level: Level, metricKeysRequested: string[] | undefined, settings: AppSettings): DataResponse {
  const catalog = labeledCatalog("youtube", { monetized: settings.youtube.monetized, includeExperimental: true });
  const selected = metricKeys(catalog, metricKeysRequested);
  const current = demoYouTube(range);
  const previous = demoYouTube(resolveRange({ preset: "custom", start: range.previousStart, end: range.previousEnd, timezone: range.timezone }));

  const currentTable = youtubeTable(level === "video" ? current.videoTotals : current.channelRows, selected, level === "video" ? "video" : "day");
  const previousTable = youtubeTable(level === "video" ? previous.videoTotals : previous.channelRows, selected, level === "video" ? "video" : "day");

  const channelMeta = current.channel as YouTubeChannelMeta;
  const previousChannel = previous.channel as YouTubeChannelMeta;
  const videos = current.videos;
  const dailyRows = normalizeYouTubeRows(youtubeTable(current.channelRows, selected, "day"), {
    level: "channel",
    channel: channelMeta,
    videos,
    catalog,
    source: "demo",
  });
  const tableRows = level === "video"
    ? normalizeYouTubeRows(currentTable, { level: "video", channel: channelMeta, videos, catalog, source: "demo" })
    : aggregateRows(dailyRows, catalog);
  const previousRows = level === "video"
    ? normalizeYouTubeRows(previousTable, { level: "video", channel: previousChannel, videos: previous.videos, catalog, source: "demo" })
    : aggregateRows(normalizeYouTubeRows(youtubeTable(previous.channelRows, selected, "day"), { level: "channel", channel: previousChannel, videos: previous.videos, catalog, source: "demo" }), catalog);

  return buildResponse({
    network: "youtube",
    catalog,
    rows: tableRows,
    series: seriesFromRows(dailyRows, catalog),
    previousRows,
    previousSeries: seriesFromRows(normalizeYouTubeRows(youtubeTable(previous.channelRows, selected, "day"), { level: "channel", channel: previousChannel, videos: previous.videos, catalog, source: "demo" }), catalog),
    currency: "USD",
    accounts: [{ id: channelMeta.id, name: channelMeta.title, status: channelMeta.status }],
    accountId: channelMeta.id,
    source: "demo",
    notices: settings.youtube.monetized ? [] : ["Revenue metrics are hidden because this channel is not marked as monetized."],
    extras: { channel: channelMeta, videos, revenueEnabled: settings.youtube.monetized },
  });
}

async function youtubeData(query: DataQuery, settings: AppSettings, range: DateRange): Promise<DataResponse> {
  const level = query.level || "channel";
  if (settings.demoMode) {
    const response = youtubeDemoResponse(range, level, query.metricKeys, settings);
    const videoAds = demoGoogle("demo-google-1001", "video", "campaign", range);
    const videoCatalog = labeledCatalog("google-ads", { includeExperimental: true });
    const normalized = normalizeGoogleRows(videoAds.results, {
      level: "campaign",
      currency: "USD",
      catalog: videoCatalog,
      source: "demo",
    });
    response.isolated = {
      videoAds: {
        source: "google_ads_api",
        rows: aggregateRows(normalized, videoCatalog),
        totals: computeTotals(aggregateRows(normalized, videoCatalog), videoCatalog),
        currency: "USD",
        note: "This is Google Ads video campaign data. It is never combined with YouTube channel analytics.",
      },
    };
    return response;
  }

  const client = new YouTubeClient(settings);
  const catalog = labeledCatalog("youtube", { monetized: settings.youtube.monetized, includeExperimental: false });
  const selected = metricKeys(catalog, query.metricKeys);
  const report = await client.getReport({ level, start: range.start, end: range.end, metrics: selected });
  const previous = await client.getReport({ level, start: range.previousStart, end: range.previousEnd, metrics: selected });

  let breakdowns: { label: string; value: number; secondary?: number }[] = [];
  const dimension = query.dimension || "trafficSource";
  if (["country", "ageGroup", "gender", "trafficSource", "deviceType", "playbackLocation"].includes(dimension)) {
    try {
      const table = await client.getBreakdown({ start: range.start, end: range.end, dimension, metrics: [selected[0] ?? "views"] });
      const valueIndex = (table.columnHeaders ?? []).findIndex((header) => header.name === selected[0]);
      if (valueIndex >= 0) {
        breakdowns = (table.rows ?? []).slice(0, 8).map((row) => ({
          label: String(row[0] ?? "Unknown"),
          value: Number(row[valueIndex] ?? 0),
        }));
      }
    } catch {
      // The main report still works when a breakdown is not permitted.
    }
  }

  const response = buildResponse({
    network: "youtube",
    catalog,
    rows: report.rows,
    series: seriesFromRows(report.dailyRows, catalog),
    previousRows: previous.rows,
    previousSeries: seriesFromRows(previous.dailyRows, catalog),
    currency: report.currency,
    accounts: [{ id: report.channel.id, name: report.channel.title, status: report.channel.status }],
    accountId: report.channel.id,
    source: "youtube_api",
    notices: settings.youtube.monetized ? [] : ["Revenue metrics are hidden because this channel is not marked as monetized."],
    breakdowns,
    extras: { channel: report.channel, videos: report.videos, revenueEnabled: settings.youtube.monetized },
  });

  // Video ads are fetched separately through the Google Ads client and never merged.
  if (settings.googleAds.refreshToken && settings.googleAds.customerIds.length > 0) {
    try {
      const google = new GoogleAdsClient(settings);
      const videoCatalog = labeledCatalog("google-ads", { includeExperimental: true });
      const videoReport = await google.getReport({
        customerId: settings.googleAds.customerIds[0],
        level: "campaign",
        subtab: "video",
        start: range.start,
        end: range.end,
        metrics: videoCatalog.defaultMetrics,
      });
      response.isolated = {
        videoAds: {
          source: "google_ads_api",
          rows: videoReport.rows,
          totals: videoReport.totals,
          currency: videoReport.currency,
          note: "This is Google Ads video campaign data. It is never combined with YouTube channel analytics.",
        },
      };
    } catch {
      response.isolated = {
        videoAds: {
          source: "google_ads_api",
          rows: [],
          totals: {},
          note: "Connect Google Ads to see video campaign data here. It is always shown separately from YouTube analytics.",
        },
      };
    }
  }

  return response;
}

export async function getData(query: DataQuery): Promise<DataResponse> {
  const settings = await readSettings();
  const range = resolveRange({
    preset: query.preset,
    start: query.start,
    end: query.end,
    timezone: settings.timezone,
  });
  const key = [
    "data",
    query.network,
    query.section ?? "",
    query.subtab ?? "",
    query.level ?? "",
    query.accountId ?? "",
    query.platform ?? "",
    query.actionType ?? "",
    (query.metricKeys ?? []).join(","),
    range.start,
    range.end,
    settings.demoMode ? "demo" : "live",
  ].join(":");
  if (query.refresh) cacheDelete(key);

  const data = await cacheGetOrLoad(key, async () => {
    if (query.network === "google-ads") return googleData(query, settings, range);
    if (query.network === "meta") return metaData(query, settings, range);
    if (query.network === "tiktok") return tiktokData(query, settings, range);
    return youtubeData(query, settings, range);
  });
  return { ...data, range };
}

export interface OverviewNetworkSummary {
  network: "google-ads" | "meta" | "tiktok";
  label: string;
  status: "connected" | "needs_attention" | "demo" | "not_connected" | "error";
  message?: string;
  currency: string;
  totals: Record<string, number | null>;
  previousTotals: Record<string, number | null>;
  series: { date: string; metrics: Record<string, number | null> }[];
  accountId?: string;
}

export interface OverviewResponse {
  mode: "demo" | "live";
  range: DateRange;
  networks: OverviewNetworkSummary[];
  total: { available: boolean; currency: string | null; spend: number | null; reason: string };
  youtubeExcludedNote: string;
  connections: Record<string, "connected" | "needs_attention" | "demo" | "not_connected">;
}

export async function getOverview(query: { preset?: string; start?: string; end?: string; refresh?: boolean }): Promise<OverviewResponse> {
  const settings = await readSettings();
  const range = resolveRange({ preset: query.preset, start: query.start, end: query.end, timezone: settings.timezone });
  const key = `overview:${range.start}:${range.end}:${settings.demoMode ? "demo" : "live"}`;
  if (query.refresh) cacheDelete(key);

  return cacheGetOrLoad(key, async () => {
    const summaryFor = async (network: "google-ads" | "meta" | "tiktok"): Promise<OverviewNetworkSummary> => {
      try {
        const data = await getData({
          network,
          preset: "custom",
          start: range.start,
          end: range.end,
          level: "campaign",
          subtab: network === "google-ads" ? "all" : undefined,
        });
        return {
          network,
          label: data.catalog.label,
          status: settings.demoMode ? "demo" : "connected",
          currency: data.currency,
          totals: { ...data.totals, spend: data.totals.spend ?? data.totals.cost ?? null },
          previousTotals: { ...data.previousTotals, spend: data.previousTotals.spend ?? data.previousTotals.cost ?? null },
          series: data.series,
          accountId: data.accountId,
        };
      } catch (error) {
        const appError = error instanceof AppError ? error : new AppError("UNKNOWN");
        return {
          network,
          label: network === "google-ads" ? "Google Ads" : network === "meta" ? "Meta" : "TikTok",
          status: appError.code === "NOT_CONNECTED" || appError.code === "CONFIG" ? "not_connected" : "error",
          message: appError.message,
          currency: "",
          totals: {},
          previousTotals: {},
          series: [],
        };
      }
    };

    const networks = await Promise.all([summaryFor("google-ads"), summaryFor("meta"), summaryFor("tiktok")]);
    const connected = networks.filter((network) => network.status === "connected" || network.status === "demo");
    const currencies = new Set(connected.map((network) => network.currency).filter(Boolean));
    const totalAvailable = connected.length > 0 && currencies.size === 1;
    const spendValues = networks.map((network) => network.totals.spend).filter((value): value is number => typeof value === "number");
    const totalSpend = totalAvailable && spendValues.length === connected.length ? spendValues.reduce((sum, value) => sum + value, 0) : null;

    return {
      mode: settings.demoMode ? "demo" : "live",
      range,
      networks,
      total: {
        available: totalAvailable && totalSpend !== null,
        currency: totalAvailable ? [...currencies][0] : null,
        spend: totalSpend,
        reason: totalAvailable ? "All shown networks use the same currency." : "A total is only shown when every connected network uses the same currency.",
      },
      youtubeExcludedNote: "YouTube channel data is not included in these totals. YouTube's policies require it to stay separate from advertising data.",
      connections: {
        googleAds: settings.demoMode ? "demo" : connectionState(settings).googleAds ? "connected" : "not_connected",
        meta: settings.demoMode ? "demo" : connectionState(settings).meta ? "connected" : "not_connected",
        tiktok: settings.demoMode ? "demo" : connectionState(settings).tiktok ? "connected" : "not_connected",
        youtube: settings.demoMode ? "demo" : connectionState(settings).youtube ? "connected" : "not_connected",
      },
    };
  });
}
