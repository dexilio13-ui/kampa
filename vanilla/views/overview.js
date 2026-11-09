import { escapeHtml, formatCurrency, formatNumber, deltaHtml } from "../utils.js";
import { sparkline } from "../charts.js";

const NETWORK_META = {
  "google-ads": { label: "Google Ads", tab: "google-ads", accent: "#4285f4" },
  meta: { label: "Meta", tab: "meta", accent: "#1877f2" },
  tiktok: { label: "TikTok", tab: "tiktok", accent: "#111111" },
};

const STATS = [
  { key: "spend", label: "Spend", format: "currency", better: false },
  { key: "impressions", label: "Impressions", format: "number", better: true },
  { key: "clicks", label: "Clicks", format: "number", better: true },
  { key: "ctr", label: "CTR", format: "percent", better: true },
  { key: "conversions", label: "Conversions", format: "number", better: true },
];

function conversionKey(network) {
  if (network === "meta") return "actions";
  if (network === "tiktok") return "conversion";
  return "conversions";
}

function statKey(key, network) {
  return key === "conversions" ? conversionKey(network) : key;
}

function valueOf(totals, key, network) {
  if (key === "spend") return totals?.spend ?? totals?.cost ?? null;
  return totals?.[statKey(key, network)] ?? null;
}

function seriesValues(series, key, network) {
  return (series || []).map((point) => {
    const value = key === "spend" ? point.metrics?.spend ?? point.metrics?.cost : point.metrics?.[statKey(key, network)];
    return typeof value === "number" ? value : null;
  });
}

function formatStat(value, format, currency) {
  if (format === "currency") return formatCurrency(value, currency, true);
  if (format === "percent") return value === null || value === undefined ? "—" : `${Number(value).toFixed(2)}%`;
  return formatNumber(value, true);
}

function statusInfo(status) {
  switch (status) {
    case "connected":
      return { text: "Connected", tone: "good" };
    case "demo":
      return { text: "Demo", tone: "" };
    case "needs_attention":
      return { text: "Needs attention", tone: "bad" };
    case "not_connected":
      return { text: "Not connected", tone: "" };
    default:
      return { text: "Unavailable", tone: "bad" };
  }
}

function networkCard(network) {
  const meta = NETWORK_META[network.network] || { label: network.label, tab: "overview", accent: "var(--accent)" };
  const status = statusInfo(network.status);
  const usable = network.status === "connected" || network.status === "demo";
  if (!usable) {
    return `<article class="panel network-card" data-network="${escapeHtml(network.network)}">
      <div class="network-card-head">
        <div class="network-brand"><span class="network-dot" style="background:${meta.accent}"></span>${escapeHtml(meta.label)}</div>
        <span class="pill" ${status.tone ? `data-tone="${status.tone}"` : ""}>${status.text}</span>
      </div>
      <div class="network-unavailable">
        <p>${escapeHtml(network.message || "Connect this network in Settings to see its performance here.")}</p>
        <a class="button button-small" href="#settings">Connect in Settings</a>
      </div>
    </article>`;
  }

  return `<article class="panel network-card" data-network="${escapeHtml(network.network)}">
    <div class="network-card-head">
      <div class="network-brand"><span class="network-dot" style="background:${meta.accent}"></span>${escapeHtml(meta.label)}</div>
      <span class="pill" ${status.tone ? `data-tone="${status.tone}"` : ""}>${status.text}</span>
    </div>
    <div class="network-stats">
      ${STATS.map((stat) => {
        const current = valueOf(network.totals, stat.key, network.network);
        const previous = valueOf(network.previousTotals, stat.key, network.network);
        return `<div class="network-stat">
          <span class="network-stat-label">${stat.label}</span>
          <strong>${escapeHtml(formatStat(current, stat.format, network.currency))}</strong>
          ${deltaHtml(current, previous, stat.better, "vs previous period")}
        </div>`;
      }).join("")}
    </div>
    <div class="network-foot">
      ${sparkline(seriesValues(network.series, "spend", network.network), { width: 120, height: 26 })}
      <a class="button button-small" href="#${meta.tab}" aria-label="Open ${escapeHtml(meta.label)}">Open ${escapeHtml(meta.label)} →</a>
    </div>
  </article>`;
}

export function renderOverview(data) {
  const networks = data.networks || [];
  const anyConnected = networks.some((network) => network.status === "connected" || network.status === "demo");
  const total = data.total || { available: false, reason: "No connected networks yet." };

  return `<header class="page-head">
    <div>
      <div class="eyebrow">Command center · ${escapeHtml(data.mode === "demo" ? "Demo workspace" : "Live workspace")}</div>
      <h1 class="page-title">Every channel,<br>one calm pulse.</h1>
      <p class="page-sub">Read-only campaign performance across Google Ads, Meta and TikTok. YouTube stays separate by policy and is never added to these totals.</p>
      <div class="brand-rule" aria-hidden="true"></div>
    </div>
    <div class="page-actions">
      <span class="source-badge">${data.mode === "demo" ? "DEMO DATA" : "LIVE API DATA"}</span>
      <a class="button" href="#settings">Connections</a>
    </div>
  </header>

  <div class="overview-total ${total.available ? "" : "is-muted"}">
    <div>
      <div class="eyebrow" style="margin-bottom:4px">Blended advertising spend</div>
      <div class="overview-total-value">${total.available ? escapeHtml(formatCurrency(total.spend, total.currency)) : "—"}</div>
      <p class="panel-sub">${escapeHtml(total.reason)}${total.available ? ` Currency: ${escapeHtml(total.currency)}.` : ""}</p>
    </div>
    <div class="overview-total-meta">
      <span class="pill">${escapeHtml(data.range?.label || "Selected range")}</span>
      <span class="pill">YouTube excluded</span>
    </div>
  </div>

  ${networks.length === 0 ? '<div class="empty-state"><h3>No advertising networks connected</h3><p>Open Settings to add Google Ads, Meta or TikTok credentials. Demo mode is on by default, so you can explore first.</p><a class="button" href="#settings">Open Settings</a></div>' : ""}

  <div class="overview-grid">${networks.map(networkCard).join("")}</div>

  <div class="notice" role="note"><span aria-hidden="true">◇</span><span><strong>YouTube is intentionally absent.</strong> ${escapeHtml(data.youtubeExcludedNote || "YouTube channel data is never combined with advertising data.")}</span></div>
  ${!anyConnected ? '<p class="panel-sub" style="text-align:center">Turn off Demo mode in Settings when your live credentials are ready.</p>' : ""}
  <p class="panel-sub" style="text-align:center;margin-top:18px">Data is cached in server memory for five minutes. Click Refresh to fetch a new read.</p>`;
}
