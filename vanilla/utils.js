export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatNumber(value, compact = false) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  const number = Number(value);
  return new Intl.NumberFormat("en-US", {
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : Math.abs(number) < 10 ? 2 : 0,
  }).format(number);
}

export function formatCurrency(value, currency, compact = false) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      notation: compact ? "compact" : "standard",
      maximumFractionDigits: compact ? 1 : 2,
    }).format(Number(value));
  } catch {
    return `${formatNumber(value, compact)} ${currency || ""}`.trim();
  }
}

export function formatDuration(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  const total = Math.max(0, Math.round(Number(value)));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  }
  return minutes > 0 ? `${minutes}m ${String(seconds).padStart(2, "0")}s` : `${seconds}s`;
}

export function formatMetric(value, def, currency, compact = false) {
  if (!def) return value === null || value === undefined ? "—" : String(value);
  if (def.format === "currency") return formatCurrency(value, currency, compact);
  if (def.format === "percent") {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
    return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Number(value))}%`;
  }
  if (def.format === "duration") return formatDuration(value);
  if (def.format === "number") return formatNumber(value, compact);
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

export function metricDef(catalog, key) {
  return (catalog?.metrics || []).find((metric) => metric.key === key);
}

export function tooltipLabel(def) {
  if (!def) return "";
  return `<span class="tooltip-wrap">
    <button type="button" class="info" aria-label="${escapeHtml(def.label)}. ${escapeHtml(def.description)}">i</button>
    <span class="tooltip" role="tooltip">${escapeHtml(def.description)}</span>
  </span>`;
}

export function metricLabel(catalog, key, showTooltip = true) {
  const def = metricDef(catalog, key);
  return `<span class="metric-label">${escapeHtml(def?.label || key)}${showTooltip ? tooltipLabel(def) : ""}</span>`;
}

export function deltaInfo(current, previous, higherIsBetter) {
  if (current === null || current === undefined || previous === null || previous === undefined) {
    return { text: "No comparison", dir: "none", good: null, value: null };
  }
  if (Number(previous) === 0) {
    return { text: "New", dir: "none", good: null, value: null };
  }
  const change = ((Number(current) - Number(previous)) / Math.abs(Number(previous))) * 100;
  if (!Number.isFinite(change)) return { text: "No comparison", dir: "none", good: null, value: null };
  const good = change === 0 ? null : change > 0 === Boolean(higherIsBetter);
  const dir = change > 0 ? "up" : change < 0 ? "down" : "flat";
  const text = `${change > 0 ? "+" : ""}${change.toFixed(1)}%`;
  return { text, dir, good, value: change };
}

export function deltaHtml(current, previous, higherIsBetter, label = "vs previous period") {
  const info = deltaInfo(current, previous, higherIsBetter);
  if (info.value === null) return `<span class="delta" title="${escapeHtml(label)}">${escapeHtml(info.text)}</span>`;
  const cls = info.good === null ? "" : info.good ? "good" : "bad";
  const arrow = info.dir === "up" ? "▲" : info.dir === "down" ? "▼" : "•";
  return `<span class="delta" data-dir="${info.dir}" data-quality="${cls}" title="${escapeHtml(label)}"><span class="arrow" aria-hidden="true">${arrow}</span>${escapeHtml(info.text)}</span>`;
}

export function compactDate(iso) {
  if (!iso) return "";
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(date);
}

export function sourceLabel(source) {
  switch (source) {
    case "google_ads_api":
      return "Google Ads API";
    case "meta_api":
      return "Meta Marketing API";
    case "tiktok_api":
      return "TikTok Marketing API";
    case "youtube_api":
      return "YouTube API";
    case "tiktok_adlib":
      return "TikTok Commercial Content API";
    default:
      return "Demo data";
  }
}

export function downloadCsv(filename, rows) {
  if (!rows || rows.length === 0) return;
  const text = rows
    .map((row) =>
      row
        .map((cell) => {
          const value = cell === null || cell === undefined ? "" : String(cell);
          return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
        })
        .join(","),
    )
    .join("\n");
  const blob = new Blob([`\uFEFF${text}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

let toastTimer = null;
export function toast(message) {
  let node = document.getElementById("toast");
  if (!node) {
    node = document.createElement("div");
    node.id = "toast";
    node.className = "toast";
    node.setAttribute("role", "status");
    node.setAttribute("aria-live", "polite");
    document.body.appendChild(node);
  }
  node.textContent = message;
  node.dataset.show = "true";
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    node.dataset.show = "false";
  }, 3200);
}

export function debounce(fn, wait = 180) {
  let timer = null;
  return (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export function truncate(value, length = 28) {
  const text = String(value ?? "");
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}
