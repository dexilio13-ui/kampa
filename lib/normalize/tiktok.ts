import type { AppCatalog } from "../catalog";
import type { DataSource, Level, NormalizedRow } from "../types";
import { mergeDims, num, slug, str } from "./common";

type Dict = Record<string, any>;

function tiktokLevel(level: Level): "advertiser" | "campaign" | "adgroup" | "ad" {
  if (level === "ad_group") return "adgroup";
  if (level === "account") return "advertiser";
  if (level === "campaign" || level === "ad") return level;
  return "campaign";
}

export function normalizeTikTokRows(
  list: Dict[],
  options: { level: Level; currency: string; catalog: AppCatalog; source: DataSource },
): NormalizedRow[] {
  const level = tiktokLevel(options.level);
  const rows: NormalizedRow[] = [];

  for (const item of list) {
    const dimsRaw: Dict = item.dimensions ?? {};
    const metricsRaw: Dict = item.metrics ?? {};

    const id =
      level === "advertiser"
        ? str(dimsRaw.advertiser_id)
        : level === "campaign"
          ? str(dimsRaw.campaign_id)
          : level === "adgroup"
            ? str(dimsRaw.adgroup_id)
            : str(dimsRaw.ad_id);

    const name =
      level === "advertiser"
        ? str(metricsRaw.advertiser_name, str(dimsRaw.advertiser_id, "Advertiser"))
        : level === "campaign"
          ? str(metricsRaw.campaign_name, str(dimsRaw.campaign_id, "Campaign"))
          : level === "adgroup"
            ? str(metricsRaw.adgroup_name, str(dimsRaw.adgroup_id, "Ad group"))
            : str(metricsRaw.ad_name, str(dimsRaw.ad_id, "Ad"));

    const metrics: Record<string, number | null> = {};
    for (const def of options.catalog.metrics) {
      metrics[def.key] = num(metricsRaw[def.sourceField]);
    }

    rows.push({
      network: "tiktok",
      level: options.level,
      id: id || slug(name),
      name,
      status: str(metricsRaw.status ?? dimsRaw.status),
      date: str(dimsRaw.stat_time_day) || undefined,
      dims: mergeDims(dimsRaw, {
        campaign: metricsRaw.campaign_name,
        ad_group: metricsRaw.adgroup_name,
        ad: metricsRaw.ad_name,
      }),
      metrics,
      currency: str(metricsRaw.currency, options.currency || "USD"),
      source: options.source,
    });
  }

  return rows;
}

export function dailyTikTokSeries(rows: NormalizedRow[]): { date: string; metrics: Record<string, number | null> }[] {
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
