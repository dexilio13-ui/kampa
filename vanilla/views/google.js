import { store, savePrefs, selectedMetrics, setSelectedMetrics } from "../state.js";
import { escapeHtml, formatCurrency, metricDef, toast } from "../utils.js";
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
  statusPill,
  tableHtml,
} from "./common.js";

const SUBTABS = [
  { id: "search", label: "Search" },
  { id: "pmax", label: "PMax" },
  { id: "demand_gen", label: "Demand Gen" },
  { id: "shopping", label: "Shopping" },
  { id: "video", label: "Video" },
];

const LEVELS = {
  search: ["campaign", "ad_group", "ad", "keyword", "search_term"],
  pmax: ["campaign", "asset_group"],
  demand_gen: ["campaign", "ad_group", "ad"],
  shopping: ["campaign", "ad_group", "ad", "product"],
  video: ["campaign", "ad_group", "ad"],
};

const LEVEL_LABELS = {
  campaign: "Campaigns",
  ad_group: "Ad groups",
  ad: "Ads",
  keyword: "Keywords",
  search_term: "Search terms",
  product: "Products",
  asset_group: "Asset groups",
};

const SUBTAB_NOTES = {
  search: "Text ads on Google Search.",
  pmax: "Performance Max across Google inventory.",
  demand_gen: "Demand Gen campaigns across YouTube, Discover and Gmail.",
  shopping: "Product Shopping campaigns.",
  video: "Video campaigns run through Google Ads.",
};

const state = {
  chartMetric: "cost",
  sort: { key: "name", dir: "asc" },
};

export function renderGoogle(data, boot, options = {}) {
  if (options.loading) return loadingHtml("Reading Google Ads");
  if (options.error) return pageHeader({ eyebrow: "Google Ads", title: "Google Ads", subtitle: "Read-only campaign performance." }) + errorHtml(options.error);
  if (!data) return loadingHtml("Reading Google Ads");

  const q = store.queries.google;
  const currency = data.currency || "USD";
  const catalog = data.catalog || {};
  const metrics = data.rows?.[0]?.metrics || {};
  const chartMetric = metricDef(catalog, state.chartMetric) && metrics[state.chartMetric] !== undefined ? state.chartMetric : catalog.defaultMetrics?.[0] || "cost";
  const columns = selectedMetrics("google", catalog, `${q.subtab}:${q.level}`);
  const levels = LEVELS[q.subtab] || LEVELS.search;
  if (!levels.includes(q.level)) q.level = "campaign";
  const selectedLevel = levels.includes(q.level) ? q.level : "campaign";
  const summary = data.extras || {};
  const budgets = Array.isArray(summary.budgets) ? summary.budgets : [];
  const conversionActions = Array.isArray(summary.conversionActions) ? summary.conversionActions : [];
  const top = sortRows(data.rows || [], { key: "cost", dir: "desc" }).slice(0, 8).map((row) => ({
    label: row.name,
    value: Number(row.metrics?.cost ?? 0),
    formatted: formatCurrency(row.metrics?.cost, currency),
  }));

  const headingActions = `
    ${accountSelect(data.accounts, data.accountId, "Google Ads account")}
    <span class="source-badge">${data.source === "demo" ? "Demo" : "Google Ads API"}</span>
    <span class="source-badge">${escapeHtml(currency)}</span>
    <a class="button button-small" href="#settings" aria-label="Open Google Ads settings">Settings</a>`;

  return `${pageHeader({
    eyebrow: "Google Ads · read-only",
    title: "Search, Shopping,<br>PMax & video.",
    subtitle: `${SUBTAB_NOTES[q.subtab] || ""} All figures come from Google Ads and stay in ${currency}.`,
    actions: headingActions,
    note: true,
  })}
  ${connectionChips(boot.connections, boot.demoMode, ["googleAds"])}
  ${noticesHtml(data.notices)}

  <div class="view-toolbar">
    <div class="segmented" role="group" aria-label="Google Ads campaign types">
      ${SUBTABS.map((tab) => `<button type="button" data-google-subtab="${tab.id}" aria-pressed="${q.subtab === tab.id}">${tab.label}</button>`).join("")}
    </div>
    <div class="toolbar-controls">
      <label class="control"><span class="control-label">View</span><select data-google-level aria-label="Reporting level">${levels
        .map((level) => `<option value="${level}" ${level === selectedLevel ? "selected" : ""}>${LEVEL_LABELS[level] || level}</option>`)
        .join("")}</select></label>
      ${metricSelect(catalog, chartMetric)}
      <button type="button" data-toggle-compare aria-pressed="${store.compare}" class="button button-small">${store.compare ? "Compare on" : "Compare off"}</button>
    </div>
  </div>

  ${kpiGrid({ keys: columns, catalog, totals: data.totals, previousTotals: data.previousTotals, series: data.series, currency, compare: store.compare })}

  ${chartPanel({
    title: "Spend and performance over time",
    subtitle: `${rangeText(data.range)} · ${LEVEL_LABELS[selectedLevel] || selectedLevel}${data.accountId ? ` · ${data.accountId}` : ""}`,
    tools: `<span class="source-badge">${data.source === "demo" ? "DEMO DATA" : "LIVE"}</span>`,
    body: lineChart({ series: data.series, previousSeries: data.previousSeries, metric: chartMetric, catalog, currency, compare: store.compare }),
  })}

  <div class="two-col">
    <section class="panel">
      <div class="panel-head"><div><h2 class="panel-title">Where spend is going</h2><p class="panel-sub">Top ${LEVEL_LABELS[selectedLevel]?.toLowerCase() || "rows"} by cost.</p></div></div>
      <div class="panel-body">${barChart(top, { label: "Top rows by cost", format: (value) => formatCurrency(value, currency), limit: 8 })}</div>
    </section>
    <section class="panel">
      <div class="panel-head"><div><h2 class="panel-title">Account summary</h2><p class="panel-sub">Campaign budgets and conversion actions reported by the API.</p></div></div>
      <div class="panel-body">
        ${
          budgets.length === 0
            ? '<p class="panel-sub">No budget rows were returned. The performance metrics above are unaffected.</p>'
            : `<div class="table-wrap" style="max-height:260px"><table><thead><tr><th scope="col">Campaign</th><th scope="col">Budget</th><th scope="col">Bid strategy</th><th scope="col">Status</th></tr></thead><tbody>${budgets
                .slice(0, 12)
                .map(
                  (budget) => `<tr><td><span class="cell-name"><strong>${escapeHtml(budget.campaign || "—")}</strong></span></td><td>${escapeHtml(formatCurrency(budget.budget, currency))} / day</td><td>${escapeHtml(budget.biddingStrategy || "—")}</td><td>${statusPill(budget.status)}</td></tr>`,
                )
                .join("")}</tbody></table></div>`
        }
        ${conversionActions.length ? `<div class="scope-list" style="margin-top:12px"><span class="panel-sub" style="width:100%">Conversion actions</span>${conversionActions.map((action) => `<span class="pill">${escapeHtml(action.name)}</span>`).join("")}</div>` : ""}
      </div>
    </section>
  </div>

  <section class="panel">
    <div class="toolbar">
      <span class="toolbar-label">${data.rows?.length || 0} ${escapeHtml((LEVEL_LABELS[selectedLevel] || "rows").toLowerCase())} · ${escapeHtml(currency)}</span>
      <span class="spacer"></span>
      <button type="button" data-columns class="button button-small">Columns</button>
      <button type="button" data-export class="button button-small">Export CSV</button>
    </div>
    ${tableHtml({ rows: data.rows, columns, catalog, currency, level: selectedLevel, sort: state.sort })}
  </section>
  <p class="panel-sub" style="margin-top:8px">Read-only. AdPulse cannot change budgets, bids, campaigns or conversion actions.</p>`;
}

export function bindGoogle(root, ctx) {
  const q = store.queries.google;
  root.querySelectorAll("[data-google-subtab]").forEach((button) => {
    button.addEventListener("click", () => {
      if (q.subtab === button.dataset.googleSubtab) return;
      q.subtab = button.dataset.googleSubtab;
      q.level = "campaign";
      savePrefs({ googleSubtab: q.subtab });
      state.chartMetric = "cost";
      ctx.load();
    });
  });

  const level = root.querySelector("[data-google-level]");
  level?.addEventListener("change", () => {
    q.level = level.value;
    state.chartMetric = "cost";
    state.sort = { key: "name", dir: "asc" };
    ctx.load();
  });

  const account = root.querySelector("[data-account]");
  account?.addEventListener("change", () => {
    q.accountId = account.value;
    ctx.load();
  });

  const metric = root.querySelector("[data-chart-metric]");
  metric?.addEventListener("change", () => {
    state.chartMetric = metric.value;
    ctx.render();
  });

  root.querySelector("[data-toggle-compare]")?.addEventListener("click", () => {
    store.compare = !store.compare;
    savePrefs({ compare: store.compare });
    ctx.render();
  });

  root.querySelector("[data-columns]")?.addEventListener("click", () => {
    const data = ctx.getData();
    if (!data) return;
    const columns = selectedMetrics("google", data.catalog, `${q.subtab}:${q.level}`);
    openColumnsDialog({
      catalog: data.catalog,
      selected: columns,
      title: "Google Ads columns",
      onApply(keys) {
        setSelectedMetrics("google", `${q.subtab}:${q.level}`, keys);
        ctx.render();
        toast("Columns updated.");
      },
    });
  });

  root.querySelector("[data-export]")?.addEventListener("click", () => {
    const data = ctx.getData();
    if (!data) return;
    const columns = selectedMetrics("google", data.catalog, `${q.subtab}:${q.level}`);
    exportCsv(`adpulse-google-${q.subtab}-${q.level}.csv`, sortRows(data.rows, state.sort), columns, data.catalog, q.level);
  });

  root.querySelector('[data-action="retry"]')?.addEventListener("click", () => ctx.load());
  bindTableSort(root, state.sort, () => ctx.render());
}
