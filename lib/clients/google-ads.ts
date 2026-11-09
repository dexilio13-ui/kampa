import { apiFetch } from "../http";
import { AppError } from "../errors";
import { cacheGetOrLoad } from "../cache";
import { getCatalog } from "../catalog";
import type { AppCatalog } from "../catalog";
import type { AppSettings, Level, NormalizedRow, TimeSeriesPoint } from "../types";
import { googleAccessToken } from "./oauth";
import { normalizeGoogleRows } from "../normalize/google-ads";
import { aggregateRows, computeTotals, seriesFromRows } from "../normalize/common";
import { num, str } from "../normalize/common";

type Dict = Record<string, any>;

export interface GoogleReportResult {
  rows: NormalizedRow[];
  series: TimeSeriesPoint[];
  totals: Record<string, number | null>;
  currency: string;
  accountName: string;
  sourceCurrency: string;
}

const LEVEL_CONFIG: Record<string, { resource: string; fields: string[] }> = {
  campaign: { resource: "campaign", fields: ["campaign.id", "campaign.name", "campaign.status", "campaign.advertising_channel_type"] },
  ad_group: { resource: "ad_group", fields: ["ad_group.id", "ad_group.name", "ad_group.status", "campaign.name"] },
  ad: {
    resource: "ad_group_ad",
    fields: ["ad_group_ad.ad.id", "ad_group_ad.ad.name", "ad_group_ad.status", "campaign.name"],
  },
  keyword: {
    resource: "keyword_view",
    fields: [
      "ad_group_criterion.criterion_id",
      "ad_group_criterion.keyword.text",
      "ad_group_criterion.status",
      "ad_group_criterion.keyword.match_type",
      "campaign.name",
    ],
  },
  search_term: {
    resource: "search_term_view",
    fields: ["search_term_view.search_term", "search_term_view.search_term_match_type", "campaign.name"],
  },
  product: {
    resource: "shopping_performance_view",
    fields: [
      "segments.product_item_id",
      "segments.product_title",
      "segments.product_brand",
      "segments.product_category_level1",
      "campaign.name",
    ],
  },
  asset_group: { resource: "asset_group", fields: ["asset_group.id", "asset_group.name", "asset_group.status", "campaign.name"] },
};

const CHANNEL_FILTERS: Record<string, string> = {
  search: "SEARCH",
  pmax: "PERFORMANCE_MAX",
  demand_gen: "DEMAND_GEN",
  shopping: "SHOPPING",
  video: "VIDEO",
};

function cleanCustomerId(value: string): string {
  return value.replace(/[^0-9]/g, "");
}

function queryMetricKey(defKey: string): string {
  if (defKey === "cost") return "metrics.cost_micros";
  return `metrics.${defKey}`;
}

export class GoogleAdsClient {
  private settings: AppSettings;
  private version: string;

  constructor(settings: AppSettings) {
    this.settings = settings;
    this.version = settings.apiVersions.googleAds;
  }

  private get creds() {
    return {
      clientId: this.settings.googleAds.clientId,
      clientSecret: this.settings.googleAds.clientSecret,
      refreshToken: this.settings.googleAds.refreshToken,
    };
  }

  private assertConnected(): void {
    if (!this.settings.googleAds.developerToken || !this.settings.googleAds.refreshToken || !this.settings.googleAds.clientId || !this.settings.googleAds.clientSecret) {
      throw new AppError("NOT_CONNECTED", { provider: "google-ads" });
    }
  }

  private async headers(): Promise<Record<string, string>> {
    this.assertConnected();
    const token = await googleAccessToken(this.creds, "google-ads");
    const headers: Record<string, string> = {
      authorization: `Bearer ${token}`,
      "developer-token": this.settings.googleAds.developerToken!,
    };
    const login = cleanCustomerId(this.settings.googleAds.loginCustomerId ?? "");
    if (login) headers["login-customer-id"] = login;
    return headers;
  }

  async listAccessibleCustomers(): Promise<string[]> {
    const headers = await this.headers();
    const response = await apiFetch(`https://googleads.googleapis.com/${this.version}/customers:listAccessibleCustomers`, {
      method: "GET",
      headers,
      provider: "google-ads",
    });
    const json = response.json as { resourceNames?: string[] } | null;
    return (json?.resourceNames ?? [])
      .map((name) => name.split("/").pop() ?? "")
      .filter(Boolean);
  }

  async searchStream(customerId: string, query: string): Promise<Dict[]> {
    const headers = await this.headers();
    const id = cleanCustomerId(customerId);
    if (!id) throw new AppError("CONFIG", { provider: "google-ads", detail: "Customer ID is missing." });
    const response = await apiFetch(`https://googleads.googleapis.com/${this.version}/customers/${id}/googleAds:searchStream`, {
      method: "POST",
      headers,
      body: { query },
      provider: "google-ads",
    });
    const batches = Array.isArray(response.json) ? (response.json as Dict[]) : [];
    const results: Dict[] = [];
    for (const batch of batches) {
      if (Array.isArray(batch.results)) results.push(...batch.results);
    }
    return results;
  }

  async searchFields(query: string): Promise<Dict[]> {
    const headers = await this.headers();
    const response = await apiFetch(`https://googleads.googleapis.com/${this.version}/googleAdsFields:search`, {
      method: "POST",
      headers,
      body: { query },
      provider: "google-ads",
    });
    const json = response.json as { results?: Dict[] } | null;
    return json?.results ?? [];
  }

  /**
   * Fetches the live field catalog and hides any seed metric the account's
   * API version does not confirm. If metadata fails, only the conservative
   * default metrics remain available.
   */
  async verifiedCatalog(includeExperimental = false): Promise<{ catalog: AppCatalog; verified: boolean }> {
    const base = getCatalog("google-ads");
    try {
      const fields = await cacheGetOrLoad("google-ads:fields", async () => {
        return this.searchFields(
          "SELECT name, category, data_type, selectable_with, selectable, filterable, sortable, is_repeated WHERE name LIKE 'metrics.%'",
        );
      });
      const names = new Set(fields.map((field) => str(field.name)));
      if (names.size === 0) return { catalog: base, verified: false };
      const metrics = base.metrics.filter((metric) => names.has(metric.sourceField.replace(/^metrics\./, "")) && (includeExperimental || !metric.experimental));
      const allowed = new Set(metrics.map((metric) => metric.key));
      return {
        catalog: {
          ...base,
          metrics,
          defaultMetrics: base.defaultMetrics.filter((key) => allowed.has(key)),
        },
        verified: true,
      };
    } catch {
      const metrics = base.metrics.filter((metric) => base.defaultMetrics.includes(metric.key));
      return { catalog: { ...base, metrics, defaultMetrics: base.defaultMetrics }, verified: false };
    }
  }

  async getCustomerMeta(customerId: string): Promise<{ currency: string; name: string; timeZone: string }> {
    const id = cleanCustomerId(customerId);
    const value = await cacheGetOrLoad(`google-ads:customer:${id}`, async () => {
      const results = await this.searchStream(id, "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone FROM customer");
      const customer = results[0]?.customer ?? {};
      return {
        currency: str(customer.currencyCode, "USD"),
        name: str(customer.descriptiveName, id),
        timeZone: str(customer.timeZone, "UTC"),
      };
    });
    return value;
  }

  buildQuery(options: {
    level: Level;
    subtab: string;
    start: string;
    end: string;
    metrics: string[];
  }): string {
    const config = LEVEL_CONFIG[options.level] ?? LEVEL_CONFIG.campaign;
    const catalog = getCatalog("google-ads");
    const metricDefs = options.metrics
      .map((key) => catalog.metrics.find((metric) => metric.key === key))
      .filter((def): def is NonNullable<typeof def> => Boolean(def));
    const metricFields = [...new Set(metricDefs.map((def) => queryMetricKey(def.key)))];
    const selected = [...config.fields, "segments.date", ...metricFields];
    const filters = [`segments.date BETWEEN '${options.start}' AND '${options.end}'`];
    const channel = CHANNEL_FILTERS[options.subtab];
    if (channel && (options.level === "campaign" || options.level === "ad_group" || options.level === "ad" || options.level === "keyword" || options.level === "search_term" || options.level === "asset_group")) {
      filters.push(`campaign.advertising_channel_type = '${channel}'`);
    }
    return `SELECT ${selected.join(", ")} FROM ${config.resource} WHERE ${filters.join(" AND ")}`;
  }

  async getReport(options: {
    customerId: string;
    level: Level;
    subtab: string;
    start: string;
    end: string;
    metrics: string[];
  }): Promise<GoogleReportResult> {
    const catalog = getCatalog("google-ads");
    const meta = await this.getCustomerMeta(options.customerId);
    const query = this.buildQuery(options);
    const results = await this.searchStream(options.customerId, query);
    const daily = normalizeGoogleRows(results, {
      level: options.level,
      currency: meta.currency,
      catalog,
      source: "google_ads_api",
    });
    const rows = aggregateRows(daily, catalog);
    const series = seriesFromRows(daily, catalog);
    return {
      rows,
      series,
      totals: computeTotals(rows, catalog),
      currency: meta.currency,
      accountName: meta.name,
      sourceCurrency: meta.currency,
    };
  }

  async getAccountSummary(customerId: string): Promise<Dict> {
    const meta = await this.getCustomerMeta(customerId);
    const results = await this.searchStream(
      customerId,
      "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, campaign.id, campaign.name, campaign.status, campaign_budget.amount_micros, campaign.bidding_strategy_type FROM campaign WHERE campaign.status != 'REMOVED'",
    );
    const budgets = results.map((row) => ({
      campaign: str(row.campaign?.name),
      status: str(row.campaign?.status),
      budget: num(row.campaignBudget?.amountMicros) !== null ? (num(row.campaignBudget?.amountMicros) as number) / 1_000_000 : null,
      biddingStrategy: str(row.campaign?.biddingStrategyType),
    }));
    return {
      customer: { id: shot(customerId), name: meta.name, currencyCode: meta.currency, timeZone: meta.timeZone, status: "ENABLED" },
      budgets,
      conversionActions: [],
    };
  }
}

function shot(value: string): string {
  return cleanCustomerId(value);
}
