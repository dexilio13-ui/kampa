import { api, ApiError } from "./api.js";
import { store, savePrefs, clearData } from "./state.js";
import { parseHash, setTab, applyTheme, renderTabs, updateTabs, TABS } from "./router.js";
import { createBackground } from "./background.js";
import { createCursor } from "./cursor.js";
import { toast, escapeHtml } from "./utils.js";
import { renderOverview } from "./views/overview.js";
import { renderGoogle, bindGoogle } from "./views/google.js";
import { renderMeta, bindMeta } from "./views/meta.js";
import { renderTikTok, bindTikTok } from "./views/tiktok.js";
import { renderYouTube, bindYouTube } from "./views/youtube.js";
import { renderSettings, bindSettings } from "./views/settings.js";
import { errorHtml, loadingHtml, pageHeader } from "./views/common.js";

const RANGE_OPTIONS = [
  ["today", "Today"],
  ["yesterday", "Yesterday"],
  ["last_7d", "Last 7 days"],
  ["last_14d", "Last 14 days"],
  ["last_30d", "Last 30 days"],
  ["last_90d", "Last 90 days"],
  ["this_month", "This month"],
  ["last_month", "Last month"],
  ["custom", "Custom…"],
];

const DATA_TABS = new Set(["overview", "google-ads", "meta", "tiktok", "youtube"]);

export function mount(root) {
  if (!root) return { unmount() {} };

  let disposed = false;
  let booted = false;
  let reducedMotion = false;
  let refreshBusy = false;
  const loadSeq = { overview: 0, "google-ads": 0, meta: 0, tiktok: 0, youtube: 0 };
  const pointer = { x: 0, y: 0, active: false };

  root.innerHTML = `
    <canvas id="funnel-bg" aria-hidden="true"></canvas>
    <div class="cursor-ring" id="cursor-ring" aria-hidden="true"></div>
    <a class="skip-link" href="#main">Skip to dashboard</a>
    <header class="topbar" id="topbar">
      <div class="topbar-inner">
        <a class="brand" href="#overview" aria-label="AdPulse overview">
          <span class="brand-mark" aria-hidden="true">AP</span><span class="brand-name">AdPulse</span>
        </a>
        <span class="demo-badge" id="demo-badge" hidden>DEMO DATA</span>
        <nav class="tablist" id="tablist" role="tablist" aria-label="Networks and settings"></nav>
        <div class="topbar-controls">
          <label class="control"><span class="control-label">Date range</span>
            <select id="range-select" aria-label="Date range">
              ${RANGE_OPTIONS.map(([key, label]) => `<option value="${key}">${label}</option>`).join("")}
            </select>
          </label>
          <button type="button" id="refresh-button">Refresh</button>
        </div>
      </div>
    </header>
    <main class="page" id="main">
      <div id="view" role="tabpanel" tabindex="0" aria-live="polite"></div>
    </main>`;

  const topbar = root.querySelector("#topbar");
  const main = root.querySelector("#main");
  const view = root.querySelector("#view");
  const tablist = root.querySelector("#tablist");
  const demoBadge = root.querySelector("#demo-badge");
  const rangeSelect = root.querySelector("#range-select");
  const refreshButton = root.querySelector("#refresh-button");

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const background = createBackground(root.querySelector("#funnel-bg"), pointer, { reducedMotion: reducedMotion });
  const cursor = createCursor(root.querySelector("#cursor-ring"), pointer, reducedMotion);

  function applyMotion(serverSetting) {
    reducedMotion = Boolean(serverSetting) || motionQuery.matches;
    background.setReducedMotion(reducedMotion);
    cursor.setReducedMotion?.(reducedMotion);
    document.body.dataset.reducedMotion = String(reducedMotion);
  }

  function onMotionChange() {
    applyMotion(store.settings?.reduceMotion);
  }
  motionQuery.addEventListener?.("change", onMotionChange);

  function effectivePreset() {
    if (store.rangePreset === "custom" && (!store.customStart || !store.customEnd)) return "last_7d";
    return store.rangePreset;
  }

  function effectiveRangeParams() {
    const preset = effectivePreset();
    if (preset === "custom") return { preset: "custom", start: store.customStart, end: store.customEnd };
    return { preset };
  }

  function updateDemoBadge() {
    demoBadge.hidden = !store.boot?.demoMode;
  }

  function updateRangeSelect() {
    rangeSelect.value = effectivePreset();
  }

  function queryFor(tab, refresh = false) {
    const params = effectiveRangeParams();
    if (tab === "google-ads") {
      const q = store.queries.google;
      return {
        subtab: q.subtab,
        level: q.level,
        account: q.accountId || undefined,
        ...params,
        refresh: refresh ? "1" : undefined,
      };
    }
    if (tab === "meta") {
      const q = store.queries.meta;
      return {
        level: q.level,
        platform: q.platform,
        actionType: q.actionType,
        account: q.accountId || undefined,
        ...params,
        refresh: refresh ? "1" : undefined,
      };
    }
    if (tab === "tiktok") {
      const q = store.queries.tiktok;
      return {
        level: q.level,
        account: q.accountId || undefined,
        ...params,
        refresh: refresh ? "1" : undefined,
      };
    }
    if (tab === "youtube") {
      const q = store.queries.youtube;
      return {
        level: q.level,
        dimension: q.dimension,
        ...params,
        refresh: refresh ? "1" : undefined,
      };
    }
    return { ...params, refresh: refresh ? "1" : undefined };
  }

  function viewContext(tab) {
    return {
      load: () => {
        delete store.data[tab];
        loadTab(tab);
      },
      refresh: () => refreshActive(),
      render: () => paint(tab),
      getData: () => store.data[tab],
      onSettingsSaved: async () => {
        await reloadBoot();
        toast("Settings saved and connections refreshed.");
      },
      reloadBoot: async () => {
        await reloadBoot();
      },
    };
  }

  function paint(tab) {
    if (disposed || tab !== store.tab) return;
    const data = store.data[tab];
    const error = store.errors[tab];
    const loading = Boolean(store.loading[tab]);
    let html = "";

    if (tab === "overview") {
      html = error
        ? pageHeader({ eyebrow: "Command center", title: "Overview", subtitle: "A read-only pulse across connected advertising networks." }) + errorHtml(error)
        : loading || !data
          ? pageHeader({ eyebrow: "Command center", title: "Every channel, one calm pulse.", subtitle: "Building a read-only view of your connected networks." }) + loadingHtml("Reading connected networks")
          : renderOverview(data);
    } else if (tab === "google-ads") {
      html = renderGoogle(data, store.boot, { loading, error });
    } else if (tab === "meta") {
      document.body.dataset.metaView = store.queries.meta.platform === "instagram" ? "instagram" : "facebook";
      html = renderMeta(data, store.boot, { loading, error });
    } else if (tab === "tiktok") {
      html = renderTikTok(data, store.boot, { loading, error });
    } else if (tab === "youtube") {
      html = renderYouTube(data, store.boot, { loading, error });
    } else if (tab === "settings") {
      html = renderSettings(store.boot);
    }

    view.innerHTML = html;
    view.setAttribute("aria-labelledby", `tab-${tab}`);

    if (error) {
      view.querySelector('[data-action="retry"]')?.addEventListener("click", () => loadTab(tab));
    }
    const ctx = viewContext(tab);
    if (tab === "google-ads") bindGoogle(view, ctx);
    else if (tab === "meta") bindMeta(view, ctx);
    else if (tab === "tiktok") bindTikTok(view, ctx);
    else if (tab === "youtube") bindYouTube(view, ctx);
    else if (tab === "settings") bindSettings(view, ctx);
  }

  async function loadTab(tab, options = {}) {
    if (disposed || !DATA_TABS.has(tab)) return;
    const seq = ++loadSeq[tab];
    store.loading[tab] = true;
    store.errors[tab] = null;
    paint(tab);

    try {
      const params = queryFor(tab, Boolean(options.refresh));
      const data = tab === "overview" ? await api.overview(params) : await api.data(tab, params);
      if (disposed || seq !== loadSeq[tab] || tab !== store.tab) return;
      store.data[tab] = data;
      store.loading[tab] = false;
      store.errors[tab] = null;
      if (data.source && data.source !== "demo" && store.boot?.demoMode) {
        store.boot.demoMode = false;
        updateDemoBadge();
      }
      paint(tab);
    } catch (error) {
      if (disposed || seq !== loadSeq[tab] || tab !== store.tab) return;
      store.loading[tab] = false;
      if (error instanceof ApiError && error.status === 401) {
        showLogin("Your session expired. Enter the password again.");
        return;
      }
      store.errors[tab] = error;
      paint(tab);
    }
  }

  async function refreshActive() {
    if (refreshBusy || !store.boot) return;
    if (store.tab === "settings") {
      await reloadBoot();
      toast("Settings reloaded.");
      return;
    }
    refreshBusy = true;
    refreshButton.disabled = true;
    delete store.data[store.tab];
    await loadTab(store.tab, { refresh: true });
    refreshBusy = false;
    refreshButton.disabled = false;
  }

  function applyBoot(boot) {
    store.boot = boot;
    store.settings = boot.settings;
    store.catalogs = boot.catalogs || {};
    if (!booted) {
      booted = true;
      const hasPrefs = Boolean(localStorage.getItem("adpulse.prefs.v1"));
      if (!hasPrefs && boot.settings?.defaultRange) store.rangePreset = boot.settings.defaultRange;
    }
    if (!RANGE_OPTIONS.some(([key]) => key === store.rangePreset)) store.rangePreset = "last_7d";
    updateDemoBadge();
    updateRangeSelect();
    applyMotion(boot.settings?.reduceMotion);
    renderTabs(tablist, store.tab, (tab) => navigate(tab));
    updateTabs(tablist, store.tab);
    applyTheme(store.tab);
    document.body.dataset.metaView = store.queries.meta.platform === "instagram" ? "instagram" : "facebook";
    requestAnimationFrame(() => background.refresh());
  }

  async function reloadBoot() {
    try {
      const boot = await api.bootstrap();
      applyBoot(boot);
      clearData();
      if (store.tab === "settings") {
        paint("settings");
      } else {
        await loadTab(store.tab);
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        showLogin("Your session expired. Enter the password again.");
        return;
      }
      toast(error.message || "Could not reload settings.");
    }
  }

  function activate(tab) {
    if (disposed || !store.boot) return;
    const next = TABS.some((item) => item.id === tab) ? tab : "overview";
    store.tab = next;
    updateTabs(tablist, next);
    applyTheme(next);
    document.body.dataset.metaView = store.queries.meta.platform === "instagram" ? "instagram" : "facebook";
    requestAnimationFrame(() => background.refresh());
    if (next === "settings") {
      paint(next);
      return;
    }
    if (store.data[next] && !store.errors[next]) {
      paint(next);
      return;
    }
    paint(next);
    loadTab(next);
  }

  function navigate(tab) {
    if (!store.boot) return;
    setTab(tab);
    activate(tab);
  }

  function onHashChange() {
    if (!store.boot) return;
    const tab = parseHash();
    if (tab === store.tab) return;
    activate(tab);
  }

  function onRangeChange() {
    const chosen = rangeSelect.value;
    if (chosen === "custom") {
      openCustomRange()
        .then((applied) => {
          if (!applied) {
            updateRangeSelect();
            return;
          }
          store.rangePreset = "custom";
          savePrefs({ rangePreset: "custom", customStart: store.customStart, customEnd: store.customEnd });
          clearData();
          if (store.tab !== "settings") loadTab(store.tab);
        })
        .catch(() => updateRangeSelect());
      return;
    }
    store.rangePreset = chosen;
    savePrefs({ rangePreset: chosen });
    clearData();
    if (store.tab !== "settings") loadTab(store.tab);
  }

  function openCustomRange() {
    return new Promise((resolve) => {
      const dialog = document.createElement("dialog");
      const today = new Date().toISOString().slice(0, 10);
      const fallbackEnd = today;
      const fallbackStart = new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10);
      dialog.innerHTML = `<form method="dialog">
        <div class="dialog-head"><h2>Custom date range</h2><button type="button" class="button-ghost" data-cancel aria-label="Close">✕</button></div>
        <div class="dialog-body">
          <p class="panel-sub">Dates are calendar dates in ${escapeHtml(store.settings?.timezone || "UTC")}. The API receives inclusive start and end dates.</p>
          <div class="field-grid">
            <div class="field"><label for="custom-start">Start</label><input id="custom-start" type="date" value="${escapeHtml(store.customStart || fallbackStart)}" max="${today}"></div>
            <div class="field"><label for="custom-end">End</label><input id="custom-end" type="date" value="${escapeHtml(store.customEnd || fallbackEnd)}" max="${today}"></div>
          </div>
          <p class="login-error" data-range-error role="alert"></p>
        </div>
        <div class="dialog-foot"><button type="button" class="button" data-cancel>Cancel</button><button type="button" class="button-primary" data-apply>Apply range</button></div>
      </form>`;
      document.body.appendChild(dialog);
      dialog.showModal();
      const close = (value) => {
        dialog.close();
        dialog.remove();
        resolve(value);
      };
      dialog.querySelectorAll("[data-cancel]").forEach((button) => button.addEventListener("click", () => close(false)));
      dialog.querySelector("[data-apply]")?.addEventListener("click", () => {
        const start = dialog.querySelector("#custom-start").value;
        const end = dialog.querySelector("#custom-end").value;
        const error = dialog.querySelector("[data-range-error]");
        if (!start || !end) {
          error.textContent = "Choose both a start and an end date.";
          return;
        }
        if (start > end) {
          error.textContent = "The start date must be before the end date.";
          return;
        }
        store.customStart = start;
        store.customEnd = end;
        close(true);
      });
      dialog.addEventListener("cancel", (event) => {
        event.preventDefault();
        close(false);
      });
      dialog.addEventListener("close", () => {
        if (dialog.isConnected) {
          dialog.remove();
          resolve(false);
        }
      });
      dialog.querySelector("#custom-start")?.focus();
    });
  }

  function showLogin(message = "") {
    if (disposed) return;
    store.boot = null;
    topbar.hidden = true;
    main.hidden = true;
    document.querySelector("#login-screen")?.remove();
    const login = document.createElement("div");
    login.className = "login-screen";
    login.id = "login-screen";
    login.innerHTML = `<div class="login-card">
      <div class="eyebrow">AdPulse · private instance</div>
      <h1>Enter the dashboard</h1>
      <p>This instance is protected by a password. The password is checked on the server; no data is sent before you sign in.</p>
      <form id="login-form">
        <label class="field"><span>Password</span><input type="password" name="password" autocomplete="current-password" required autofocus></label>
        <p class="login-error" id="login-error" role="alert">${escapeHtml(message)}</p>
        <button type="submit" class="button-primary">Unlock AdPulse</button>
      </form>
      <p class="panel-sub" style="margin-top:14px">Read-only reporting. Credentials stay on this server.</p>
    </div>`;
    root.appendChild(login);
    const form = login.querySelector("#login-form");
    const error = login.querySelector("#login-error");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = form.querySelector("button");
      button.disabled = true;
      error.textContent = "";
      try {
        await api.login(new FormData(form).get("password") || "");
        login.remove();
        topbar.hidden = false;
        main.hidden = false;
        await init();
      } catch (loginError) {
        error.textContent = `${loginError.message}${loginError.hint ? ` ${loginError.hint}` : ""}`;
        button.disabled = false;
      }
    });
    form.querySelector("input")?.focus();
  }

  function renderFatal(error) {
    topbar.hidden = true;
    view.innerHTML = `<div class="fatal"><h1>AdPulse could not start</h1><p>${escapeHtml(error?.message || "The server did not answer.")}</p><p class="panel-sub">${escapeHtml(error?.hint || "Check the server log and your .env.local file.")}</p></div>`;
  }

  async function init() {
    if (disposed) return;
    try {
      const boot = await api.bootstrap();
      if (disposed) return;
      if (!window.location.hash) history.replaceState(null, "", `#${parseHash()}`);
      store.tab = parseHash();
      applyBoot(boot);
      activate(store.tab);
    } catch (error) {
      if (disposed) return;
      if (error instanceof ApiError && error.status === 401) {
        showLogin();
        return;
      }
      renderFatal(error);
    }
  }

  rangeSelect.addEventListener("change", onRangeChange);
  refreshButton.addEventListener("click", refreshActive);
  window.addEventListener("hashchange", onHashChange);
  window.addEventListener("popstate", onHashChange);

  init();

  return {
    unmount() {
      disposed = true;
      motionQuery.removeEventListener?.("change", onMotionChange);
      rangeSelect.removeEventListener("change", onRangeChange);
      refreshButton.removeEventListener("click", refreshActive);
      window.removeEventListener("hashchange", onHashChange);
      window.removeEventListener("popstate", onHashChange);
      background.destroy();
      cursor.destroy();
      document.querySelector("#login-screen")?.remove();
      document.querySelector("#columns-dialog")?.remove();
      document.querySelector("#toast")?.remove();
      if (root) root.innerHTML = "";
    },
  };
}
