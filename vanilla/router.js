export const TABS = [
  { id: "overview", label: "Overview", theme: "graphite" },
  { id: "google-ads", label: "Google Ads", theme: "google" },
  { id: "meta", label: "Meta", theme: "meta" },
  { id: "tiktok", label: "TikTok", theme: "tiktok" },
  { id: "youtube", label: "YouTube", theme: "youtube" },
  { id: "settings", label: "Settings", theme: "graphite" },
];

const TAB_IDS = new Set(TABS.map((tab) => tab.id));

export function parseHash() {
  const raw = window.location.hash.replace(/^#\/?/, "").split("?")[0];
  return TAB_IDS.has(raw) ? raw : "overview";
}

export function themeFor(tab) {
  return TABS.find((item) => item.id === tab)?.theme || "graphite";
}

export function setTab(tab, { replace = false } = {}) {
  const next = TAB_IDS.has(tab) ? tab : "overview";
  const hash = `#${next}`;
  if (window.location.hash === hash) {
    return false;
  }
  if (replace) {
    history.replaceState(null, "", hash);
  } else {
    history.pushState(null, "", hash);
  }
  return true;
}

export function applyTheme(tab) {
  const theme = themeFor(tab);
  document.body.dataset.theme = theme;
  return theme;
}

export function renderTabs(container, active, onSelect) {
  container.innerHTML = TABS.map(
    (tab) => `<button type="button" class="tab" role="tab" id="tab-${tab.id}" data-tab="${tab.id}"
      aria-controls="view" aria-selected="${tab.id === active}" tabindex="${tab.id === active ? "0" : "-1"}">${tab.label}</button>`,
  ).join("");

  container.querySelectorAll("[role=tab]").forEach((button, index) => {
    button.addEventListener("click", () => onSelect(button.dataset.tab));
    button.addEventListener("keydown", (event) => {
      let nextIndex = null;
      if (event.key === "ArrowRight") nextIndex = (index + 1) % TABS.length;
      else if (event.key === "ArrowLeft") nextIndex = (index - 1 + TABS.length) % TABS.length;
      else if (event.key === "Home") nextIndex = 0;
      else if (event.key === "End") nextIndex = TABS.length - 1;
      if (nextIndex === null) return;
      event.preventDefault();
      const next = container.querySelectorAll("[role=tab]")[nextIndex];
      next.focus();
      onSelect(next.dataset.tab);
    });
  });
}

export function updateTabs(container, active) {
  container.querySelectorAll("[role=tab]").forEach((button) => {
    const selected = button.dataset.tab === active;
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
  });
}
