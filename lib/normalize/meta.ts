import type { AppCatalog } from "../catalog";
import type { DataSource, Level, NormalizedRow } from "../types";
import { actionValueOrFirst, mergeDims, num, parseActionValue, slug, str } from "./common";

type Dict = Record<string, any>;

function metaLevel(level: Level): "account" | "campaign" | "adset" | "ad" {
  if (level === "ad_group") return "adset";
  if (level === "account" || level === "campaign" || level === "ad") return level;
  return "campaign";
}

export function normalizeMetaRows(
  data: Dict[],
  options: {
    level: Level;
    currency: string;
    catalog: AppCatalog;
    source: DataSource;
    actionType?: string;
    platform?: "facebook" | "instagram" | "both";
  },
): NormalizedRow[] {
  const rows: NormalizedRow[] = [];
  const level = metaLevel(options.level);

  for (const item of data) {
    const platform = str(item.publisher_platform).toLowerCase();
    if (options.platform === "facebook" && platform && platform !== "facebook") continue;
    if (options.platform === "instagram" && platform && platform !== "instagram") continue;

    const id =
      level === "account"
        ? str(item.account_id)
        : level === "campaign"
          ? str(item.campaign_id)
          : level === "adset"
            ? str(item.adset_id)
            : str(item.ad_id);
    const name =
      level === "account"
        ? str(item.account_name, item.account_id)
        : level === "campaign"
          ? str(item.campaign_name, item.campaign_id)
          : level === "adset"
            ? str(item.adset_name, item.adset_id)
            : str(item.ad_name, item.ad_id);

    let status = "";
    if (item.effective_status) status = str(item.effective_status);
    else if (item.status) status = str(item.status);

    const metrics: Record<string, number | string | null> = {};
    for (const def of options.catalog.metrics) {
      if (def.format === "text") {
        metrics[def.key] = item[def.sourceField] ? str(item[def.sourceField]) : null;
      } else if (def.actionField) {
        const actionType = options.actionType || "purchase";
        if (def.key === "purchase_roas") {
          metrics[def.key] = parseActionValue(item[def.sourceField], "omni_purchase") ?? actionValueOrFirst(item[def.sourceField], actionType);
        } else if (def.key === "video_thruplay_watched_actions") {
          metrics[def.key] = actionValueOrFirst(item[def.sourceField], "video_view");
        } else if (def.key.startsWith("video_")) {
          metrics[def.key] = actionValueOrFirst(item[def.sourceField], "video_view");
        } else {
          metrics[def.key] = parseActionValue(item[def.sourceField], actionType);
        }
      } else {
        metrics[def.key] = num(item[def.sourceField]);
      }
    }

    const dims = mergeDims(
      {
        platform: item.publisher_platform,
        placement: item.platform_position,
        device: item.device_platform,
        age: item.age,
        gender: item.gender,
        country: item.country,
      },
      {
        campaign: item.campaign_name,
        ad_set: item.adset_name,
        ad: item.ad_name,
      },
    );

    rows.push({
      network: "meta",
      level: options.level,
      id: id || slug(name),
      name: name || "Untitled",
      status,
      date: str(item.date_start) || undefined,
      dims,
      metrics,
      currency: str(item.account_currency, options.currency || "USD"),
      source: options.source,
    });
  }

  return rows;
}

/** Meta returns one row per time increment. Build a daily series from date_start. */
export function dailyMetaSeries(rows: NormalizedRow[]): { date: string; metrics: Record<string, number | null> }[] {
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
