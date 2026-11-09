import { describe, expect, it } from "vitest";
import { getCatalog } from "../lib/catalog";
import { aggregateRows, computeTotals, seriesFromRows } from "../lib/normalize/common";
import { normalizeGoogleRows } from "../lib/normalize/google-ads";
import { normalizeMetaRows } from "../lib/normalize/meta";
import { normalizeTikTokRows } from "../lib/normalize/tiktok";
import { normalizeYouTubeRows } from "../lib/normalize/youtube";

describe("Google Ads normalization", () => {
  const catalog = getCatalog("google-ads");
  const row = {
    campaign: { id: "1", name: "Brand", status: "ENABLED" },
    segments: { date: "2026-11-01", device: "MOBILE" },
    metrics: {
      impressions: 1000,
      clicks: 50,
      cost_micros: 2_500_000,
      ctr: 0.05,
      average_cpc: 500_000,
      conversions: 5,
    },
  };

  it("converts micros and percent fractions", () => {
    const [normalized] = normalizeGoogleRows([row], {
      level: "campaign",
      currency: "EUR",
      catalog,
      source: "google_ads_api",
    });
    expect(normalized.currency).toBe("EUR");
    expect(normalized.metrics.cost).toBe(2.5);
    expect(normalized.metrics.average_cpc).toBe(0.5);
    expect(normalized.metrics.ctr).toBe(5);
    expect(normalized.id).toBe("1");
    expect(normalized.name).toBe("Brand");
    expect(normalized.date).toBe("2026-11-01");
  });

  it("recomputes ratios after aggregation instead of summing them", () => {
    const second = { ...row, campaign: { id: "1", name: "Brand", status: "ENABLED" }, metrics: { ...row.metrics, impressions: 1000, clicks: 150, cost_micros: 2_500_000, ctr: 0.15 } };
    const daily = normalizeGoogleRows([row, second], { level: "campaign", currency: "USD", catalog, source: "demo" });
    const aggregated = aggregateRows(daily, catalog);
    expect(aggregated).toHaveLength(1);
    expect(aggregated[0].metrics.impressions).toBe(2000);
    expect(aggregated[0].metrics.clicks).toBe(200);
    expect(aggregated[0].metrics.ctr).toBe(10);
    expect(aggregated[0].metrics.cost).toBe(5);
    const totals = computeTotals(aggregated, catalog);
    expect(totals.ctr).toBe(10);
    const series = seriesFromRows(daily, catalog);
    expect(series).toHaveLength(1);
    expect(series[0].metrics.ctr).toBe(10);
  });
});

describe("Meta normalization", () => {
  const catalog = getCatalog("meta");
  const row = {
    account_id: "act_1",
    account_name: "Demo",
    account_currency: "USD",
    campaign_id: "c1",
    campaign_name: "Prospecting",
    date_start: "2026-11-01",
    publisher_platform: "instagram",
    impressions: "1000",
    clicks: "25",
    spend: "50",
    ctr: "2.5",
    actions: [
      { action_type: "purchase", value: "4" },
      { action_type: "lead", value: "9" },
    ],
    action_values: [{ action_type: "purchase", value: "320" }],
    cost_per_action_type: [{ action_type: "purchase", value: "12.5" }],
    purchase_roas: [{ action_type: "omni_purchase", value: "6.4" }],
  };

  it("parses the selected action type without inventing values", () => {
    const [normalized] = normalizeMetaRows([row], {
      level: "campaign",
      currency: "USD",
      catalog,
      source: "meta_api",
      actionType: "purchase",
      platform: "instagram",
    });
    expect(normalized.metrics.impressions).toBe(1000);
    expect(normalized.metrics.actions).toBe(4);
    expect(normalized.metrics.action_values).toBe(320);
    expect(normalized.metrics.cost_per_action_type).toBe(12.5);
    expect(normalized.metrics.purchase_roas).toBe(6.4);
    expect(normalized.metrics.ctr).toBe(2.5);
    expect(normalized.dims.platform).toBe("instagram");
  });

  it("filters other platforms when a single-platform view is requested", () => {
    const facebook = { ...row, publisher_platform: "facebook" };
    const instagramRows = normalizeMetaRows([facebook], {
      level: "campaign",
      currency: "USD",
      catalog,
      source: "meta_api",
      platform: "instagram",
    });
    expect(instagramRows).toHaveLength(0);
  });

  it("does not invent an action value if the type is absent", () => {
    const [normalized] = normalizeMetaRows(
      [{ ...row, actions: [{ action_type: "lead", value: "9" }] }],
      { level: "campaign", currency: "USD", catalog, source: "meta_api", actionType: "purchase" },
    );
    expect(normalized.metrics.actions).toBeNull();
  });
});

describe("TikTok normalization", () => {
  const catalog = getCatalog("tiktok");
  it("maps advertiser fields and daily dimensions", () => {
    const [normalized] = normalizeTikTokRows(
      [
        {
          dimensions: { campaign_id: "tc1", stat_time_day: "2026-11-01" },
          metrics: { campaign_name: "Spark Ads", spend: "42.5", impressions: "1000", clicks: "20", ctr: "2", conversion: "3", currency: "GBP" },
        },
      ],
      { level: "campaign", currency: "USD", catalog, source: "tiktok_api" },
    );
    expect(normalized.id).toBe("tc1");
    expect(normalized.name).toBe("Spark Ads");
    expect(normalized.currency).toBe("GBP");
    expect(normalized.date).toBe("2026-11-01");
    expect(normalized.metrics.spend).toBe(42.5);
    expect(normalized.metrics.conversion).toBe(3);
  });
});

describe("YouTube normalization", () => {
  const catalog = getCatalog("youtube");
  it("normalizes only YouTube table columns and keeps the channel separate", () => {
    const table = {
      columnHeaders: [
        { name: "day", dataType: "STRING", columnType: "DIMENSION" },
        { name: "views", dataType: "INTEGER", columnType: "METRIC" },
        { name: "estimatedMinutesWatched", dataType: "INTEGER", columnType: "METRIC" },
      ],
      rows: [["2026-11-01", 120, 40]],
    };
    const [normalized] = normalizeYouTubeRows(table, {
      level: "channel",
      channel: { id: "UC1", title: "Channel" },
      catalog,
      source: "youtube_api",
    });
    expect(normalized.network).toBe("youtube");
    expect(normalized.id).toBe("UC1");
    expect(normalized.metrics.views).toBe(120);
    expect(normalized.metrics.estimatedMinutesWatched).toBe(40);
    expect(normalized.metrics).not.toHaveProperty("cost");
    expect(normalized.date).toBe("2026-11-01");
  });

  it("does not guess a video title that the API did not return", () => {
    const table = {
      columnHeaders: [
        { name: "video", columnType: "DIMENSION" },
        { name: "views", columnType: "METRIC" },
      ],
      rows: [["vid-1", 10]],
    };
    const [normalized] = normalizeYouTubeRows(table, {
      level: "video",
      channel: { id: "UC1", title: "Channel" },
      videos: [],
      catalog,
      source: "youtube_api",
    });
    expect(normalized.name).toBe("vid-1");
    expect(normalized.dims.video).toBe("vid-1");
  });
});
