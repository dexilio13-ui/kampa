import { api } from "../api.js";
import { store, savePrefs, selectedMetrics, setSelectedMetrics } from "../state.js";
import { escapeHtml, formatCurrency, toast } from "../utils.js";
import { lineChart, barChart } from "../charts.js";
import {
  accountSelect,
  bindTableSort,
  chartPanel,
  connectionChips,
  errorHtml,
  exportCsv,
  kpiGrid,
  loadingHtml,
  metricSelect,
  noticesHtml,
  openColumnsDialog,
  pageHeader,
  rangeText,
  sortRows,
  tableHtml,
} from "./common.js";

const LEVELS = [
  { key: "account", label: "Advertiser" },
  { key: "campaign", label: "Campaigns" },
  { key: "ad_group", label: "Ad groups" },
  { key: "ad", label: "Ads" },
];

const state = {
  chartMetric: "spend",
  sort: { key: "name", dir: "asc" },
  adlibLoaded: false,
};

export function renderTikTok(data, boot, options = {}) {
  if (options.loading) return loadingHtml("Reading TikTok");
  if (options.error) return pageHeader({ eyebrow: "TikTok", title: "TikTok", subtitle: "Read-only campaign performance." }) + errorHtml(options.error);
  if (!data) return loadingHtml("Reading TikTok");

  const q = store.queries.tiktok;
  const currency = data.currency || "USD";
  const catalog = data.catalog || {};
  const chartMetric = catalog.metrics?.some((metric) => metric.key === state.chartMetric) ? state.chartMetric : "spend";
  const columns = selectedMetrics("tiktok", catalog, q.level);
  const top = sortRows(data.rows || [], { key: "spend", dir: "desc" })
    .slice(0, 8)
    .map((row) => ({ label: row.name, value: Number(row.metrics?.spend ?? 0) }));
  const reportTypes = Array.isArray(data.extras?.reportTypes) ? data.extras.reportTypes : [];

  return `${pageHeader({
    eyebrow: "TikTok · raw and monochrome",
    title: "Short video.<br>Sharp numbers.",
    subtitle: `Performance from the TikTok Marketing API, in ${currency}. No colour, no decoration, no write access.`,
    actions: `${accountSelect(data.accounts, data.accountId, "TikTok advertiser")}
      <span class="source-badge">${data.source === "demo" ? "Demo" : "TikTok API"}</span>
      <span class="source-badge">${escapeHtml(currency)}</span>
      <a class="button button-small" href="#settings">Settings</a>`,
    note: true,
  })}
  ${connectionChips(boot.connections, boot.demoMode, ["tiktok"])}
  ${noticesHtml(data.notices)}

  <div class="view-toolbar">
    <div class="segmented" role="group" aria-label="TikTok reporting level">
      ${LEVELS.map((level) => `<button type="button" data-tiktok-level="${level.key}" aria-pressed="${q.level === level.key}">${level.label}</button>`).join("")}
    </div>
    <div class="toolbar-controls">
      ${metricSelect(catalog, chartMetric)}
      <button type="button" data-toggle-compare aria-pressed="${store.compare}" class="button button-small">${store.compare ? "Compare on" : "Compare off"}</button>
      <button type="button" data-refresh class="button button-small">Refresh</button>
    </div>
  </div>

  ${kpiGrid({ keys: columns, catalog, totals: data.totals, previousTotals: data.previousTotals, series: data.series, currency, compare: store.compare })}

  ${chartPanel({
    title: "Performance over time",
    subtitle: `${rangeText(data.range)} · ${LEVELS.find((level) => level.key === q.level)?.label || q.level}`,
    tools: `<span class="source-badge">${data.source === "demo" ? "DEMO DATA" : "LIVE"}</span>`,
    body: lineChart({ series: data.series, previousSeries: data.previousSeries, metric: chartMetric, catalog, currency, compare: store.compare }),
  })}

  <div class="two-col">
    <section class="panel">
      <div class="panel-head"><div><h2 class="panel-title">Largest rows by spend</h2><p class="panel-sub">Monochrome by design. Values stay exact.</p></div></div>
      <div class="panel-body">${barChart(top, { label: "TikTok rows by spend", format: (value) => formatCurrency(value, currency), limit: 8 })}</div>
    </section>
    <section class="panel">
      <div class="panel-head"><div><h2 class="panel-title">Reporting coverage</h2><p class="panel-sub">Report types exposed by this integration.</p></div></div>
      <div class="panel-body">
        <div class="scope-list">${(reportTypes.length ? reportTypes : ["BASIC", "AUDIENCE", "PLAYABLE_MATERIAL", "CATALOG"]).map((type) => `<span class="pill">${escapeHtml(type)}</span>`).join("")}</div>
        <p class="panel-sub" style="margin-top:12px">Live report types depend on the permissions granted to your TikTok developer app. Only the BASE report is assumed by default.</p>
      </div>
    </section>
  </div>

  <section class="panel">
    <div class="toolbar">
      <span class="toolbar-label">${data.rows?.length || 0} rows · ${escapeHtml(currency)}</span>
      <span class="spacer"></span>
      <button type="button" data-columns class="button button-small">Columns</button>
      <button type="button" data-export class="button button-small">Export CSV</button>
    </div>
    ${tableHtml({ rows: data.rows, columns, catalog, currency, level: q.level, sort: state.sort })}
  </section>

  <details class="adlib" data-adlib>
    <summary><span aria-hidden="true">◇</span> Public Ad Library <span class="pill">Optional · EU/EEA, GB, CH</span></summary>
    <div class="adlib-body">
      <p class="panel-sub">A separate public transparency dataset from TikTok's Commercial Content API. It is never mixed with your advertising performance, and it contains no spend, clicks or conversions. Access requires separate TikTok approval.</p>
      <div data-adlib-content>${state.adlibLoaded ? "" : '<p class="panel-sub">Open this section to load public ads.</p>'}</div>
    </div>
  </details>

  <p class="panel-sub" style="margin-top:8px">Read-only. AdPulse cannot create, edit, pause or delete TikTok campaigns.</p>`;
}

function adCard(record) {
  const ad = record?.ad || {};
  const advertiser = record?.advertiser || {};
  const targeting = record?.ad_group?.targeting_info || {};
  const countries = Array.isArray(targeting.country) ? targeting.country.join(", ") : "";
  const ages = targeting.age ? Object.entries(targeting.age).filter(([, value]) => value).map(([key]) => key).join(", ") : "";
  return `<article class="adlib-card">
    <h3>${escapeHtml(ad.title || "Untitled public ad")}</h3>
    <div class="adlib-meta">
      <span>${escapeHtml(advertiser.business_name || "Unknown advertiser")}</span>
      <span>${escapeHtml(ad.status || "")}</span>
      <span>${escapeHtml(ad.first_shown_date || "")}${ad.last_shown_date ? ` – ${escapeHtml(ad.last_shown_date)}` : ""}</span>
    </div>
    <div class="adlib-meta">
      <span>Reach: ${escapeHtml(ad.reach?.unique_users_seen || "not disclosed")}</span>
      <span>${escapeHtml(ad.call_to_action || "")}</span>
    </div>
    <div class="adlib-target">${countries ? `Countries: ${escapeHtml(countries)}` : "Targeting not disclosed"}${ages ? ` · Ages: ${escapeHtml(ages)}` : ""}${targeting.number_of_users_targeted ? ` · Audience: ${escapeHtml(targeting.number_of_users_targeted)}` : ""}</div>
  </article>`;
}

function renderAdlib(payload) {
  const data = payload?.data || payload;
  const ads = Array.isArray(data?.ads) ? data.ads : [];
  if (ads.length === 0) {
    return `<p class="panel-sub">No public ads were returned for this query. ${escapeHtml(data?.note || "")}</p>`;
  }
  return `<p class="panel-sub">${escapeHtml(data?.note || "Public transparency data only.")}</p>
    <div class="adlib-grid">${ads.map(adCard).join("")}</div>`;
}

export function bindTikTok(root, ctx) {
  const q = store.queries.tiktok;

  root.querySelectorAll("[data-tiktok-level]").forEach((button) => {
    button.addEventListener("click", () => {
      if (q.level === button.dataset.tiktokLevel) return;
      q.level = button.dataset.tiktokLevel;
      state.sort = { key: "name", dir: "asc" };
      ctx.load();
    });
  });

  root.querySelector("[data-account]")?.addEventListener("change", (event) => {
    q.accountId = event.target.value;
    ctx.load();
  });

  root.querySelector("[data-chart-metric]")?.addEventListener("change", (event) => {
    state.chartMetric = event.target.value;
    ctx.render();
  });

  root.querySelector("[data-toggle-compare]")?.addEventListener("click", () => {
    store.compare = !store.compare;
    savePrefs({ compare: store.compare });
    ctx.render();
  });

  root.querySelector("[data-refresh]")?.addEventListener("click", () => ctx.refresh());

  root.querySelector("[data-columns]")?.addEventListener("click", () => {
    const data = ctx.getData();
    if (!data) return;
    const columns = selectedMetrics("tiktok", data.catalog, q.level);
    openColumnsDialog({
      catalog: data.catalog,
      selected: columns,
      title: "TikTok columns",
      onApply(keys) {
        setSelectedMetrics("tiktok", q.level, keys);
        ctx.render();
        toast("Columns updated.");
      },
    });
  });

  root.querySelector("[data-export]")?.addEventListener("click", () => {
    const data = ctx.getData();
    if (!data) return;
    const columns = selectedMetrics("tiktok", data.catalog, q.level);
    exportCsv(`adpulse-tiktok-${q.level}.csv`, sortRows(data.rows, state.sort), columns, data.catalog, q.level);
  });

  const adlib = root.querySelector("[data-adlib]");
  adlib?.addEventListener("toggle", async () => {
    if (!adlib.open || state.adlibLoaded) return;
    const content = adlib.querySelector("[data-adlib-content]");
    content.innerHTML = '<p class="panel-sub" role="status">Loading public ads…</p>';
    try {
      const payload = await api.adlib({ action: "query" });
      state.adlibLoaded = true;
      content.innerHTML = renderAdlib(payload);
    } catch (error) {
      content.innerHTML = `<div class="error-state" role="alert"><h3>Ad Library unavailable</h3><p>${escapeHtml(error.message)}</p><p class="how-to">${escapeHtml(error.hint || "The Commercial Content API requires separate TikTok approval.")}</p></div>`;
    }
  });

  root.querySelector('[data-action="retry"]')?.addEventListener("click", () => ctx.load());
  bindTableSort(root, state.sort, () => ctx.render());
}
