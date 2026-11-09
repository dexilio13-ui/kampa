import { apiFetch } from "../http";
import { AppError } from "../errors";
import { getCatalog } from "../catalog";
import type { AppCatalog } from "../catalog";
import type { AppSettings, Level, NormalizedRow, TimeSeriesPoint } from "../types";
import { normalizeMetaRows } from "../normalize/meta";
import { aggregateRows, computeTotals, seriesFromRows, str } from "../normalize/common";

type Dict = Record<string, any>;

export interface MetaReportResult {
  rows: NormalizedRow[];
  series: TimeSeriesPoint[];
  totals: Record<string, number | null>;
  currency: string;
  accountName: string;
}

const CORE_FIELDS = [
  "account_id",
  "account_name",
  "account_currency",
  "campaign_id",
  "campaign_name",
  "adset_id",
  "adset_name",
  "ad_id",
  "ad_name",
  "date_start",
  "date_stop",
];

// Objective, budget and status live on campaign objects, not on Insights rows.
// Keeping them out of the Insights field list avoids inventing unsupported fields.

function apiLevel(level: Level): "account" | "campaign" | "adset" | "ad" {
  if (level === "ad_group") return "adset";
  if (level === "account" || level === "campaign" || level === "ad") return level;
  return "campaign";
}

function stripToken(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete("access_token");
    return parsed.toString();
  } catch {
    return url;
  }
}

function throttled(headers: Headers): boolean {
  const raw = headers.get("x-fb-ads-insights-throttle");
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const values = Object.values(parsed).filter((value): value is number => typeof value === "number");
    return values.some((value) => value >= 90);
  } catch {
    return false;
  }
}

export class MetaClient {
  private settings: AppSettings;
  private version: string;

  constructor(settings: AppSettings) {
    this.settings = settings;
    this.version = settings.apiVersions.meta;
  }

  private get token(): string {
    if (!this.settings.meta.accessToken) {
      throw new AppError("NOT_CONNECTED", { provider: "meta" });
    }
    return this.settings.meta.accessToken;
  }

  private headers(): Record<string, string> {
    return { authorization: `Bearer ${this.token}` };
  }

  async listAccounts(): Promise<{ id: string; name: string; currency: string; status: string }[]> {
    const collected: Dict[] = [];
    let url: string | null = `https://graph.facebook.com/${this.version}/me/adaccounts?fields=account_id,name,currency,account_status&limit=100`;
    let pages = 0;
    while (url && pages < 10) {
      const response = await apiFetch(url, { method: "GET", headers: this.headers(), provider: "meta" });
      const json = response.json as Dict;
      if (json?.error) throw new AppError("PERMISSION", { provider: "meta", detail: str(json.error.message).slice(0, 200) });
      if (Array.isArray(json?.data)) collected.push(...json.data);
      url = json?.paging?.next ? stripToken(str(json.paging.next)) : null;
      pages += 1;
    }
    return collected.map((account) => ({
      id: str(account.id, `act_${account.account_id}`),
      name: str(account.name, str(account.account_id)),
      currency: str(account.currency, "USD"),
      status: str(account.account_status),
    }));
  }

  private buildFields(metrics: string[], catalog: AppCatalog): string[] {
    const fields = new Set(CORE_FIELDS);
    for (const key of metrics) {
      const def = catalog.metrics.find((metric) => metric.key === key);
      if (def) fields.add(def.sourceField);
    }
    if (metrics.includes("actions")) {
      fields.add("actions");
      fields.add("action_values");
    }
    return [...fields];
  }

  async getInsights(options: {
    accountId: string;
    level: Level;
    start: string;
    end: string;
    metrics: string[];
    platform: "facebook" | "instagram" | "both";
    actionType?: string;
    daily?: boolean;
  }): Promise<MetaReportResult> {
    const catalog = getCatalog("meta");
    const accountId = options.accountId.replace(/[^0-9]/g, "");
    if (!accountId) throw new AppError("CONFIG", { provider: "meta", detail: "Ad account ID is missing." });

    const fields = this.buildFields(options.metrics, catalog);
    const base = new URLSearchParams({
      level: apiLevel(options.level),
      fields: fields.join(","),
      time_range: JSON.stringify({ since: options.start, until: options.end }),
      time_increment: "1",
      limit: "500",
      action_attribution_windows: JSON.stringify(["7d_click", "1d_view"]),
    });
    if (options.platform !== "both") base.set("breakdowns", JSON.stringify(["publisher_platform"]));

    let rows: Dict[] = [];
    let currency = "USD";
    let accountName = accountId;

    try {
      rows = await this.paginateInsights(accountId, base);
    } catch (error) {
      // Some accounts reject very wide field sets. Retry with only the core metrics.
      if (error instanceof AppError && (error.code === "CONFIG" || error.code === "PERMISSION")) {
        const fallback = new URLSearchParams(base);
        fallback.set("fields", this.buildFields(catalog.defaultMetrics, catalog).join(","));
        rows = await this.paginateInsights(accountId, fallback);
      } else {
        throw error;
      }
    }

    if (rows.length === 0 && process.env.META_ASYNC_ENABLED === "true" && options.daily === false) {
      rows = await this.runAsync(accountId, base);
    }

    if (rows.length > 0) {
      currency = str(rows[0].account_currency, "USD");
      accountName = str(rows[0].account_name, accountId);
    }

    const daily = normalizeMetaRows(rows, {
      level: options.level,
      currency,
      catalog,
      source: "meta_api",
      actionType: options.actionType,
      platform: options.platform,
    });
    const table = aggregateRows(daily, catalog);
    return {
      rows: table,
      series: seriesFromRows(daily, catalog),
      totals: computeTotals(table, catalog),
      currency,
      accountName,
    };
  }

  private async paginateInsights(accountId: string, params: URLSearchParams): Promise<Dict[]> {
    const collected: Dict[] = [];
    let url: string | null = `https://graph.facebook.com/${this.version}/act_${accountId}/insights?${params.toString()}`;
    let pages = 0;
    while (url && pages < 25) {
      const response = await apiFetch(url, { method: "GET", headers: this.headers(), provider: "meta" });
      const json = response.json as Dict;
      if (json?.error) {
        const code = Number(json.error.code);
        throw new AppError(code === 190 ? "AUTH" : code === 200 || code === 10 ? "PERMISSION" : "CONFIG", {
          provider: "meta",
          detail: str(json.error.message).slice(0, 200),
        });
      }
      if (Array.isArray(json?.data)) collected.push(...json.data);
      if (throttled(response.headers)) {
        throw new AppError("RATE_LIMIT", { provider: "meta", detail: "Meta's insights throttle is nearly used up." });
      }
      url = json?.paging?.next ? stripToken(str(json.paging.next)) : null;
      pages += 1;
    }
    return collected;
  }

  /** Experimental: async report jobs are permitted by the product spec, but off by default. */
  private async runAsync(accountId: string, params: URLSearchParams): Promise<Dict[]> {
    const body = new URLSearchParams(params);
    const submit = await apiFetch(`https://graph.facebook.com/${this.version}/act_${accountId}/insights`, {
      method: "POST",
      headers: { ...this.headers(), "content-type": "application/x-www-form-urlencoded" },
      body,
      provider: "meta",
      retryPost: false,
    });
    const runId = str((submit.json as Dict)?.report_run_id);
    if (!runId) return [];

    for (let attempt = 0; attempt < 12; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      const status = await apiFetch(
        `https://graph.facebook.com/${this.version}/${runId}?fields=async_status,async_percent_completion`,
        { method: "GET", headers: this.headers(), provider: "meta" },
      );
      const statusJson = status.json as Dict;
      if (statusJson?.async_status === "Job Completed") break;
      if (statusJson?.async_status === "Job Failed" || statusJson?.async_status === "Job Timeout") {
        throw new AppError("UNAVAILABLE", { provider: "meta", detail: "The Meta report job did not finish." });
      }
    }

    return this.paginateRun(runId);
  }

  private async paginateRun(runId: string): Promise<Dict[]> {
    const collected: Dict[] = [];
    let url: string | null = `https://graph.facebook.com/${this.version}/${runId}/insights?limit=500`;
    let pages = 0;
    while (url && pages < 25) {
      const response = await apiFetch(url, { method: "GET", headers: this.headers(), provider: "meta" });
      const json = response.json as Dict;
      if (Array.isArray(json?.data)) collected.push(...json.data);
      url = json?.paging?.next ? stripToken(str(json.paging.next)) : null;
      pages += 1;
    }
    return collected;
  }

  async getPlacementBreakdown(accountId: string, start: string, end: string): Promise<Dict[]> {
    const id = accountId.replace(/[^0-9]/g, "");
    const params = new URLSearchParams({
      level: "account",
      fields: "impressions,clicks,spend,ctr,cpm",
      time_range: JSON.stringify({ since: start, until: end }),
      breakdowns: JSON.stringify(["publisher_platform"]),
      limit: "100",
    });
    const response = await apiFetch(`https://graph.facebook.com/${this.version}/act_${id}/insights?${params.toString()}`, {
      method: "GET",
      headers: this.headers(),
      provider: "meta",
    });
    const json = response.json as Dict;
    if (json?.error) throw new AppError("PERMISSION", { provider: "meta", detail: str(json.error.message).slice(0, 180) });
    return Array.isArray(json?.data) ? json.data : [];
  }

  async getCampaignObjects(accountId: string): Promise<Dict[]> {
    const id = accountId.replace(/[^0-9]/g, "");
    const response = await apiFetch(
      `https://graph.facebook.com/${this.version}/act_${id}/campaigns?fields=id,name,effective_status,objective,daily_budget,lifetime_budget,bid_strategy&limit=200`,
      { method: "GET", headers: this.headers(), provider: "meta" },
    );
    const json = response.json as Dict;
    return Array.isArray(json?.data) ? json.data : [];
  }

  async testConnection(accountId: string): Promise<string> {
    const id = accountId.replace(/[^0-9]/g, "");
    const response = await apiFetch(
      `https://graph.facebook.com/${this.version}/act_${id}/campaigns?fields=name&limit=1`,
      { method: "GET", headers: this.headers(), provider: "meta" },
    );
    const json = response.json as Dict;
    if (json?.error) throw new AppError("PERMISSION", { provider: "meta", detail: str(json.error.message).slice(0, 180) });
    return `Connected to ad account ${id}.`;
  }
}
