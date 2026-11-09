import { store, savePrefs, selectedMetrics, setSelectedMetrics } from "../state.js";
import { escapeHtml, formatCurrency, toast } from "../utils.js";
import { lineChart, donutChart, barChart } from "../charts.js";
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

const LEVELS = [
  { key: "account", label: "Account" },
  { key: "campaign", label: "Campaigns" },
  { key: "ad_group", label: "Ad sets" },
  { key: "ad", label: "Ads" },
];

const ACTION_TYPES = [
  { key: "purchase", label: "Purchases" },
  { key: "lead", label: "Leads" },
  { key: "link_click", label: "Link clicks" },
  { key: "landing_page_view", label: "Landing page views" },
  { key: "add_to_cart", label: "Adds to cart" },
  { key: "initiate_checkout", label: "Checkouts started" },
  { key: "complete_registration", label: "Registrations" },
  { key: "onsite_conversion.messaging_conversation_started_7d", label: "Messaging conversations" },
];

const state = {
  chartMetric: "spend",
  sort: { key: "name", dir: "asc" },
};

export function renderMeta(data, boot, options = {}) {
  if (options.loading) return loadingHtml("Reading Meta");
  if (options.error) return pageHeader({ eyebrow: "Meta", title: "Meta", subtitle: "Read-only campaign performance." }) + errorHtml(options.error);
  if (!data) return loadingHtml("Reading Meta");

  const q = store.queries.meta;
  const currency = data.currency || "USD";
  const catalog = data.catalog || {};
  const chartMetric = catalog.metrics?.some((metric) => metric.key === state.chartMetric) ? state.chartMetric : "spend";
  const columns = selectedMetrics("meta", catalog, `${q.platform}:${q.level}`);
  const objects = Array.isArray(data.extras?.objects) ? data.extras.objects : [];
  const placements = Array.isArray(data.breakdowns) ? data.breakdowns : [];
  const top = sortRows(data.rows || [], { key: "spend", dir: "desc" })
    .slice(0, 7)
    .map((row) => ({ label: row.name, value: Number(row.metrics?.spend ?? 0) }));

  return `${pageHeader({
    eyebrow: "Meta · Facebook & Instagram",
    title: "Social performance,<br>without the noise.",
    subtitle: `Campaign, ad set and ad insights from the Meta Marketing API. Everything is shown in ${currency}.`,
    actions: `${accountSelect(data.accounts, data.accountId, "Meta ad account")}
      <span class="source-badge">${data.source === "demo" ? "Demo" : "Meta API"}</span>
      <span class="source-badge">${escapeHtml(currency)}</span>
      <a class="button button-small" href="#settings">Settings</a>`,
    note: true,
  })}
  ${connectionChips(boot.connections, boot.demoMode, ["meta"])}
  ${noticesHtml(data.notices)}

  <div class="view-toolbar">
    <div class="segmented" role="group" aria-label="Meta platform">
      ${[
        { key: "both", label: "Both" },
        { key: "facebook", label: "Facebook" },
        { key: "instagram", label: "Instagram" },
      ]
        .map((option) => `<button type="button" data-meta-platform="${option.key}" aria-pressed="${q.platform === option.key}">${option.label}</button>`)
        .join("")}
    </div>
    <div class="toolbar-controls">
      <label class="control"><span class="control-label">View</span><select data-meta-level aria-label="Reporting level">${LEVELS.map(
        (level) => `<option value="${level.key}" ${q.level === level.key ? "selected" : ""}>${level.label}</option>`,
      ).join("")}</select></label>
      <label class="control"><span class="control-label">Action type</span><select data-meta-action aria-label="Meta action type">${ACTION_TYPES.map(
        (action) => `<option value="${action.key}" ${q.actionType === action.key ? "selected" : ""}>${action.label}</option>`,
      ).join("")}</select></label>
      ${metricSelect(catalog, chartMetric)}
      <button type="button" data-toggle-compare aria-pressed="${store.compare}" class="button button-small">${store.compare ? "Compare on" : "Compare off"}</button>
    </div>
  </div>

  ${kpiGrid({ keys: columns, catalog, totals: data.totals, previousTotals: data.previousTotals, series: data.series, currency, compare: store.compare })}

  ${chartPanel({
    title: "Meta performance over time",
    subtitle: `${rangeText(data.range)} · ${q.platform === "both" ? "Facebook + Instagram" : q.platform} · action: ${ACTION_TYPES.find((item) => item.key === q.actionType)?.label || q.actionType}`,
    tools: `<span class="source-badge">${data.source === "demo" ? "DEMO DATA" : "LIVE"}</span>`,
    body: lineChart({ series: data.series, previousSeries: data.previousSeries, metric: chartMetric, catalog, currency, compare: store.compare }),
  })}

  <div class="two-col">
    <section class="panel">
      <div class="panel-head"><div><h2 class="panel-title">Placement mix</h2><p class="panel-sub">Spend by publisher platform, reported by Insights.</p></div></div>
      <div class="panel-body">${donutChart(placements, { label: "Meta spend by platform", format: (value) => formatCurrency(value, currency) })}</div>
    </section>
    <section class="panel">
      <div class="panel-head"><div><h2 class="panel-title">Largest rows by spend</h2><p class="panel-sub">A quick read on where the budget sits.</p></div></div>
      <div class="panel-body">${barChart(top, { label: "Meta rows by spend", format: (value) => formatCurrency(value, currency), limit: 7 })}</div>
    </section>
  </div>

  <section class="panel">
    <div class="panel-head"><div><h2 class="panel-title">Campaign objects</h2><p class="panel-sub">Status, objective and daily budget. Read-only.</p></div></div>
    <div class="panel-body">
      ${
        objects.length === 0
          ? '<p class="panel-sub">No campaign objects were returned. Performance numbers are unaffected.</p>'
          : `<div class="table-wrap" style="max-height:300px"><table><thead><tr><th scope="col">Campaign</th><th scope="col">Objective</th><th scope="col">Daily budget</th><th scope="col">Bid strategy</th><th scope="col">Status</th></tr></thead><tbody>${objects
              .slice(0, 20)
              .map(
                (object) => `<tr><td><span class="cell-name"><strong>${escapeHtml(object.name || object.id || "—")}</strong><small>${escapeHtml(object.id || "")}</small></span></td><td>${escapeHtml(object.objective || "—")}</td><td>${object.budget === undefined || object.budget === null ? "—" : escapeHtml(formatCurrency(object.budget, currency))}</td><td>${escapeHtml(object.bidStrategy || "—")}</td><td>${statusPill(object.status)}</td></tr>`,
              )
              .join("")}</tbody></table></div>`
      }
    </div>
  </section>

  <section class="panel">
    <div class="toolbar">
      <span class="toolbar-label">${data.rows?.length || 0} rows · ${escapeHtml(currency)}</span>
      <span class="spacer"></span>
      <button type="button" data-columns class="button button-small">Columns</button>
      <button type="button" data-export class="button button-small">Export CSV</button>
    </div>
    ${tableHtml({ rows: data.rows, columns, catalog, currency, level: q.level, sort: state.sort })}
  </section>
  <p class="panel-sub" style="margin-top:8px">Read-only. AdPulse cannot create, edit, pause or delete Meta campaigns.</p>`;
}

export function bindMeta(root, ctx) {
  const q = store.queries.meta;
  document.body.dataset.metaView = q.platform === "instagram" ? "instagram" : "facebook";

  root.querySelectorAll("[data-meta-platform]").forEach((button) => {
    button.addEventListener("click", () => {
      if (q.platform === button.dataset.metaPlatform) return;
      q.platform = button.dataset.metaPlatform;
      savePrefs({ metaPlatform: q.platform });
      ctx.load();
    });
  });

  root.querySelector("[data-meta-level]")?.addEventListener("change", (event) => {
    q.level = event.target.value;
    state.sort = { key: "name", dir: "asc" };
    ctx.load();
  });

  root.querySelector("[data-meta-action]")?.addEventListener("change", (event) => {
    q.actionType = event.target.value;
    savePrefs({ metaActionType: q.actionType });
    ctx.load();
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

  root.querySelector("[data-columns]")?.addEventListener("click", () => {
    const data = ctx.getData();
    if (!data) return;
    const columns = selectedMetrics("meta", data.catalog, `${q.platform}:${q.level}`);
    openColumnsDialog({
      catalog: data.catalog,
      selected: columns,
      title: "Meta columns",
      onApply(keys) {
        setSelectedMetrics("meta", `${q.platform}:${q.level}`, keys);
        ctx.render();
        toast("Columns updated.");
      },
    });
  });

  root.querySelector("[data-export]")?.addEventListener("click", () => {
    const data = ctx.getData();
    if (!data) return;
    const columns = selectedMetrics("meta", data.catalog, `${q.platform}:${q.level}`);
    exportCsv(`adpulse-meta-${q.platform}-${q.level}.csv`, sortRows(data.rows, state.sort), columns, data.catalog, q.level);
  });

  root.querySelector('[data-action="retry"]')?.addEventListener("click", () => ctx.load());
  bindTableSort(root, state.sort, () => ctx.render());
}
