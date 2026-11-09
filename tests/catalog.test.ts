import { describe, expect, it } from "vitest";
import { catalogSummaries, getCatalog, labeledCatalog } from "../lib/catalog";
import type { Network } from "../lib/types";

const NETWORKS: Network[] = ["google-ads", "meta", "tiktok", "youtube"];
const DOC_HOSTS: Record<Network, RegExp> = {
  "google-ads": /^https:\/\/developers\.google\.com\/google-ads\//,
  meta: /^https:\/\/developers\.facebook\.com\//,
  tiktok: /^https:\/\/business-api\.tiktok\.com\//,
  youtube: /^https:\/\/developers\.google\.com\/youtube\//,
};

describe("metric catalogs", () => {
  for (const network of NETWORKS) {
    it(`${network} has unique keys, defaults, levels and official docs`, () => {
      const catalog = getCatalog(network);
      const keys = catalog.metrics.map((metric) => metric.key);
      expect(new Set(keys).size).toBe(keys.length);
      expect(catalog.defaultMetrics.length).toBeGreaterThan(0);
      for (const key of catalog.defaultMetrics) {
        expect(keys).toContain(key);
      }
      for (const metric of catalog.metrics) {
        expect(metric.label.length).toBeGreaterThan(1);
        expect(metric.description.length).toBeGreaterThan(10);
        expect(metric.docUrl).toMatch(DOC_HOSTS[network]);
        expect(metric.levels.length).toBeGreaterThan(0);
        expect(catalog.levels.map((level) => level.key)).toEqual(expect.arrayContaining(metric.levels));
      }
      const summary = catalogSummaries().find((item) => item.network === network);
      expect(summary?.metricCount).toBe(catalog.metrics.length);
    });
  }

  it("marks YouTube revenue metrics as requiring monetization and hides them when not monetized", () => {
    const full = getCatalog("youtube");
    const revenue = full.metrics.filter((metric) => metric.group === "Revenue");
    expect(revenue.length).toBeGreaterThan(0);
    expect(revenue.every((metric) => metric.requiresMonetization === true)).toBe(true);
    const hidden = labeledCatalog("youtube", { monetized: false, includeExperimental: false });
    expect(hidden.metrics.some((metric) => metric.requiresMonetization)).toBe(false);
    const shown = labeledCatalog("youtube", { monetized: true, includeExperimental: false });
    expect(shown.metrics.some((metric) => metric.requiresMonetization)).toBe(true);
  });

  it("only marks monetary fields as micros", () => {
    for (const metric of getCatalog("google-ads").metrics.filter((item) => item.micros)) {
      expect(["currency"]).toContain(metric.format);
    }
  });

  it("does not include YouTube metrics in advertising catalogs", () => {
    for (const network of ["google-ads", "meta", "tiktok"] as Network[]) {
      const keys = getCatalog(network).metrics.map((metric) => metric.key);
      expect(keys).not.toContain("estimatedMinutesWatched");
      expect(keys).not.toContain("subscribersGained");
    }
  });
});
