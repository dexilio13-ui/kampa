import { apiFetch } from "../http";
import { AppError } from "../errors";
import { getCatalog } from "../catalog";
import type { AppSettings, Level, NormalizedRow } from "../types";
import { googleAccessToken } from "./oauth";
import { normalizeYouTubeRows, type YouTubeChannelMeta, type YouTubeTable, type YouTubeVideoMeta } from "../normalize/youtube";
import { aggregateRows, computeTotals, str } from "../normalize/common";

type Dict = Record<string, any>;

const REVENUE_METRICS = new Set([
  "estimatedRevenue",
  "estimatedAdRevenue",
  "grossRevenue",
  "cpm",
  "adImpressions",
  "monetizedPlaybacks",
  "playbackBasedCpm",
]);

export interface YouTubeReportResult {
  rows: NormalizedRow[];
  dailyRows: NormalizedRow[];
  totals: Record<string, number | null>;
  channel: YouTubeChannelMeta & { subscriberCount?: number; viewCount?: number; videoCount?: number };
  videos: YouTubeVideoMeta[];
  table: YouTubeTable;
  currency: string;
}

export class YouTubeClient {
  private settings: AppSettings;

  constructor(settings: AppSettings) {
    this.settings = settings;
  }

  private get creds() {
    return {
      clientId: this.settings.youtube.clientId,
      clientSecret: this.settings.youtube.clientSecret,
      refreshToken: this.settings.youtube.refreshToken,
    };
  }

  private assertConnected(): void {
    if (!this.settings.youtube.refreshToken || !this.settings.youtube.clientId || !this.settings.youtube.clientSecret) {
      throw new AppError("NOT_CONNECTED", { provider: "youtube" });
    }
  }

  private async headers(): Promise<Record<string, string>> {
    this.assertConnected();
    const token = await googleAccessToken(this.creds, "youtube");
    return { authorization: `Bearer ${token}` };
  }

  private selectableMetrics(level: Level, requested: string[]): string[] {
    const catalog = getCatalog("youtube");
    return requested.filter((key) => {
      const def = catalog.metrics.find((metric) => metric.key === key);
      if (!def) return false;
      if (!def.levels.includes(level)) return false;
      if (REVENUE_METRICS.has(key) && !this.settings.youtube.monetized) return false;
      return true;
    });
  }

  async getChannel(): Promise<YouTubeChannelMeta & { subscriberCount?: number; viewCount?: number; videoCount?: number }> {
    const headers = await this.headers();
    const response = await apiFetch("https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true", {
      method: "GET",
      headers,
      provider: "youtube",
    });
    const json = response.json as Dict;
    if (json?.error) throw new AppError("PERMISSION", { provider: "youtube", detail: str(json.error.message).slice(0, 200) });
    const item = Array.isArray(json?.items) ? json.items[0] : null;
    if (!item) throw new AppError("NOT_FOUND", { provider: "youtube", detail: "No YouTube channel is linked to this account." });
    return {
      id: str(item.id),
      title: str(item.snippet?.title, "YouTube channel"),
      status: str(item.status?.privacyStatus, "public"),
      subscriberCount: Number(item.statistics?.subscriberCount ?? 0),
      viewCount: Number(item.statistics?.viewCount ?? 0),
      videoCount: Number(item.statistics?.videoCount ?? 0),
    };
  }

  async getVideos(ids: string[]): Promise<YouTubeVideoMeta[]> {
    if (ids.length === 0) return [];
    const headers = await this.headers();
    const results: YouTubeVideoMeta[] = [];
    for (let index = 0; index < ids.length; index += 50) {
      const batch = ids.slice(index, index + 50);
      const response = await apiFetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet,status&id=${encodeURIComponent(batch.join(","))}`,
        { method: "GET", headers, provider: "youtube" },
      );
      const json = response.json as Dict;
      if (Array.isArray(json?.items)) {
        for (const item of json.items) {
          results.push({
            id: str(item.id),
            title: str(item.snippet?.title, "Video"),
            status: str(item.status?.privacyStatus),
            publishedAt: str(item.snippet?.publishedAt),
          });
        }
      }
    }
    return results;
  }

  async analytics(options: {
    start: string;
    end: string;
    metrics: string[];
    dimensions?: string[];
    sort?: string;
    maxResults?: number;
    filters?: string;
    currency?: string;
  }): Promise<YouTubeTable> {
    const headers = await this.headers();
    const metrics = this.selectableMetrics(options.dimensions?.includes("video") ? "video" : "channel", options.metrics);
    if (metrics.length === 0) {
      throw new AppError("CONFIG", { provider: "youtube", detail: "No YouTube metrics are available for this selection." });
    }
    const collected: (string | number)[][] = [];
    let columnHeaders: YouTubeTable["columnHeaders"] = [];
    const pageSize = Math.min(200, options.maxResults ?? 200);

    for (let startIndex = 1; startIndex <= 5_000; startIndex += pageSize) {
      const params = new URLSearchParams({
        ids: "channel==MINE",
        startDate: options.start,
        endDate: options.end,
        metrics: metrics.join(","),
        maxResults: String(pageSize),
        startIndex: String(startIndex),
      });
      if (options.dimensions?.length) params.set("dimensions", options.dimensions.join(","));
      if (options.sort) params.set("sort", options.sort);
      if (options.filters) params.set("filters", options.filters);
      if (options.currency) params.set("currency", options.currency);

      const response = await apiFetch(`https://youtubeanalytics.googleapis.com/v2/reports?${params.toString()}`, {
        method: "GET",
        headers,
        provider: "youtube",
      });
      const json = response.json as Dict;
      if (json?.error) {
        const reason = str(json.error.errors?.[0]?.reason);
        throw new AppError(reason === "quotaExceeded" ? "RATE_LIMIT" : "PERMISSION", {
          provider: "youtube",
          detail: str(json.error.message).slice(0, 200),
        });
      }
      if (Array.isArray(json?.columnHeaders)) columnHeaders = json.columnHeaders;
      const rows = Array.isArray(json?.rows) ? json.rows : [];
      collected.push(...rows);
      if (rows.length < pageSize) break;
    }

    return { columnHeaders, rows: collected };
  }

  async getReport(options: {
    level: Level;
    start: string;
    end: string;
    metrics: string[];
  }): Promise<YouTubeReportResult> {
    const channel = await this.getChannel();
    const metrics = this.selectableMetrics(options.level, options.metrics);
    const currency = "USD";
    const [dailyTable, videoTable] = await Promise.all([
      this.analytics({
        start: options.start,
        end: options.end,
        metrics,
        dimensions: ["day"],
        currency: this.settings.youtube.monetized ? currency : undefined,
      }),
      options.level === "video"
        ? this.analytics({
            start: options.start,
            end: options.end,
            metrics,
            dimensions: ["video"],
            sort: "-views",
            maxResults: 25,
          })
        : Promise.resolve({ columnHeaders: [], rows: [] } as YouTubeTable),
    ]);

    const videoIds = new Set<string>();
    for (const row of videoTable.rows ?? []) {
      if (row[0] !== undefined) videoIds.add(String(row[0]));
    }
    for (const row of dailyTable.rows ?? []) {
      const index = (dailyTable.columnHeaders ?? []).findIndex((header) => header.name === "video");
      if (index >= 0 && row[index] !== undefined) videoIds.add(String(row[index]));
    }
    const videos = await this.getVideos([...videoIds].slice(0, 50));

    const dailyRows = normalizeYouTubeRows(dailyTable, {
      level: "channel",
      channel,
      videos,
      catalog: getCatalog("youtube"),
      source: "youtube_api",
      currency,
    });

    const table = options.level === "video" ? videoTable : dailyTable;
    const rows = normalizeYouTubeRows(table, {
      level: options.level,
      channel,
      videos,
      catalog: getCatalog("youtube"),
      source: "youtube_api",
      currency,
    });

    const tableRows = options.level === "video" ? rows : aggregateRows(dailyRows, getCatalog("youtube"));
    return {
      rows: tableRows,
      dailyRows,
      totals: computeTotals(tableRows, getCatalog("youtube")),
      channel,
      videos,
      table,
      currency,
    };
  }

  async getBreakdown(options: { start: string; end: string; dimension: string; metrics: string[] }): Promise<YouTubeTable> {
    const allowed = new Set(["country", "ageGroup", "gender", "trafficSource", "deviceType", "playbackLocation"]);
    if (!allowed.has(options.dimension)) {
      throw new AppError("CONFIG", { provider: "youtube", detail: "Unknown YouTube breakdown." });
    }
    const metrics = this.selectableMetrics("channel", options.metrics);
    return this.analytics({
      start: options.start,
      end: options.end,
      metrics,
      dimensions: [options.dimension],
      sort: `-${metrics[0]}`,
      maxResults: 100,
    });
  }

  async revoke(): Promise<void> {
    if (!this.settings.youtube.refreshToken) return;
    const { revokeGoogleToken } = await import("./oauth");
    await revokeGoogleToken(this.settings.youtube.refreshToken);
  }
}
