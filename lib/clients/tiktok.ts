import { apiFetch } from "../http";
import { AppError } from "../errors";
import { getCatalog } from "../catalog";
import type { AppSettings, Level, NormalizedRow, TimeSeriesPoint } from "../types";
import { normalizeTikTokRows } from "../normalize/tiktok";
import { aggregateRows, computeTotals, seriesFromRows, str } from "../normalize/common";
import { tiktokClientToken } from "./oauth";

type Dict = Record<string, any>;

export interface TikTokReportResult {
  rows: NormalizedRow[];
  series: TimeSeriesPoint[];
  totals: Record<string, number | null>;
  currency: string;
  advertiserName: string;
}

function dataLevel(level: Level): string {
  if (level === "account") return "AUCTION_ADVERTISER";
  if (level === "ad_group") return "AUCTION_ADGROUP";
  if (level === "ad") return "AUCTION_AD";
  return "AUCTION_CAMPAIGN";
}

function idDimension(level: Level): string {
  if (level === "account") return "advertiser_id";
  if (level === "ad_group") return "adgroup_id";
  if (level === "ad") return "ad_id";
  return "campaign_id";
}

function tiktokError(json: Dict, provider = "tiktok"): never {
  const code = Number(json?.code);
  const message = str(json?.message, "TikTok returned an error.").slice(0, 200);
  if (code === 40100 || code === 40101 || code === 40102 || code === 40104) {
    throw new AppError("AUTH", { provider, detail: message });
  }
  if (code === 40300 || code === 40301) {
    throw new AppError("PERMISSION", { provider, detail: message });
  }
  if (code === 42900) {
    throw new AppError("RATE_LIMIT", { provider, detail: message });
  }
  throw new AppError("CONFIG", { provider, detail: message });
}

export class TikTokClient {
  private settings: AppSettings;
  private version: string;
  private base: string;

  constructor(settings: AppSettings) {
    this.settings = settings;
    this.version = settings.apiVersions.tiktok;
    this.base = `https://business-api.tiktok.com/open_api/${this.version}`;
  }

  private get token(): string {
    if (!this.settings.tiktok.accessToken) {
      throw new AppError("NOT_CONNECTED", { provider: "tiktok" });
    }
    return this.settings.tiktok.accessToken;
  }

  private headers(): Record<string, string> {
    return { "Access-Token": this.token };
  }

  async getReport(options: {
    advertiserId: string;
    level: Level;
    start: string;
    end: string;
    metrics: string[];
    reportType?: string;
  }): Promise<TikTokReportResult> {
    const catalog = getCatalog("tiktok");
    const collected: Dict[] = [];
    const advertiserId = options.advertiserId.replace(/[^0-9]/g, "");
    if (!advertiserId) throw new AppError("CONFIG", { provider: "tiktok", detail: "Advertiser ID is missing." });

    for (let page = 1; page <= 20; page += 1) {
      const params = new URLSearchParams({
        advertiser_id: advertiserId,
        report_type: options.reportType || "BASIC",
        data_level: dataLevel(options.level),
        dimensions: JSON.stringify([idDimension(options.level), "stat_time_day"]),
        metrics: JSON.stringify(options.metrics),
        start_date: options.start,
        end_date: options.end,
        page: String(page),
        page_size: "1000",
      });
      const response = await apiFetch(`${this.base}/report/integrated/get/?${params.toString()}`, {
        method: "GET",
        headers: this.headers(),
        provider: "tiktok",
      });
      const json = response.json as Dict;
      if (Number(json?.code) !== 0) tiktokError(json);
      const list = json?.data?.list;
      if (Array.isArray(list)) collected.push(...list);
      const totalPage = Number(json?.data?.page_info?.total_page ?? 1);
      if (page >= totalPage || !Array.isArray(list) || list.length === 0) break;
    }

    let currency = "USD";
    let advertiserName = advertiserId;
    try {
      const info = await this.getAdvertiserInfo(advertiserId);
      currency = str(info?.currency, "USD");
      advertiserName = str(info?.advertiser_name, advertiserId);
    } catch {
      // Report data is still useful if the advertiser lookup is not permitted.
    }

    const daily = normalizeTikTokRows(collected, {
      level: options.level,
      currency,
      catalog,
      source: "tiktok_api",
    });
    const rows = aggregateRows(daily, catalog);
    return {
      rows,
      series: seriesFromRows(daily, catalog),
      totals: computeTotals(rows, catalog),
      currency,
      advertiserName,
    };
  }

  async getAdvertiserInfo(advertiserId: string): Promise<Dict> {
    const params = new URLSearchParams({ advertiser_ids: JSON.stringify([advertiserId]) });
    const response = await apiFetch(`${this.base}/advertiser/info/?${params.toString()}`, {
      method: "GET",
      headers: this.headers(),
      provider: "tiktok",
    });
    const json = response.json as Dict;
    if (Number(json?.code) !== 0) tiktokError(json);
    const list = json?.data?.list;
    return Array.isArray(list) ? list[0] : (json?.data ?? {});
  }

  async listAdvertisers(ids: string[]): Promise<{ id: string; name: string; currency: string; status: string }[]> {
    if (ids.length === 0) return [];
    const params = new URLSearchParams({ advertiser_ids: JSON.stringify(ids) });
    const response = await apiFetch(`${this.base}/advertiser/info/?${params.toString()}`, {
      method: "GET",
      headers: this.headers(),
      provider: "tiktok",
    });
    const json = response.json as Dict;
    if (Number(json?.code) !== 0) tiktokError(json);
    const list = Array.isArray(json?.data?.list) ? json.data.list : [];
    return list.map((item: Dict) => ({
      id: str(item.advertiser_id),
      name: str(item.advertiser_name, str(item.advertiser_id)),
      currency: str(item.currency, "USD"),
      status: str(item.status),
    }));
  }

  async listCampaigns(advertiserId: string): Promise<Dict[]> {
    const params = new URLSearchParams({ advertiser_id: advertiserId, page: "1", page_size: "100" });
    const response = await apiFetch(`${this.base}/campaign/get/?${params.toString()}`, {
      method: "GET",
      headers: this.headers(),
      provider: "tiktok",
    });
    const json = response.json as Dict;
    if (Number(json?.code) !== 0) tiktokError(json);
    return Array.isArray(json?.data?.list) ? json.data.list : [];
  }

  async testConnection(advertiserId: string): Promise<string> {
    const info = await this.getAdvertiserInfo(advertiserId);
    return `Connected to advertiser ${str(info.advertiser_name, advertiserId)}.`;
  }

  // ---- Public Ad Library / Commercial Content API (separate approval) ----

  private async ccToken(): Promise<string> {
    if (this.settings.tiktok.ccAccessToken) return this.settings.tiktok.ccAccessToken;
    return tiktokClientToken({
      clientKey: this.settings.tiktok.ccClientKey,
      clientSecret: this.settings.tiktok.ccClientSecret,
    });
  }

  private async ccPost(path: string, query: Record<string, string>, body: Dict): Promise<Dict> {
    const params = new URLSearchParams(query);
    const token = await this.ccToken();
    const response = await apiFetch(`https://open.tiktokapis.com/v2/research/adlib/${path}/?${params.toString()}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body,
      provider: "tiktok",
    });
    const json = response.json as Dict;
    const code = json?.error?.code;
    if (code && code !== "ok" && Number(json?.error?.http_status_code ?? 200) >= 400) {
      throw new AppError("PERMISSION", { provider: "tiktok", detail: str(json.error.message).slice(0, 200) });
    }
    return json;
  }

  async adDetail(adId: string): Promise<Dict> {
    const fields = [
      "ad.id",
      "ad.first_shown_date",
      "ad.last_shown_date",
      "ad.status",
      "ad.status_statement",
      "ad.videos",
      "ad.image_urls",
      "ad.reach",
      "ad.title",
      "ad.external_url",
      "ad.download_url",
      "ad.call_to_action",
      "ad.advertising_objective",
      "advertiser.country_code",
      "advertiser.business_id",
      "advertiser.business_name",
      "advertiser.paid_for_by",
      "advertiser.follower_count",
      "advertiser.avatar_url",
      "advertiser.profile_url",
      "ad_group.targeting_info",
      "ad.rejection_info",
    ].join(",");
    const numeric = adId.replace(/[^0-9]/g, "");
    if (!numeric) throw new AppError("CONFIG", { provider: "tiktok", detail: "A numeric ad ID is required." });
    return this.ccPost("ad/detail", { fields }, { ad_id: Number(numeric) });
  }

  async adQuery(filters: { min: string; max: string; country?: string; status?: string }): Promise<Dict> {
    const fields = "ad.id,ad.first_shown_date,ad.last_shown_date,ad.status,ad.title,ad.videos,ad.image_urls,ad.reach,advertiser.business_id,advertiser.business_name,advertiser.country_code";
    return this.ccPost(
      "ad/query",
      { fields },
      {
        filters: {
          ad_published_date_range: { min: filters.min, max: filters.max },
          ...(filters.country ? { country_code_list: [filters.country] } : {}),
          ...(filters.status ? { ad_status: filters.status } : {}),
        },
      },
    );
  }

  async advertiserQuery(searchTerm: string): Promise<Dict> {
    return this.ccPost("advertiser/query", { fields: "business_id,business_name,country_code" }, { search_term: searchTerm, max_count: 25 });
  }

  async adReport(min: string, max: string): Promise<Dict> {
    return this.ccPost(
      "ad/report",
      { fields: "count_time_series_by_country" },
      { filters: { ad_published_date_range: { min, max } } },
    );
  }
}
