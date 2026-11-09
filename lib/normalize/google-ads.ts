import type { AppCatalog } from "../catalog";
import type { DataSource, Level, NormalizedRow } from "../types";
import { mergeDims, num, slug, str } from "./common";

type Dict = Record<string, any>;

function nested(row: Dict, path: string): unknown {
  return path.split(".").reduce<any>((value, key) => (value == null ? undefined : value[key]), row);
}

function displayFor(row: Dict, level: Level): { id: string; name: string; status: string } {
  switch (level) {
    case "campaign": {
      const campaign = row.campaign ?? {};
      return { id: str(campaign.id), name: str(campaign.name, "Campaign"), status: str(campaign.status) };
    }
    case "ad_group": {
      const group = row.adGroup ?? {};
      return { id: str(group.id), name: str(group.name, "Ad group"), status: str(group.status) };
    }
    case "ad": {
      const adGroupAd = row.adGroupAd ?? {};
      const ad = adGroupAd.ad ?? {};
      return { id: str(ad.id ?? adGroupAd.resourceName), name: str(ad.name, "Ad"), status: str(adGroupAd.status) };
    }
    case "keyword": {
      const criterion = row.adGroupCriterion ?? {};
      const keyword = criterion.keyword?.text ?? criterion.criterionId;
      return { id: str(criterion.criterionId ?? keyword), name: str(keyword, "Keyword"), status: str(criterion.status) };
    }
    case "search_term": {
      const view = row.searchTermView ?? {};
      const term = str(view.searchTerm, "Search term");
      return { id: slug(term), name: term, status: str(view.searchTermMatchType) };
    }
    case "product": {
      const product = row.shoppingPerformanceView ?? row.product ?? {};
      const title = product.productTitle ?? product.title;
      return { id: str(product.productId ?? product.itemId ?? title), name: str(title, "Product"), status: str(product.status) };
    }
    case "asset_group": {
      const group = row.assetGroup ?? {};
      return { id: str(group.id), name: str(group.name, "Asset group"), status: str(group.status) };
    }
    default:
      return { id: "", name: "Row", status: "" };
  }
}

export function normalizeGoogleRows(
  results: Dict[],
  options: { level: Level; currency: string; catalog: AppCatalog; source: DataSource; date?: string },
): NormalizedRow[] {
  const rows: NormalizedRow[] = [];
  for (const row of results) {
    const display = displayFor(row, options.level);
    const rawMetrics: Dict = row.metrics ?? {};
    const metrics: Record<string, number | null> = {};

    for (const def of options.catalog.metrics) {
      const sourceKey = def.sourceField.replace(/^metrics\./, "");
      let value = num(rawMetrics[sourceKey]);
      if (sourceKey === "cost_micros") {
        value = value === null ? null : value / 1_000_000;
      } else if ((def as any).micros) {
        value = value === null ? null : value / 1_000_000;
      } else if (def.format === "percent" && value !== null) {
        value = value * 100;
      }
      metrics[def.key] = value;
    }

    const segments = row.segments ?? {};
    const date = options.date ?? (str(segments.date) || undefined);
    const dims = mergeDims(segments, {
      campaign: row.campaign?.name,
      ad_group: row.adGroup?.name,
      ad: row.adGroupAd?.ad?.name,
      keyword: row.adGroupCriterion?.keyword?.text,
      search_term: row.searchTermView?.searchTerm,
      device: segments.device,
      network: segments.adNetworkType,
    });

    rows.push({
      network: "google-ads",
      level: options.level,
      id: display.id || slug(display.name),
      name: display.name,
      status: display.status,
      date,
      dims,
      metrics,
      currency: options.currency,
      source: options.source,
    });
  }
  return rows;
}

/** Sum additive metrics for a daily series. Ratios are recomputed by computeTotals. */
export function dailyGoogleSeries(rows: NormalizedRow[]): { date: string; metrics: Record<string, number | null> }[] {
  const byDate = new Map<string, NormalizedRow[]>();
  for (const row of rows) {
    if (!row.date) continue;
    const list = byDate.get(row.date) ?? [];
    list.push(row);
    byDate.set(row.date, list);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, list]) => {
      const metrics: Record<string, number | null> = {};
      for (const key of Object.keys(list[0]?.metrics ?? {})) {
        let total = 0;
        let any = false;
        for (const row of list) {
          const value = row.metrics[key];
          if (typeof value === "number") {
            total += value;
            any = true;
          }
        }
        metrics[key] = any ? total : null;
      }
      return { date, metrics };
    });
}

export function googleRawField(row: Dict, path: string): unknown {
  return nested(row, path);
}
