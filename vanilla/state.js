const PREF_KEY = "kampa.prefs.v1";

function readPrefs() {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

const prefs = readPrefs();

export const store = {
  boot: null,
  settings: null,
  catalogs: {},
  tab: "overview",
  theme: "graphite",
  rangePreset: prefs.rangePreset || "last_7d",
  customStart: prefs.customStart || "",
  customEnd: prefs.customEnd || "",
  compare: prefs.compare !== false,
  reduceMotion: Boolean(prefs.reduceMotion),
  loading: {},
  errors: {},
  data: {},
  adlib: {},
  queries: {
    google: {
      subtab: prefs.googleSubtab || "search",
      level: "campaign",
      accountId: "",
      metrics: {},
    },
    meta: {
      level: "campaign",
      platform: prefs.metaPlatform || "both",
      actionType: prefs.metaActionType || "purchase",
      accountId: "",
      metrics: {},
    },
    tiktok: {
      level: "campaign",
      accountId: "",
      metrics: {},
    },
    youtube: {
      level: "channel",
      dimension: "trafficSource",
      metrics: {},
    },
  },
};

export function savePrefs(partial = {}) {
  if (partial.rangePreset) store.rangePreset = partial.rangePreset;
  if (partial.customStart !== undefined) store.customStart = partial.customStart;
  if (partial.customEnd !== undefined) store.customEnd = partial.customEnd;
  if (partial.compare !== undefined) store.compare = Boolean(partial.compare);
  if (partial.reduceMotion !== undefined) store.reduceMotion = Boolean(partial.reduceMotion);
  if (partial.googleSubtab) store.queries.google.subtab = partial.googleSubtab;
  if (partial.metaPlatform) store.queries.meta.platform = partial.metaPlatform;
  if (partial.metaActionType) store.queries.meta.actionType = partial.metaActionType;
  try {
    localStorage.setItem(
      PREF_KEY,
      JSON.stringify({
        rangePreset: store.rangePreset,
        customStart: store.customStart,
        customEnd: store.customEnd,
        compare: store.compare,
        reduceMotion: store.reduceMotion,
        googleSubtab: store.queries.google.subtab,
        metaPlatform: store.queries.meta.platform,
        metaActionType: store.queries.meta.actionType,
      }),
    );
  } catch {
    // Preferences are optional.
  }
}

export function rangeParams() {
  if (store.rangePreset === "custom" && store.customStart && store.customEnd) {
    return { preset: "custom", start: store.customStart, end: store.customEnd };
  }
  return { preset: store.rangePreset };
}

export function selectedMetrics(network, catalog, storageKey = "default") {
  const catalogKeys = new Set((catalog?.metrics || []).map((metric) => metric.key));
  const saved = store.queries[network]?.metrics?.[storageKey];
  const valid = Array.isArray(saved) ? saved.filter((key) => catalogKeys.has(key)) : [];
  if (valid.length > 0) return valid;
  return (catalog?.defaultMetrics || []).filter((key) => catalogKeys.has(key));
}

export function setSelectedMetrics(network, storageKey, keys) {
  if (!store.queries[network]) return;
  if (!store.queries[network].metrics) store.queries[network].metrics = {};
  store.queries[network].metrics[storageKey] = keys;
}

export function clearData(prefix) {
  for (const key of Object.keys(store.data)) {
    if (!prefix || key.startsWith(prefix)) delete store.data[key];
  }
}
