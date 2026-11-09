import { compactDate, escapeHtml, formatMetric, truncate } from "./utils.js";

function niceMax(value) {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  const scaled = value / power;
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return step * power;
}

export function sparkline(values, options = {}) {
  const width = options.width || 76;
  const height = options.height || 22;
  const clean = (values || []).map((value) => (typeof value === "number" && Number.isFinite(value) ? value : null));
  const present = clean.filter((value) => value !== null);
  if (present.length < 2) return `<svg class="sparkline" viewBox="0 0 ${width} ${height}" aria-hidden="true"></svg>`;
  const max = niceMax(Math.max(...present));
  const min = Math.min(0, Math.min(...present));
  const span = max - min || 1;
  const points = clean
    .map((value, index) => {
      if (value === null) return null;
      const x = (index / Math.max(1, clean.length - 1)) * width;
      const y = height - ((value - min) / span) * (height - 2) - 1;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .filter(Boolean)
    .join(" ");
  return `<svg class="sparkline" viewBox="0 0 ${width} ${height}" aria-hidden="true" focusable="false">
    <polyline points="${points}" fill="none" stroke="var(--spark)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></polyline>
  </svg>`;
}

export function lineChart(options) {
  const { series = [], previousSeries = [], metric, catalog, currency, compare = true } = options;
  const def = (catalog?.metrics || []).find((item) => item.key === metric);
  const width = 820;
  const height = 240;
  const pad = { top: 16, right: 18, bottom: 28, left: 56 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const currentValues = series.map((point) => {
    const value = point.metrics?.[metric];
    return typeof value === "number" ? value : null;
  });
  const previousValues = compare ? previousSeries.map((point) => {
    const value = point.metrics?.[metric];
    return typeof value === "number" ? value : null;
  }) : [];
  const all = [...currentValues, ...previousValues].filter((value) => value !== null);

  if (all.length === 0 || !def || def.format === "text") {
    return `<div class="chart-empty">No ${escapeHtml(def?.label || "metric")} values are available for this period.</div>`;
  }

  const max = niceMax(Math.max(...all, 0));
  const min = 0;
  const steps = 4;
  const xFor = (index, length) => pad.left + (length <= 1 ? innerW / 2 : (index / (length - 1)) * innerW);
  const yFor = (value) => pad.top + innerH - ((value - min) / (max - min || 1)) * innerH;

  const grid = Array.from({ length: steps + 1 }, (_, index) => {
    const value = (max / steps) * index;
    const y = yFor(value);
    return `<line class="chart-grid-line" x1="${pad.left}" y1="${y.toFixed(1)}" x2="${width - pad.right}" y2="${y.toFixed(1)}"></line>
      <text class="chart-axis-label" x="${pad.left - 8}" y="${(y + 3).toFixed(1)}" text-anchor="end">${escapeHtml(formatMetric(value, def, currency, true))}</text>`;
  }).join("");

  const buildPath = (values) => {
    let path = "";
    let started = false;
    values.forEach((value, index) => {
      if (value === null) {
        started = false;
        return;
      }
      const x = xFor(index, values.length);
      const y = yFor(value);
      path += `${started ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)} `;
      started = true;
    });
    return path.trim();
  };

  const currentPath = buildPath(currentValues);
  const previousPath = compare ? buildPath(previousValues) : "";

  let area = "";
  const validIndices = currentValues.map((value, index) => (value === null ? null : index)).filter((index) => index !== null);
  if (validIndices.length > 1) {
    const first = validIndices[0];
    const last = validIndices[validIndices.length - 1];
    const bottom = pad.top + innerH;
    area = `<path class="chart-area" d="M${xFor(first, currentValues.length).toFixed(1)},${bottom} ${currentPath.replace(/^M/, "L")} L${xFor(last, currentValues.length).toFixed(1)},${bottom} Z"></path>`;
  }

  const labels = [];
  if (series.length > 0) {
    const indices = [...new Set([0, Math.floor((series.length - 1) / 2), series.length - 1])];
    for (const index of indices) {
      labels.push(
        `<text class="chart-axis-label" x="${xFor(index, series.length).toFixed(1)}" y="${height - 8}" text-anchor="${index === 0 ? "start" : index === series.length - 1 ? "end" : "middle"}">${escapeHtml(compactDate(series[index].date))}</text>`,
      );
    }
  }

  const dots = currentValues
    .map((value, index) =>
      value === null
        ? ""
        : `<circle class="chart-dot" cx="${xFor(index, currentValues.length).toFixed(1)}" cy="${yFor(value).toFixed(1)}" r="2.2"><title>${escapeHtml(compactDate(series[index].date))}: ${escapeHtml(formatMetric(value, def, currency))}</title></circle>`,
    )
    .join("");

  return `<svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(def.label)} trend for the selected period">
    ${grid}
    ${area}
    ${previousPath ? `<path class="chart-line previous" d="${previousPath}"></path>` : ""}
    <path class="chart-line" d="${currentPath}"></path>
    ${dots}
    ${labels.join("")}
  </svg>
  <div class="chart-legend">
    <span class="legend-key"><span class="legend-swatch"></span>${escapeHtml(def.label)}</span>
    ${compare ? '<span class="legend-key"><span class="legend-swatch previous"></span>Previous period</span>' : ""}
    <span class="legend-key" style="opacity:.7">Hover a point for the exact value.</span>
  </div>`;
}

export function barChart(items, options = {}) {
  const width = 620;
  const rowHeight = 30;
  const labelWidth = 150;
  const valueWidth = 90;
  const data = (items || []).filter((item) => Number.isFinite(Number(item.value))).slice(0, options.limit || 8);
  if (data.length === 0) return `<div class="chart-empty">No breakdown is available for this period.</div>`;
  const max = Math.max(...data.map((item) => Number(item.value)), 1);
  const height = Math.max(60, data.length * rowHeight + 10);
  const bars = data
    .map((item, index) => {
      const y = index * rowHeight + 8;
      const barWidth = Math.max(1, (Number(item.value) / max) * (width - labelWidth - valueWidth - 16));
      const label = truncate(item.label, 22);
      return `<g>
        <title>${escapeHtml(item.label)}: ${escapeHtml(options.format ? options.format(item.value) : String(item.value))}</title>
        <text class="chart-axis-label" x="0" y="${y + 13}" style="font-size:11px;fill:var(--text-muted)">${escapeHtml(label)}</text>
        <rect x="${labelWidth}" y="${y + 3}" width="${barWidth.toFixed(1)}" height="13" rx="3" class="chart-bar"></rect>
        <text class="chart-axis-label" x="${width}" y="${y + 13}" text-anchor="end" style="font-size:11px;fill:var(--text-muted)">${escapeHtml(options.format ? options.format(item.value) : String(item.value))}</text>
      </g>`;
    })
    .join("");
  return `<svg class="chart-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(options.label || "Top items by value")}">${bars}</svg>`;
}

export function donutChart(items, options = {}) {
  const data = (items || []).filter((item) => Number(item.value) > 0);
  if (data.length === 0) return `<div class="chart-empty">No placement breakdown is available.</div>`;
  const size = 150;
  const radius = 58;
  const stroke = 20;
  const center = size / 2;
  const total = data.reduce((sum, item) => sum + Number(item.value), 0);
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const colors = ["var(--accent)", "var(--accent-2)", "var(--text-faint)", "var(--border-strong)"];
  const segments = data
    .map((item, index) => {
      const fraction = Number(item.value) / total;
      const dash = fraction * circumference;
      const segment = `<circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="${colors[index % colors.length]}" stroke-width="${stroke}" stroke-dasharray="${dash.toFixed(2)} ${(circumference - dash).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 ${center} ${center})" opacity="${1 - index * 0.12}"><title>${escapeHtml(item.label)}: ${escapeHtml(options.format ? options.format(item.value) : String(item.value))}</title></circle>`;
      offset += dash;
      return segment;
    })
    .join("");
  const legend = data
    .map(
      (item, index) =>
        `<span class="legend-key"><span class="legend-swatch" style="background:${colors[index % colors.length]};width:10px;height:10px;border-radius:2px"></span>${escapeHtml(item.label)} · ${escapeHtml(options.format ? options.format(item.value) : String(item.value))}</span>`,
    )
    .join("");
  return `<div style="display:flex;align-items:center;gap:18px;flex-wrap:wrap">
    <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${escapeHtml(options.label || "Breakdown donut chart")}">${segments}</svg>
    <div class="chart-legend" style="flex-direction:column;align-items:flex-start;gap:6px;margin:0">${legend}</div>
  </div>`;
}
