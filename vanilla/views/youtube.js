import { store, savePrefs, selectedMetrics, setSelectedMetrics } from "../state.js";
import { escapeHtml, formatMetric, metricDef, toast } from "../utils.js";
import { lineChart, barChart } from "../charts.js";
import {
  bindTableSort,
  chartPanel,
  connectionChips,
  errorHtml,
  kpiGrid,
  loadingHtml,
  metricSelect,
  noticesHtml,
  openColumnsDialog,
  pageHeader,
  rangeText,
  statusPill,
  tableHtml,
} from "./common.js";

const DIMENSIONS = [
  { key: "trafficSource", label: "Traffic source" },
  { key: "country", label: "Country" },
  { key: "ageGroup", label: "Age group" },
  { key: "gender", label: "Gender" },
  { key: "deviceType", label: "Device type" },
  { key: "playbackLocation", label: "Playback location" },
];

const VIDEO_DEFS = {
  cost: { key: "cost", label: "Cost", format: "currency", higherIsBetter: false, description: "Google Ads video campaign cost." },
  impressions: { key: "impressions", label: "Impressions", format: "number", higherIsBetter: true, description: "Video campaign impressions." },
  clicks: { key: "clicks", label: "Clicks", format: "number", higherIsBetter: true, description: "Video campaign clicks." },
  ctr: { key: "ctr", label: "CTR", format: "percent", higherIsBetter: true, description: "Clicks divided by impressions." },
  conversions: { key: "conversions", label: "Conversions", format: "number", higherIsBetter: true, description: "Conversions reported by Google Ads." },
  video_views: { key: "video_views", label: "Video views", format: "number", higherIsBetter: true, description: "Video views reported by Google Ads." },
  video_view_rate: { key: "video_view_rate", label: "View rate", format: "percent", higherIsBetter: true, description: "Video views divided by impressions." },
};

const state = {
  chartMetric: "views",
  sort: { key: "name", dir: "asc" },
  videoSort: { key: "name", dir: "asc" },
};

export function renderYouTube(data, boot, options = {}) {
  if (options.loading) return loadingHtml("Reading YouTube");
  if (options.error) return pageHeader({ eyebrow: "YouTube", title: "YouTube", subtitle: "Private channel analytics." }) + errorHtml(options.error);
  if (!data) return loadingHtml("Reading YouTube");

  const q = store.queries.youtube;
  const catalog = data.catalog || {};
  const channel = data.extras?.channel || {};
  const videos = Array.isArray(data.extras?.videos) ? data.extras.videos : [];
  const chartMetric = catalog.metrics?.some((metric) => metric.key === state.chartMetric) ? state.chartMetric : catalog.defaultMetrics?.[0] || "views";
  const columns = selectedMetrics("youtube", catalog, q.level);
  const isolated = data.isolated?.videoAds;
  const videoRows = Array.isArray(isolated?.rows) ? isolated.rows : [];
  const videoMetricKeys = [...new Set(videoRows.flatMap((row) => Object.keys(row.metrics || {})))];
  const videoColumns = ["cost", "impressions", "clicks", "ctr", "conversions", "video_views", "video_view_rate"].filter((key) => videoMetricKeys.includes(key)).slice(0, 6);
  const videoCatalog = { metrics: videoColumns.map((key) => VIDEO_DEFS[key]).filter(Boolean) };
  const breakdownMetric = metricDef(catalog, chartMetric)?.format === "text" ? catalog.defaultMetrics?.[0] || "views" : chartMetric;
  const breakdownDef = metricDef(catalog, breakdownMetric);
  const breakdowns = Array.isArray(data.breakdowns) ? data.breakdowns : [];

  return `${pageHeader({
    eyebrow: "YouTube · separate by policy",
    title: "Your channel,<br>on its own terms.",
    subtitle: `YouTube Analytics for ${channel.title ? escapeHtml(channel.title) : "your channel"}, kept apart from every advertising number.`,
    actions: `<span class="source-badge">${data.source === "demo" ? "Demo" : "YouTube API"}</span>
      <span class="source-badge">${data.extras?.revenueEnabled ? "Monetized" : "Revenue hidden"}</span>
      <a class="button button-small" href="#settings">Disconnect</a>`,
    note: true,
  })}
  ${connectionChips(boot.connections, boot.demoMode, ["youtube"])}
  ${noticesHtml(data.notices)}

  <div class="notice policy-notice" role="note">
    <span aria-hidden="true">▣</span>
    <span><strong>YouTube data stays here.</strong> It is never combined with Google Ads, Meta or TikTok data, never added to Overview totals, never written to disk, never logged and never exported to CSV. ${channel.title ? `Channel: ${escapeHtml(channel.title)}.` : ""}</span>
  </div>

  <div class="view-toolbar">
    <div class="segmented" role="group" aria-label="YouTube reporting level">
      <button type="button" data-youtube-level="channel" aria-pressed="${q.level === "channel"}">Channel</button>
      <button type="button" data-youtube-level="video" aria-pressed="${q.level === "video"}">Videos</button>
    </div>
    <div class="toolbar-controls">
      <label class="control"><span class="control-label">Breakdown</span><select data-youtube-dimension aria-label="Breakdown dimension">${DIMENSIONS.map(
        (dimension) => `<option value="${dimension.key}" ${q.dimension === dimension.key ? "selected" : ""}>${dimension.label}</option>`,
      ).join("")}</select></label>
      ${metricSelect(catalog, chartMetric, { monetized: data.extras?.revenueEnabled })}
      <button type="button" data-toggle-compare aria-pressed="${store.compare}" class="button button-small">${store.compare ? "Compare on" : "Compare off"}</button>
      <button type="button" data-refresh class="button button-small">Refresh</button>
    </div>
  </div>

  ${kpiGrid({ keys: columns, catalog, totals: data.totals, previousTotals: data.previousTotals, series: data.series, currency: "USD", compare: store.compare })}

  ${chartPanel({
    title: q.level === "video" ? "Video performance over time" : "Channel performance over time",
    subtitle: `${rangeText(data.range)} · source: YouTube Analytics`,
    tools: '<span class="source-badge">NO EXPORT</span>',
    body: lineChart({ series: data.series, previousSeries: data.previousSeries, metric: chartMetric, catalog, currency: "USD", compare: store.compare }),
  })}

  <div class="two-col">
    <section class="panel">
      <div class="panel-head"><div><h2 class="panel-title">Audience breakdown</h2><p class="panel-sub">${escapeHtml(breakdownDef?.label || "Views")} by ${escapeHtml(DIMENSIONS.find((item) => item.key === q.dimension)?.label || q.dimension)}. Only YouTube's own numbers.</p></div></div>
      <div class="panel-body">${
        breakdowns.length > 0
          ? barChart(
              breakdowns.map((item) => ({ label: item.label, value: Number(item.value) })),
              { label: "YouTube breakdown", format: (value) => formatMetric(value, breakdownDef, "USD"), limit: 8 },
            )
          : '<div class="chart-empty">No breakdown is available for this period. YouTube only returns breakdowns it can report reliably.</div>'
      }</div>
    </section>
    <section class="panel">
      <div class="panel-head"><div><h2 class="panel-title">Channel details</h2><p class="panel-sub">From the YouTube Data API, read-only.</p></div></div>
      <div class="panel-body">
        <div class="detail-list">
          <div><span>Channel</span><strong>${escapeHtml(channel.title || "—")}</strong></div>
          <div><span>Channel ID</span><strong>${escapeHtml(channel.id || "—")}</strong></div>
          <div><span>Status</span><strong>${statusPill(channel.status || "—")}</strong></div>
          <div><span>Videos returned</span><strong>${videos.length}</strong></div>
          <div><span>Storage</span><strong>Memory only</strong></div>
          <div><span>CSV export</span><strong>Disabled</strong></div>
        </div>
        <p class="panel-sub" style="margin-top:12px">YouTube's Developer Policies prohibit combining API data with other sources and require deletion to be available immediately. Use Settings to disconnect and delete.</p>
      </div>
    </section>
  </div>

  ${
    q.level === "video"
      ? `<section class="panel">
          <div class="toolbar">
            <span class="toolbar-label">${data.rows?.length || 0} videos · no export</span>
            <span class="spacer"></span>
            <button type="button" data-columns class="button button-small">Columns</button>
          </div>
          <div data-table-scope="youtube-main">${tableHtml({ rows: data.rows, columns, catalog, currency: "USD", level: "video", sort: state.sort })}</div>
        </section>`
      : `<section class="panel">
          <div class="panel-head"><div><h2 class="panel-title">Recent videos</h2><p class="panel-sub">Titles from the Data API. Switch to Videos for per-video analytics.</p></div><div class="panel-tools"><button type="button" data-youtube-level="video" class="button button-small">Open video analytics</button></div></div>
          <div class="panel-body">${
            videos.length === 0
              ? '<p class="panel-sub">No videos were returned for this channel.</p>'
              : `<ul class="video-list">${videos
                  .slice(0, 8)
                  .map(
                    (video) => `<li><span><strong>${escapeHtml(video.title || video.id)}</strong><small>${escapeHtml(video.id || "")}${video.publishedAt ? ` · ${escapeHtml(String(video.publishedAt).slice(0, 10))}` : ""}</small></span>${statusPill(video.status || "—")}</li>`,
                  )
                  .join("")}</ul>`
          }</div>
        </section>`
  }

  <section class="panel isolated-panel">
    <div class="panel-head">
      <div>
        <div class="eyebrow" style="margin-bottom:4px">Separate source · Google Ads API</div>
        <h2 class="panel-title">Video campaign performance</h2>
        <p class="panel-sub">Google Ads video campaigns are advertising data. They are requested separately and are never merged with YouTube Analytics, totals, charts or exports on this page.</p>
      </div>
      <span class="source-badge">ISOLATED</span>
    </div>
    <div class="panel-body">
      ${
        !isolated
          ? '<p class="panel-sub">Connect Google Ads in Settings to see video campaign performance here. It will always remain separate from YouTube Analytics.</p>'
          : videoRows.length === 0
            ? `<p class="panel-sub">${escapeHtml(isolated.note || "No Google Ads video campaigns were returned.")}</p>`
            : `<div data-table-scope="youtube-ads">
                ${tableHtml({ rows: videoRows, columns: videoColumns, catalog: videoCatalog, currency: isolated.currency || "USD", level: "campaign", sort: state.videoSort })}
              </div>
              <p class="panel-sub" style="margin-top:10px">${escapeHtml(isolated.note || "Separate Google Ads data.")} This table is not included in YouTube metrics or exports.</p>`
      }
    </div>
  </section>
  <p class="panel-sub" style="margin-top:8px"><a href="/privacy">YouTube privacy and deletion policy</a> · No YouTube data is persisted.</p>`;
}

export function bindYouTube(root, ctx) {
  const q = store.queries.youtube;

  root.querySelectorAll("[data-youtube-level]").forEach((button) => {
    button.addEventListener("click", () => {
      if (q.level === button.dataset.youtubeLevel) return;
      q.level = button.dataset.youtubeLevel;
      state.sort = { key: "name", dir: "asc" };
      ctx.load();
    });
  });

  root.querySelector("[data-youtube-dimension]")?.addEventListener("change", (event) => {
    q.dimension = event.target.value;
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
    const columns = selectedMetrics("youtube", data.catalog, q.level);
    openColumnsDialog({
      catalog: data.catalog,
      selected: columns,
      title: "YouTube columns (no export)",
      onApply(keys) {
        setSelectedMetrics("youtube", q.level, keys);
        ctx.render();
        toast("Columns updated.");
      },
    });
  });

  root.querySelector('[data-action="retry"]')?.addEventListener("click", () => ctx.load());
  const mainTable = root.querySelector('[data-table-scope="youtube-main"]');
  if (mainTable) bindTableSort(mainTable, state.sort, () => ctx.render());
  const adsTable = root.querySelector('[data-table-scope="youtube-ads"]');
  if (adsTable) bindTableSort(adsTable, state.videoSort, () => ctx.render());
}
