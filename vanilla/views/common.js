import { deltaHtml, escapeHtml, formatMetric, metricDef, metricLabel, downloadCsv, toast } from "../utils.js";
import { sparkline as spark } from "../charts.js";

export function pageHeader({ eyebrow, title, subtitle, actions = "", note = "" }) {
  return `<header class="page-head">
    <div>
      <div class="eyebrow">${escapeHtml(eyebrow)}</div>
      <h1 class="page-title">${title}</h1>
      <p class="page-sub">${escapeHtml(subtitle)}</p>
      ${note ? `<div class="brand-rule" aria-hidden="true"></div>` : ""}
    </div>
    ${actions ? `<div class="page-actions">${actions}</div>` : ""}
  </header>`;
}

export function noticesHtml(notices) {
  if (!Array.isArray(notices) || notices.length === 0) return "";
  return notices.map((notice) => `<div class="notice" role="note"><span aria-hidden="true">ⓘ</span><span>${escapeHtml(notice)}</span></div>`).join("");
}

const NETWORK_LABELS = {
  googleAds: "Google Ads",
  meta: "Meta",
  tiktok: "TikTok",
  youtube: "YouTube",
  tiktokAdlib: "TikTok Ad Library",
};

function stateLabel(value, demoMode) {
  if (demoMode) return { state: "demo", text: "Demo" };
  if (value === true || value === "connected") return { state: "connected", text: "Connected" };
  if (value === "demo") return { state: "demo", text: "Demo" };
  if (value === "needs_attention") return { state: "needs_attention", text: "Needs attention" };
  if (value === "error") return { state: "needs_attention", text: "Unavailable" };
  return { state: "not_connected", text: "Not connected" };
}

export function connectionChips(connections, demoMode, only = null) {
  const entries = Object.entries(connections || {}).filter(([key]) => (only ? only.includes(key) : true));
  if (entries.length === 0) return "";
  return `<div class="status-strip" aria-label="Connection status">
    ${entries
      .map(([key, value]) => {
        const status = stateLabel(value, demoMode);
        return `<a class="status-chip" href="#settings" data-state="${status.state}"><span class="status-dot" aria-hidden="true"></span>${escapeHtml(NETWORK_LABELS[key] || key)} · ${status.text}</a>`;
      })
      .join("")}
  </div>`;
}

export function kpiGrid({ keys, catalog, totals, previousTotals, series, currency, compare, limit = 6 }) {
  const chosen = (keys || []).slice(0, limit);
  return `<div class="kpi-grid">
    ${chosen
      .map((key) => {
        const def = metricDef(catalog, key);
        if (!def) return "";
        const current = totals?.[key];
        const previous = previousTotals?.[key];
        const values = (series || []).map((point) => {
          const value = point.metrics?.[key];
          return typeof value === "number" ? value : null;
        });
        return `<article class="kpi-card">
          <div class="kpi-label">${metricLabel(catalog, key)}</div>
          <div class="kpi-value">${escapeHtml(formatMetric(current, def, currency, true))}</div>
          <div class="kpi-foot">
            ${compare ? deltaHtml(current, previous, def.higherIsBetter) : ""}
            ${spark(values)}
          </div>
        </article>`;
      })
      .join("")}
  </div>`;
}

export function metricSelect(catalog, selected, options = {}) {
  const groups = new Map();
  for (const metric of catalog?.metrics || []) {
    if (metric.format === "text") continue;
    if (metric.requiresMonetization && options.monetized === false) continue;
    const group = metric.group || "Other";
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(metric);
  }
  const choices = [...groups.entries()]
    .map(
      ([group, metrics]) =>
        `<optgroup label="${escapeHtml(group)}">${metrics
          .map((metric) => `<option value="${escapeHtml(metric.key)}" ${metric.key === selected ? "selected" : ""}>${escapeHtml(metric.label)}</option>`)
          .join("")}</optgroup>`,
    )
    .join("");
  return `<label class="control"><span class="control-label">Chart metric</span><select data-chart-metric aria-label="Chart metric">${choices}</select></label>`;
}

export function accountSelect(accounts, selected, label = "Account") {
  if (!Array.isArray(accounts) || accounts.length === 0) return "";
  return `<label class="control"><span class="control-label">${escapeHtml(label)}</span>
    <select data-account aria-label="${escapeHtml(label)}">${accounts
      .map(
        (account) =>
          `<option value="${escapeHtml(account.id)}" ${String(account.id) === String(selected) ? "selected" : ""}>${escapeHtml(account.name || account.id)}</option>`,
      )
      .join("")}</select></label>`;
}

export function statusPill(status) {
  const text = String(status || "").toUpperCase();
  if (!text) return "";
  const tone = text === "ENABLED" || text === "ACTIVE" || text === "ON" ? "good" : text === "PAUSED" || text === "OFF" ? "bad" : "";
  return `<span class="pill" ${tone ? `data-tone="${tone}"` : ""}>${escapeHtml(text)}</span>`;
}

export function chartPanel({ title, subtitle, tools = "", body }) {
  return `<section class="panel">
    <div class="panel-head">
      <div><h2 class="panel-title">${escapeHtml(title)}</h2>${subtitle ? `<p class="panel-sub">${escapeHtml(subtitle)}</p>` : ""}</div>
      ${tools ? `<div class="panel-tools">${tools}</div>` : ""}
    </div>
    <div class="panel-body">${body}</div>
  </section>`;
}

export function sortRows(rows, sort) {
  const copy = [...(rows || [])];
  const dir = sort?.dir === "asc" ? 1 : -1;
  if (!sort?.key) return copy;
  copy.sort((a, b) => {
    if (sort.key === "name") return a.name.localeCompare(b.name) * dir;
    const av = a.metrics?.[sort.key];
    const bv = b.metrics?.[sort.key];
    const an = typeof av === "number" ? av : null;
    const bn = typeof bv === "number" ? bv : null;
    if (an === null && bn === null) return 0;
    if (an === null) return 1;
    if (bn === null) return -1;
    return (an - bn) * dir;
  });
  return copy;
}

export function tableHtml({ rows, columns, catalog, currency, level, sort = { key: "name", dir: "asc" } }) {
  const sorted = sortRows(rows, sort);
  if (!sorted || sorted.length === 0) {
    return `<div class="empty-state"><h3>No rows returned</h3><p>The API answered, but there is no ${escapeHtml(level || "performance")} data for this range. Try a wider date range or another level.</p></div>`;
  }
  const showStatus = !["keyword", "search_term", "product", "video", "channel"].includes(level);
  const header = `<tr><th scope="col" aria-sort="${sort.key === "name" ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}">
      <button type="button" class="sort-button" data-sort="name" ${sort.key === "name" ? `aria-sort="${sort.dir === "asc" ? "ascending" : "descending"}"` : ""}>Name <span class="sort-arrow" aria-hidden="true">${sort.key === "name" ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}</span></button>
    </th>
    ${showStatus ? '<th scope="col">Status</th>' : ""}
    ${columns
      .map((key) => {
        const def = metricDef(catalog, key);
        const active = sort.key === key;
        return `<th scope="col"><button type="button" class="sort-button" data-sort="${escapeHtml(key)}" ${active ? `aria-sort="${sort.dir === "asc" ? "ascending" : "descending"}"` : ""}>${escapeHtml(def?.label || key)} <span class="sort-arrow" aria-hidden="true">${active ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}</span></button></th>`;
      })
      .join("")}
  </tr>`;

  const body = sorted
    .map((row) => {
      const extras = Object.entries(row.dims || {})
        .filter(([, value]) => value !== null && value !== undefined && value !== "")
        .slice(0, 2)
        .map(([key, value]) => `${key.replace(/([A-Z])/g, " $1").toLowerCase()}: ${value}`)
        .join(" · ");
      return `<tr>
        <td><span class="cell-name"><strong>${escapeHtml(row.name || row.id)}</strong>${extras ? `<small>${escapeHtml(extras)}</small>` : ""}</span></td>
        ${showStatus ? `<td>${statusPill(row.status)}</td>` : ""}
        ${columns
          .map((key) => {
            const def = metricDef(catalog, key);
            return `<td>${escapeHtml(formatMetric(row.metrics?.[key], def, row.currency || currency))}${def?.calculated ? ' <span class="badge-calculated" title="Derived from API-returned totals">calc</span>' : ""}</td>`;
          })
          .join("")}
      </tr>`;
    })
    .join("");

  return `<div class="table-wrap"><table>${header}<tbody>${body}</tbody></table></div>`;
}

export function bindTableSort(root, sort, onChange) {
  root.querySelectorAll("[data-sort]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.sort;
      const dir = sort.key === key && sort.dir === "asc" ? "desc" : "asc";
      sort.key = key;
      sort.dir = dir;
      if (onChange) onChange();
    });
  });
}

export function openColumnsDialog({ title = "Choose columns", catalog, selected, onApply }) {
  const existing = document.getElementById("columns-dialog");
  if (existing) existing.remove();
  const dialog = document.createElement("dialog");
  dialog.id = "columns-dialog";
  const chosen = new Set(selected);
  const groups = new Map();
  for (const metric of catalog?.metrics || []) {
    if (metric.format === "text") continue;
    if (!groups.has(metric.group || "Other")) groups.set(metric.group || "Other", []);
    groups.get(metric.group || "Other").push(metric);
  }
  dialog.innerHTML = `<form method="dialog">
    <div class="dialog-head"><h2>${escapeHtml(title)}</h2><button type="button" class="button-ghost" data-close aria-label="Close">✕</button></div>
    <div class="dialog-body">
      <p class="panel-sub">Every metric below is exposed by the API. Add at most 10 to keep the table readable.</p>
      ${[...groups.entries()]
        .map(
          ([group, metrics]) => `<div class="column-group"><h3>${escapeHtml(group)}</h3>${metrics
            .map(
              (metric) => `<label class="check-row"><input type="checkbox" value="${escapeHtml(metric.key)}" ${chosen.has(metric.key) ? "checked" : ""}><span>${escapeHtml(metric.label)}</span></label>`,
            )
            .join("")}</div>`,
        )
        .join("")}
    </div>
    <div class="dialog-foot"><button type="button" class="button" data-close>Cancel</button><button type="button" class="button-primary" data-apply>Apply columns</button></div>
  </form>`;
  document.body.appendChild(dialog);
  dialog.showModal();
  dialog.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => dialog.close()));
  dialog.querySelector("[data-apply]").addEventListener("click", () => {
    const keys = [...dialog.querySelectorAll("input:checked")].map((input) => input.value);
    if (keys.length === 0) {
      toast("Keep at least one metric column.");
      return;
    }
    if (keys.length > 10) {
      toast("Choose at most 10 metric columns.");
      return;
    }
    onApply(keys);
    dialog.close();
  });
  dialog.addEventListener("close", () => dialog.remove());
}

export function csvRows(rows, columns, catalog, level) {
  const headers = ["Name", "ID", "Status", "Level", ...columns.map((key) => metricDef(catalog, key)?.label || key), "Currency"];
  const data = rows.map((row) => [
    row.name,
    row.id,
    row.status,
    level,
    ...columns.map((key) => row.metrics?.[key] ?? ""),
    row.currency,
  ]);
  return [headers, ...data];
}

export function exportCsv(filename, rows, columns, catalog, level) {
  if (!rows || rows.length === 0) {
    toast("There is nothing to export yet.");
    return;
  }
  downloadCsv(filename, csvRows(rows, columns, catalog, level));
  toast("CSV exported.");
}

export function loadingHtml(label = "Loading") {
  return `<div class="loading-state" role="status" aria-live="polite">
    <h3>${escapeHtml(label)}…</h3>
    <div class="skeleton skeleton-line" style="width:62%;margin-top:12px"></div>
    <div class="skeleton skeleton-line" style="width:40%"></div>
    <div class="kpi-grid" style="margin-top:18px">${Array.from({ length: 4 }, () => '<div class="skeleton skeleton-card"></div>').join("")}</div>
  </div>`;
}

export function errorHtml(error) {
  const title = error?.code === "AUTH" ? "Session expired" : error?.code === "NOT_CONNECTED" ? "This network is not connected" : "This data could not be loaded";
  return `<div class="error-state" role="alert">
    <h3>${escapeHtml(title)}</h3>
    <p>${escapeHtml(error?.message || "The API did not answer.")}</p>
    <p class="how-to"><strong>How to fix:</strong> ${escapeHtml(error?.hint || "Open Settings, confirm the credentials, then try again.")}</p>
    <div class="settings-actions">
      <button type="button" class="button" data-action="retry">Try again</button>
      <a class="button button-ghost" href="#settings">Open Settings</a>
    </div>
  </div>`;
}

export function rangeText(range) {
  if (!range) return "";
  return `${range.label}${range.timezone ? ` · ${range.timezone}` : ""}`;
}

export function ensureData(data) {
  return data && Array.isArray(data.rows) ? data : null;
}

export function topItems(rows, metricKey, catalog, currency, limit = 8) {
  const def = metricDef(catalog, metricKey);
  return (rows || [])
    .map((row) => ({ label: row.name || row.id, value: Number(row.metrics?.[metricKey] ?? NaN) }))
    .filter((item) => Number.isFinite(item.value))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit)
    .map((item) => ({ ...item, formatted: formatMetric(item.value, def, currency) }));
}
