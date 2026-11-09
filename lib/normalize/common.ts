import type { AppCatalog } from "../catalog";
import type { NormalizedRow } from "../types";

export function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function str(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

export function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80) || "row";
}

export function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function parseActionValue(
  actions: unknown,
  actionType: string,
): number | null {
  if (!Array.isArray(actions)) return null;
  const match = actions.find((item) => {
    if (!item || typeof item !== "object") return false;
    const record = item as Record<string, unknown>;
    return record.action_type === actionType || record.action_type === `offsite_conversion.fb_pixel_${actionType}`;
  });
  if (!match) return null;
  return num((match as Record<string, unknown>).value);
}

export function actionValueOrFirst(actions: unknown, actionType?: string): number | null {
  if (!Array.isArray(actions)) return null;
  if (actionType) {
    const picked = parseActionValue(actions, actionType);
    if (picked !== null) return picked;
  }
  const first = actions.find((item) => item && typeof item === "object" && num((item as Record<string, unknown>).value) !== null);
  return first ? num((first as Record<string, unknown>).value) : null;
}

const RATE_FORMULAS: Record<string, (m: Record<string, number | null>) => number | null> = {
  ctr: (m) => ratio(m.clicks, m.impressions, 100),
  inline_link_click_ctr: (m) => ratio(m.inline_link_clicks, m.impressions, 100),
  average_cpc: (m) => ratio(m.cost, m.clicks),
  cpc: (m) => ratio(m.cost, m.clicks),
  average_cpm: (m) => ratio(m.cost, m.impressions, 1000),
  cpm: (m) => ratio(m.cost, m.impressions, 1000),
  cpp: (m) => ratio(m.cost, m.reach, 1000),
  cost_per_conversion: (m) => ratio(m.cost, m.conversions ?? m.conversion),
  cost_per_action_type: (m) => ratio(m.cost, m.actions),
  conversion_rate: (m) => ratio(m.conversions ?? m.conversion, m.clicks, 100),
  video_view_rate: (m) => ratio(m.video_views, m.impressions, 100),
  frequency: (m) => ratio(m.impressions, m.reach),
  average_view_duration: (m) => ratio(m.estimatedMinutesWatched ? m.estimatedMinutesWatched * 60 : null, m.views),
  averageViewDuration: (m) => ratio(m.estimatedMinutesWatched ? m.estimatedMinutesWatched * 60 : null, m.views),
};

export function ratio(numerator: number | null | undefined, denominator: number | null | undefined, scale = 1): number | null {
  if (numerator === null || numerator === undefined || !denominator) return null;
  return round((numerator / denominator) * scale, 4);
}

export function deriveMetric(
  key: string,
  metrics: Record<string, number | null>,
  catalog: AppCatalog,
): number | null {
  const def = catalog.metrics.find((metric) => metric.key === key);
  if (!def) return null;
  if (def.format === "text") return null;
  if (def.format === "percent" || def.format === "duration") {
    const formula = RATE_FORMULAS[key];
    return formula ? formula(metrics) : null;
  }
  const value = metrics[key];
  return typeof value === "number" ? value : null;
}

export function additiveMetrics(rows: NormalizedRow[], catalog: AppCatalog): Record<string, number | null> {
  const metrics: Record<string, number | null> = {};
  const keys = new Set<string>();
  for (const row of rows) for (const key of Object.keys(row.metrics)) keys.add(key);

  for (const key of keys) {
    const def = catalog.metrics.find((metric) => metric.key === key);
    if (!def || def.format === "percent" || def.format === "duration" || def.format === "text") {
      metrics[key] = null;
      continue;
    }
    let sum = 0;
    let any = false;
    for (const row of rows) {
      const value = row.metrics[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        sum += value;
        any = true;
      }
    }
    metrics[key] = any ? round(sum, 4) : null;
  }
  return metrics;
}

export function aggregateRows(rows: NormalizedRow[], catalog: AppCatalog): NormalizedRow[] {
  const groups = new Map<string, NormalizedRow[]>();
  for (const row of rows) {
    const key = `${row.level}:${row.id}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  return [...groups.values()].map((list) => {
    const base = list[0];
    const metrics: Record<string, number | string | null> = {};
    const additive = additiveMetrics(list, catalog);
    const keys = new Set<string>();
    for (const row of list) for (const key of Object.keys(row.metrics)) keys.add(key);
    for (const key of keys) {
      metrics[key] = deriveMetric(key, additive, catalog);
    }
    return {
      ...base,
      date: undefined,
      dims: list.reduce<Record<string, string | number | null>>((acc, row) => ({ ...acc, ...row.dims }), {}),
      metrics,
    };
  });
}

export function seriesFromRows(
  rows: NormalizedRow[],
  catalog: AppCatalog,
): { date: string; metrics: Record<string, number | null> }[] {
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
      const additive = additiveMetrics(list, catalog);
      const metrics: Record<string, number | null> = {};
      for (const key of Object.keys(additive)) {
        metrics[key] = deriveMetric(key, additive, catalog);
      }
      return { date, metrics };
    });
}

export function computeTotals(
  rows: NormalizedRow[],
  catalog: AppCatalog,
): Record<string, number | null> {
  const totals: Record<string, number | null> = {};
  const keys = new Set<string>();
  for (const row of rows) for (const key of Object.keys(row.metrics)) keys.add(key);

  for (const key of keys) {
    const def = catalog.metrics.find((metric) => metric.key === key);
    if (!def || def.format === "text") {
      totals[key] = null;
      continue;
    }

    if (def.format === "currency" || def.format === "number") {
      let sum = 0;
      let any = false;
      for (const row of rows) {
        const value = row.metrics[key];
        if (typeof value === "number" && Number.isFinite(value)) {
          sum += value;
          any = true;
        }
      }
      totals[key] = any ? round(sum, 4) : null;
      continue;
    }

    if (def.format === "duration") {
      const formula = RATE_FORMULAS[key];
      totals[key] = formula ? formula(totals) : null;
      continue;
    }

    if (def.format === "percent") {
      const formula = RATE_FORMULAS[key];
      totals[key] = formula ? formula(totals) : null;
      continue;
    }

    totals[key] = null;
  }

  return totals;
}

export function mergeDims(...sources: (Record<string, unknown> | undefined)[]): Record<string, string | number | null> {
  const dims: Record<string, string | number | null> = {};
  for (const source of sources) {
    if (!source) continue;
    for (const [key, value] of Object.entries(source)) {
      if (value === null || value === undefined) continue;
      if (typeof value === "string" || typeof value === "number") {
        dims[key] = value;
      } else if (typeof value === "object") {
        const record = value as Record<string, unknown>;
        if (typeof record.value === "string" || typeof record.value === "number") {
          dims[key] = record.value;
        } else if (typeof record.name === "string") {
          dims[key] = record.name;
        }
      }
    }
  }
  return dims;
}
