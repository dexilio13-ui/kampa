import type { Catalog, MetricDef, Network } from "../types";
import googleAdsRaw from "./google-ads.json";
import metaRaw from "./meta.json";
import tiktokRaw from "./tiktok.json";
import youtubeRaw from "./youtube.json";

export interface AppCatalog extends Catalog {
  actionTypes?: string[];
  metrics: (MetricDef & { requiresMonetization?: boolean })[];
}

const CATALOGS: Record<Network, AppCatalog> = {
  "google-ads": googleAdsRaw as unknown as AppCatalog,
  meta: metaRaw as unknown as AppCatalog,
  tiktok: tiktokRaw as unknown as AppCatalog,
  youtube: youtubeRaw as unknown as AppCatalog,
};

export function getCatalog(network: Network): AppCatalog {
  return CATALOGS[network];
}

export function getMetric(network: Network, key: string): MetricDef | undefined {
  return getCatalog(network).metrics.find((metric) => metric.key === key);
}

export function labeledCatalog(network: Network, options: { monetized?: boolean; includeExperimental?: boolean } = {}): AppCatalog {
  const catalog = getCatalog(network);
  const metrics = catalog.metrics.filter((metric) => {
    if (network === "youtube" && metric.requiresMonetization && !options.monetized) return false;
    if (metric.experimental && !options.includeExperimental) return false;
    return true;
  });
  const allowed = new Set(metrics.map((metric) => metric.key));
  return {
    ...catalog,
    metrics,
    defaultMetrics: catalog.defaultMetrics.filter((key) => allowed.has(key)),
  };
}

export function catalogSummaries() {
  return (Object.keys(CATALOGS) as Network[]).map((network) => {
    const catalog = CATALOGS[network];
    return {
      network,
      label: catalog.label,
      metricCount: catalog.metrics.length,
      dimensionCount: catalog.dimensions.length,
    };
  });
}

export const METRIC_FORMAT_VALUES = ["currency", "percent", "number", "duration", "text"] as const;
