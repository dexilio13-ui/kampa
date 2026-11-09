import { beforeAll, describe, expect, it, vi } from "vitest";
import path from "node:path";
import os from "node:os";
import { cacheClear } from "../lib/cache";
import { getData, getOverview } from "../lib/data";

beforeAll(() => {
  vi.stubEnv("KAMPA_SETTINGS_FILE", path.join(os.tmpdir(), `kampa-test-${Date.now()}`, "missing.json"));
  vi.stubEnv("APP_SECRET", "");
  cacheClear();
});

describe("demo data path", () => {
  it("serves Google Ads through the normalizer with converted micros", async () => {
    const data = await getData({ network: "google-ads", preset: "last_7d", subtab: "search", level: "campaign" });
    expect(data.source).toBe("demo");
    expect(data.currency).toBe("USD");
    expect(data.rows.length).toBeGreaterThan(0);
    expect(data.totals.cost).toBeGreaterThan(0);
    expect(data.rows[0].metrics.cost).toBeLessThan(100_000);
    expect(data.rows[0].metrics.ctr).toBeGreaterThan(0);
    expect(data.rows[0].metrics.ctr).toBeLessThan(100);
    expect(data.catalog.metrics.length).toBeGreaterThan(5);
    expect(data.range?.preset).toBe("last_7d");
    expect(data.series.length).toBe(7);
  });

  it("serves Meta with platform and action filtering", async () => {
    const meta = await getData({ network: "meta", preset: "last_7d", level: "campaign", platform: "instagram", actionType: "purchase" });
    expect(meta.source).toBe("demo");
    expect(meta.rows.length).toBeGreaterThan(0);
    expect(meta.totals.spend).toBeGreaterThan(0);
    expect(meta.breakdowns?.length).toBeGreaterThan(0);
    expect(meta.rows.every((row) => row.network === "meta")).toBe(true);
  });

  it("serves TikTok and its separate public Ad Library section", async () => {
    const tiktok = await getData({ network: "tiktok", preset: "last_7d", level: "campaign" });
    expect(tiktok.source).toBe("demo");
    expect(tiktok.rows.length).toBeGreaterThan(0);
    expect(tiktok.totals.spend).toBeGreaterThan(0);

    const adlib = await getData({ network: "tiktok", section: "adlib", preset: "last_7d" });
    expect(adlib.source).toBe("tiktok_adlib");
    expect(adlib.isolated).toBeTruthy();
    expect(adlib.totals).toEqual({});
  });

  it("serves YouTube channel analytics and isolated Google Ads video data", async () => {
    const youtube = await getData({ network: "youtube", preset: "last_7d", level: "channel", dimension: "trafficSource" });
    expect(youtube.source).toBe("demo");
    expect(youtube.network).toBe("youtube");
    expect(youtube.rows.length).toBeGreaterThan(0);
    expect(youtube.totals.views).toBeGreaterThan(0);
    expect(youtube.totals).not.toHaveProperty("cost");
    expect(youtube.extras?.channel).toBeTruthy();
    expect(youtube.isolated?.videoAds).toBeTruthy();
    const videoAds = youtube.isolated?.videoAds as { rows: unknown[]; totals: Record<string, number | null> };
    expect(videoAds.rows.length).toBeGreaterThan(0);
    expect(videoAds.totals.cost).toBeGreaterThan(0);
  });

  it("keeps every produced number finite or null", async () => {
    const data = await getData({ network: "google-ads", preset: "last_7d", subtab: "shopping", level: "product" });
    for (const row of data.rows) {
      for (const value of Object.values(row.metrics)) {
        expect(value === null || typeof value === "string" || Number.isFinite(value)).toBe(true);
      }
    }
  });
});

describe("overview boundaries", () => {
  it("includes the three advertising networks and excludes YouTube", async () => {
    const overview = await getOverview({ preset: "last_7d" });
    expect(overview.mode).toBe("demo");
    expect(overview.networks.map((network) => network.network).sort()).toEqual(["google-ads", "meta", "tiktok"]);
    expect(overview.networks.some((network) => (network.network as string) === "youtube")).toBe(false);
    expect(overview.youtubeExcludedNote).toMatch(/never|not included|separate/i);
    expect(overview.total.available).toBe(true);
    expect(overview.total.currency).toBe("USD");
    expect(overview.total.spend).toBeGreaterThan(0);
  });

  it("reports demo connections without pretending to be live", async () => {
    const overview = await getOverview({ preset: "last_7d" });
    expect(overview.connections.googleAds).toBe("demo");
    expect(overview.connections.youtube).toBe("demo");
  });

  it("never adds YouTube views to advertising spend or impressions", async () => {
    const [overview, youtube] = await Promise.all([
      getOverview({ preset: "last_7d" }),
      getData({ network: "youtube", preset: "last_7d", level: "channel" }),
    ]);
    const advertisingImpressions = overview.networks.reduce((sum, network) => sum + Number(network.totals.impressions ?? 0), 0);
    expect(advertisingImpressions).toBeGreaterThan(0);
    expect(overview.total.spend).toBeLessThan(advertisingImpressions);
    expect(youtube.totals.views).toBeGreaterThan(0);
    expect(overview.total.spend).not.toBe(youtube.totals.views);
  });
});
