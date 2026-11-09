import { api } from "../api.js";
import { escapeHtml, toast } from "../utils.js";
import { connectionChips, pageHeader } from "./common.js";

const RANGE_OPTIONS = [
  ["today", "Today"],
  ["yesterday", "Yesterday"],
  ["last_7d", "Last 7 days"],
  ["last_14d", "Last 14 days"],
  ["last_30d", "Last 30 days"],
  ["last_90d", "Last 90 days"],
  ["this_month", "This month"],
  ["last_month", "Last month"],
];

function secretField({ label, name, value, help, required = false }) {
  const isSet = Boolean(value?.isSet);
  return `<div class="field field-wide" data-secret-group="${escapeHtml(name)}" data-mode="keep">
    <label>${escapeHtml(label)}</label>
    <div class="masked-field">
      <span class="masked-value" data-masked ${isSet ? "" : "hidden"}>${isSet ? "•••• " + escapeHtml(value.masked) : ""}</span>
      <input type="password" name="${escapeHtml(name)}" autocomplete="off" spellcheck="false" data-secret-input ${isSet ? "hidden" : ""} placeholder="${isSet ? "New value" : "Not set"}" ${required && !isSet ? "" : ""}>
      <button type="button" class="button button-small" data-replace-secret ${isSet ? "" : "hidden"}>Replace</button>
      <button type="button" class="button button-small" data-clear-secret ${isSet ? "" : "hidden"}>Clear</button>
    </div>
    <span class="help">${escapeHtml(help)}</span>
  </div>`;
}

function switchRow({ name, title, description, checked }) {
  return `<div class="switch-row">
    <div class="switch-copy"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(description)}</span></div>
    <button type="button" class="switch" role="switch" aria-checked="${checked}" data-switch="${escapeHtml(name)}" aria-label="${escapeHtml(title)}"></button>
  </div>`;
}

function timezoneOptions(current) {
  let zones = [];
  try {
    zones = Intl.supportedValuesOf("timeZone");
  } catch {
    zones = ["UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "Europe/London", "Europe/Berlin", "Asia/Tokyo", "Australia/Sydney"];
  }
  if (!zones.includes(current)) zones = [current, ...zones];
  return zones.map((zone) => `<option value="${escapeHtml(zone)}" ${zone === current ? "selected" : ""}>${escapeHtml(zone)}</option>`).join("");
}

function guide({ summary, steps, links = [] }) {
  return `<details class="guide"><summary>${escapeHtml(summary)}</summary><ol>${steps.map((step) => `<li>${step}</li>`).join("")}</ol>${
    links.length ? `<p class="panel-sub" style="margin-top:8px">Official docs: ${links.map((link) => `<a href="${escapeHtml(link.href)}" target="_blank" rel="noreferrer">${escapeHtml(link.label)}</a>`).join(" · ")}</p>` : ""
  }</details>`;
}

function testRow(network, label) {
  return `<div class="settings-actions">
    <button type="button" class="button" data-test="${network}">Test ${escapeHtml(label)}</button>
    <span class="test-result" data-test-result="${network}" hidden></span>
  </div>`;
}

function formButtons(label) {
  return `<div class="settings-actions"><button type="submit" class="button-primary">Save ${escapeHtml(label)}</button><span class="panel-sub" style="margin:0">Secrets never return to the browser.</span></div>`;
}

function collectSecrets(form) {
  const out = {};
  form.querySelectorAll("[data-secret-group]").forEach((group) => {
    const mode = group.dataset.mode;
    const name = group.dataset.secretGroup;
    const input = group.querySelector("[data-secret-input]");
    if (mode === "set") out[name] = input?.value?.trim() || "__KEEP__";
    else if (mode === "clear") out[name] = "__CLEAR__";
  });
  return out;
}

function valueOf(form, name) {
  const field = form.elements.namedItem(name);
  return field && "value" in field ? String(field.value).trim() : "";
}

function list(value) {
  return value
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function bindSwitches(root) {
  root.querySelectorAll("[data-switch]").forEach((button) => {
    button.addEventListener("click", () => {
      button.setAttribute("aria-checked", button.getAttribute("aria-checked") === "true" ? "false" : "true");
    });
  });
}

function switchValue(form, name) {
  return form.querySelector(`[data-switch="${name}"]`)?.getAttribute("aria-checked") === "true";
}

function bindSecrets(root) {
  root.querySelectorAll("[data-secret-group]").forEach((group) => {
    const input = group.querySelector("[data-secret-input]");
    const masked = group.querySelector("[data-masked]");
    const replace = group.querySelector("[data-replace-secret]");
    const clear = group.querySelector("[data-clear-secret]");

    replace?.addEventListener("click", () => {
      group.dataset.mode = "set";
      input.hidden = false;
      masked.hidden = true;
      replace.hidden = true;
      clear.hidden = true;
      input.focus();
    });

    clear?.addEventListener("click", () => {
      group.dataset.mode = "clear";
      input.hidden = true;
      input.value = "";
      masked.hidden = false;
      masked.textContent = "Will be cleared when you save";
      replace.hidden = false;
      clear.hidden = true;
    });

    input?.addEventListener("input", () => {
      if (group.dataset.mode !== "set") group.dataset.mode = "set";
    });
  });
}

function bindTest(root) {
  root.querySelectorAll("[data-test]").forEach((button) => {
    button.addEventListener("click", async () => {
      const network = button.dataset.test;
      const result = root.querySelector(`[data-test-result="${network}"]`);
      button.disabled = true;
      if (result) {
        result.hidden = false;
        result.dataset.ok = "";
        result.textContent = "Testing…";
      }
      try {
        const payload = await api.test(network);
        if (result) {
          result.dataset.ok = "true";
          result.textContent = payload.message || "Connection works.";
        }
        toast("Connection test passed.");
      } catch (error) {
        if (result) {
          result.dataset.ok = "false";
          result.textContent = `${error.message}${error.hint ? ` ${error.hint}` : ""}`;
        }
        toast("Connection test failed.");
      } finally {
        button.disabled = false;
      }
    });
  });
}

function confirmDialog({ title, body, confirmLabel = "Continue", danger = false }) {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.innerHTML = `<div class="dialog-head"><h2>${escapeHtml(title)}</h2><button type="button" class="button-ghost" data-cancel aria-label="Cancel">✕</button></div>
      <div class="dialog-body"><p>${escapeHtml(body)}</p></div>
      <div class="dialog-foot"><button type="button" class="button" data-cancel>Cancel</button><button type="button" class="${danger ? "button-danger" : "button-primary"}" data-confirm>${escapeHtml(confirmLabel)}</button></div>`;
    document.body.appendChild(dialog);
    dialog.showModal();
    const close = (value) => {
      dialog.close();
      dialog.remove();
      resolve(value);
    };
    dialog.querySelectorAll("[data-cancel]").forEach((button) => button.addEventListener("click", () => close(false)));
    dialog.querySelector("[data-confirm]")?.addEventListener("click", () => close(true));
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      close(false);
    });
  });
}

export function renderSettings(boot) {
  const settings = boot.settings || {};
  const g = settings.googleAds || {};
  const m = settings.meta || {};
  const t = settings.tiktok || {};
  const y = settings.youtube || {};
  const versions = settings.apiVersions || {};
  const scopes = boot.scopes || {};

  return `${pageHeader({
    eyebrow: "Control center",
    title: "Settings,<br>without sharp edges.",
    subtitle: "Credentials are encrypted on the server and shown here only as masks. Changing a field never exposes an existing secret.",
    actions: `<span class="source-badge">${boot.demoMode ? "DEMO MODE" : "LIVE MODE"}</span><a class="button button-small" href="/privacy" target="_blank" rel="noreferrer">Privacy</a>`,
    note: true,
  })}
  ${connectionChips(boot.connections, boot.demoMode)}

  <div class="settings-layout">
    <nav class="settings-nav" aria-label="Settings sections">
      <a href="#settings-general">General</a>
      <a href="#settings-google">Google Ads</a>
      <a href="#settings-meta">Meta</a>
      <a href="#settings-tiktok">TikTok</a>
      <a href="#settings-youtube">YouTube</a>
      <a href="#settings-security">Security</a>
      <a href="#settings-danger">Danger zone</a>
    </nav>
    <div>
      <section class="settings-section" id="settings-general">
        <h2>General</h2>
        <p class="settings-sub">Demo mode is on by default. When it is on, every network uses deterministic sample data, clearly marked DEMO DATA, and no external API is called.</p>
        <form data-settings-form="general">
          ${switchRow({ name: "demoMode", title: "Demo mode", description: "Use built-in sample data for all networks. No live credentials are contacted.", checked: Boolean(settings.demoMode) })}
          ${switchRow({ name: "reduceMotion", title: "Reduce motion", description: "Stop the funnel animation and the cursor follower. Honours your operating system preference too.", checked: Boolean(settings.reduceMotion) })}
          <div class="field-grid" style="margin-top:14px">
            <div class="field"><label for="timezone">Timezone</label><select id="timezone" name="timezone">${timezoneOptions(settings.timezone || "UTC")}</select><span class="help">Used for “today”, month boundaries and API date ranges. Accounts may still report in their own timezone.</span></div>
            <div class="field"><label for="defaultRange">Default date range</label><select id="defaultRange" name="defaultRange">${RANGE_OPTIONS.map(
              ([key, label]) => `<option value="${key}" ${settings.defaultRange === key ? "selected" : ""}>${label}</option>`,
            ).join("")}</select><span class="help">The range selected when the dashboard first opens.</span></div>
            <div class="field"><label for="googleVersion">Google Ads API version</label><input id="googleVersion" name="googleVersion" type="text" value="${escapeHtml(versions.googleAds || "v26")}" pattern="v[0-9]+(\\.[0-9]+)?"><span class="help">Pinned deliberately. Update only after checking Google's release notes.</span></div>
            <div class="field"><label for="metaVersion">Meta API version</label><input id="metaVersion" name="metaVersion" type="text" value="${escapeHtml(versions.meta || "v26.0")}" pattern="v[0-9]+(\\.[0-9]+)?"><span class="help">Graph API version used for Insights.</span></div>
            <div class="field"><label for="tiktokVersion">TikTok API version</label><input id="tiktokVersion" name="tiktokVersion" type="text" value="${escapeHtml(versions.tiktok || "v1.3")}" pattern="v[0-9]+(\\.[0-9]+)?"><span class="help">TikTok Business API path version.</span></div>
          </div>
          ${formButtons("general settings")}
        </form>
      </section>

      <section class="settings-section" id="settings-google">
        <h2>Google Ads</h2>
        <p class="settings-sub">Read-only access through the Google Ads API. The scope requested is <code>https://www.googleapis.com/auth/adwords</code>; Kampa never calls a mutate endpoint.</p>
        <form data-settings-form="googleAds">
          <div class="field-grid">
            ${secretField({ label: "Developer token", name: "developerToken", value: g.developerToken, help: "From the Google Ads API Center. Required for every request." })}
            ${secretField({ label: "OAuth client ID", name: "clientId", value: g.clientId, help: "From a Google Cloud OAuth 2.0 client of type “Web application”." })}
            ${secretField({ label: "OAuth client secret", name: "clientSecret", value: g.clientSecret, help: "Stored encrypted and never sent to the browser." })}
            ${secretField({ label: "Refresh token", name: "refreshToken", value: g.refreshToken, help: "Created with the adwords scope. Kampa exchanges it for short-lived access tokens on the server." })}
            <div class="field"><label for="googleLogin">Manager account ID (optional)</label><input id="googleLogin" name="loginCustomerId" type="text" value="${escapeHtml(g.loginCustomerId || "")}" placeholder="1234567890"><span class="help">Used as the login-customer-id header when access is through a manager account.</span></div>
            <div class="field"><label for="googleCustomers">Customer IDs</label><input id="googleCustomers" name="customerIds" type="text" value="${escapeHtml((g.customerIds || []).join(", "))}" placeholder="1234567890, 0987654321"><span class="help">Ten-digit IDs, comma separated. Dashes are fine and are removed server-side.</span></div>
          </div>
          ${testRow("googleAds", "Google Ads")}
          ${guide({
            summary: "How to get Google Ads credentials",
            steps: [
              "Apply for a developer token in your Google Ads manager account under Tools → API Center.",
              "Create an OAuth 2.0 web client in Google Cloud and add the authorized redirect URI for your own consent flow.",
              "Request the <code>https://www.googleapis.com/auth/adwords</code> scope and exchange the authorization code for a refresh token.",
              "Paste the developer token, client ID, client secret, refresh token and customer IDs above, then save and test.",
            ],
            links: [
              { href: "https://developers.google.com/google-ads/api/docs/get-started/dev-token", label: "Developer token" },
              { href: "https://developers.google.com/identity/protocols/oauth2", label: "OAuth 2.0" },
            ],
          })}
          ${formButtons("Google Ads")}
        </form>
      </section>

      <section class="settings-section" id="settings-meta">
        <h2>Meta</h2>
        <p class="settings-sub">Marketing API access with <code>ads_read</code>. Kampa only lists accounts and reads Insights, campaigns, ad sets and ads. No write calls.</p>
        <form data-settings-form="meta">
          <div class="field-grid">
            ${secretField({ label: "Access token", name: "accessToken", value: m.accessToken, help: "A long-lived user or system-user token with ads_read. Avoid short-lived tokens." })}
            ${secretField({ label: "App ID (optional)", name: "appId", value: m.appId, help: "Only needed if you exchange tokens yourself. Reporting works with the access token alone." })}
            ${secretField({ label: "App secret (optional)", name: "appSecret", value: m.appSecret, help: "Used only for appsecret_proof if your app requires it." })}
            <div class="field"><label for="metaAccounts">Ad account IDs</label><input id="metaAccounts" name="adAccountIds" type="text" value="${escapeHtml((m.adAccountIds || []).join(", "))}" placeholder="act_1234567890"><span class="help">Optional. If empty, Kampa lists the accounts available to the token.</span></div>
          </div>
          ${testRow("meta", "Meta")}
          ${guide({
            summary: "How to get Meta credentials",
            steps: [
              "Create a Meta app and add the Marketing API product.",
              "Generate a user or system-user access token with <code>ads_read</code> and, if you only want automatic account discovery, <code>business_management</code>.",
              "Copy the token and the ad account ID (it starts with <code>act_</code>) above.",
              "For very large accounts, set <code>META_ASYNC_ENABLED=true</code> so reports use asynchronous Insights jobs.",
            ],
            links: [{ href: "https://developers.facebook.com/docs/marketing-api/get-started", label: "Marketing API get started" }],
          })}
          ${formButtons("Meta")}
        </form>
      </section>

      <section class="settings-section" id="settings-tiktok">
        <h2>TikTok</h2>
        <p class="settings-sub">TikTok Marketing API reporting and object reads. The optional Commercial Content API is a separate public Ad Library dataset and is never mixed with performance data.</p>
        <form data-settings-form="tiktok">
          <div class="field-grid">
            ${secretField({ label: "App ID", name: "appId", value: t.appId, help: "From the TikTok for Business developer portal." })}
            ${secretField({ label: "App secret", name: "appSecret", value: t.appSecret, help: "Stored encrypted on the server." })}
            ${secretField({ label: "Access token", name: "accessToken", value: t.accessToken, help: "An authorized advertiser access token with reporting permissions." })}
            <div class="field"><label for="tiktokAdvertisers">Advertiser IDs</label><input id="tiktokAdvertisers" name="advertiserIds" type="text" value="${escapeHtml((t.advertiserIds || []).join(", "))}" placeholder="7000000000000000000"><span class="help">Comma separated advertiser IDs. Required for live reporting.</span></div>
          </div>
          <h3 style="font-size:14px;margin:18px 0 4px">Commercial Content API (optional)</h3>
          <p class="panel-sub">Public Ad Library only. TikTok grants this separately and only for EU/EEA, GB and CH ads. It cannot read private performance data.</p>
          <div class="field-grid">
            ${secretField({ label: "Commercial Content client key", name: "ccClientKey", value: t.ccClientKey, help: "Separate credential from the research API approval." })}
            ${secretField({ label: "Commercial Content client secret", name: "ccClientSecret", value: t.ccClientSecret, help: "Stored encrypted." })}
            ${secretField({ label: "Commercial Content access token", name: "ccAccessToken", value: t.ccAccessToken, help: "Optional if you prefer a pre-issued token over key/secret exchange." })}
          </div>
          ${testRow("tiktok", "TikTok")}
          ${testRow("tiktokAdlib", "Commercial Content")}
          ${guide({
            summary: "How to get TikTok credentials",
            steps: [
              "Create an app in the TikTok for Business developer portal and request Marketing API reporting access.",
              "Authorize an advertiser and copy the access token and advertiser ID.",
              "For the Ad Library, apply separately for Commercial Content API research access and copy its client key and secret.",
              "If TikTok has not approved the research scope, leave those fields empty; the Ad Library section will explain that access is pending.",
            ],
            links: [{ href: "https://business-api.tiktok.com/portal/docs", label: "TikTok Business API docs" }],
          })}
          ${formButtons("TikTok")}
        </form>
      </section>

      <section class="settings-section" id="settings-youtube">
        <h2>YouTube</h2>
        <p class="settings-sub">Read-only channel analytics. YouTube data is memory-only, never logged, never exported, never persisted, and never added to advertising totals.</p>
        <form data-settings-form="youtube">
          <div class="field-grid">
            ${secretField({ label: "OAuth client ID", name: "clientId", value: y.clientId, help: "A Google Cloud OAuth client for the YouTube project." })}
            ${secretField({ label: "OAuth client secret", name: "clientSecret", value: y.clientSecret, help: "Stored encrypted on the server." })}
            ${secretField({ label: "Refresh token", name: "refreshToken", value: y.refreshToken, help: "Needs youtube.readonly and yt-analytics.readonly. Add yt-analytics-monetary.readonly only for monetized channels." })}
            <div class="field"><label for="youtubeChannel">Channel ID (optional)</label><input id="youtubeChannel" name="channelId" type="text" value="${escapeHtml(y.channelId || "")}" placeholder="UC…"><span class="help">Leave empty to use the authenticated user's own channel.</span></div>
            <div class="field"><label for="youtubeTitle">Channel title (optional)</label><input id="youtubeTitle" name="channelTitle" type="text" value="${escapeHtml(y.channelTitle || "")}" placeholder="Northwind Studio"><span class="help">A label for your own reference. It is not used in API calls.</span></div>
          </div>
          ${switchRow({ name: "monetized", title: "This channel is monetized", description: "Show revenue, CPM and monetized playback metrics. Requires the optional monetary scope.", checked: Boolean(y.monetized) })}
          <div class="scope-list">${(scopes.youtube || []).map((scope) => `<code>${escapeHtml(scope)}</code>`).join("")}</div>
          ${testRow("youtube", "YouTube")}
          <div class="settings-actions" style="margin-top:14px">
            <button type="button" class="button-danger" data-disconnect-youtube>Disconnect and delete my YouTube data</button>
          </div>
          <p class="panel-sub" style="margin-top:8px">This revokes the token with Google where possible, clears every YouTube memory cache entry and deletes the stored YouTube credentials immediately.</p>
          ${guide({
            summary: "How to get YouTube credentials",
            steps: [
              "Enable the YouTube Analytics API and YouTube Data API v3 in Google Cloud.",
              "Create an OAuth 2.0 client and request <code>https://www.googleapis.com/auth/youtube.readonly</code> and <code>https://www.googleapis.com/auth/yt-analytics.readonly</code>.",
              "Only for monetized channels, also request <code>https://www.googleapis.com/auth/yt-analytics-monetary.readonly</code>.",
              "Exchange the authorization code for a refresh token and paste it above. A dedicated Google Cloud project is recommended.",
            ],
            links: [
              { href: "https://developers.google.com/youtube/analytics/register", label: "YouTube Analytics API registration" },
              { href: "https://developers.google.com/youtube/terms/developer-policies", label: "Developer policies" },
            ],
          })}
          ${formButtons("YouTube")}
        </form>
      </section>

      <section class="settings-section" id="settings-security">
        <h2>Security</h2>
        <div class="detail-list">
          <div><span>Read-only</span><strong>No mutate endpoints</strong></div>
          <div><span>Secret storage</span><strong>AES-256-GCM</strong></div>
          <div><span>Browser exposure</span><strong>Masks only</strong></div>
          <div><span>Session cookie</span><strong>${boot.auth?.required ? "Signed · HttpOnly · SameSite=Strict" : "Not required"}</strong></div>
          <div><span>YouTube persistence</span><strong>Never</strong></div>
        </div>
        <p class="panel-sub" style="margin-top:12px">${
          boot.auth?.required
            ? `Password protection is active. <button type="button" class="button button-small" data-logout>Sign out</button>`
            : "Password protection is off. Set <code>APP_PASSWORD</code> in <code>.env.local</code> to require a password before any page or API call."
        }</p>
        <p class="panel-sub">Only these scopes are used: <code>adwords</code>, <code>ads_read</code>, TikTok reporting, <code>youtube.readonly</code>, <code>yt-analytics.readonly</code> and optional <code>yt-analytics-monetary.readonly</code>. No secrets are exposed through <code>NEXT_PUBLIC_</code> variables.</p>
        <p class="panel-sub"><a href="/privacy" target="_blank" rel="noreferrer">Privacy and YouTube deletion policy</a></p>
      </section>

      <section class="settings-section danger" id="settings-danger">
        <h2>Danger zone</h2>
        <p class="settings-sub">Delete all stored settings, including every encrypted credential, and clear the in-memory data cache. Environment variables such as APP_SECRET are not touched.</p>
        <button type="button" class="button-danger" data-delete-all>Delete all stored settings and caches</button>
      </section>
    </div>
  </div>`;
}

export function bindSettings(root, ctx) {
  bindSwitches(root);
  bindSecrets(root);
  bindTest(root);

  root.querySelector('[data-settings-form="general"]')?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      const payload = await api.saveSettings({
        demoMode: switchValue(form, "demoMode"),
        reduceMotion: switchValue(form, "reduceMotion"),
        timezone: valueOf(form, "timezone"),
        defaultRange: valueOf(form, "defaultRange"),
        apiVersions: {
          googleAds: valueOf(form, "googleVersion"),
          meta: valueOf(form, "metaVersion"),
          tiktok: valueOf(form, "tiktokVersion"),
        },
      });
      toast(payload.message || "Settings saved.");
      await ctx.onSettingsSaved(payload);
    } catch (error) {
      toast(`${error.message}${error.hint ? ` ${error.hint}` : ""}`);
    } finally {
      submit.disabled = false;
    }
  });

  const networkForms = {
    googleAds: (form) => ({
      ...collectSecrets(form),
      loginCustomerId: valueOf(form, "loginCustomerId"),
      customerIds: list(valueOf(form, "customerIds")),
    }),
    meta: (form) => ({
      ...collectSecrets(form),
      adAccountIds: list(valueOf(form, "adAccountIds")),
    }),
    tiktok: (form) => ({
      ...collectSecrets(form),
      advertiserIds: list(valueOf(form, "advertiserIds")),
    }),
    youtube: (form) => ({
      ...collectSecrets(form),
      channelId: valueOf(form, "channelId"),
      channelTitle: valueOf(form, "channelTitle"),
      monetized: switchValue(form, "monetized"),
    }),
  };

  for (const [network, collect] of Object.entries(networkForms)) {
    root.querySelector(`[data-settings-form="${network}"]`)?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true;
      try {
        const payload = await api.saveSettings({ [network]: collect(form) });
        toast(payload.message || "Settings saved.");
        await ctx.onSettingsSaved(payload);
      } catch (error) {
        toast(`${error.message}${error.hint ? ` ${error.hint}` : ""}`);
      } finally {
        submit.disabled = false;
      }
    });
  }

  root.querySelector("[data-disconnect-youtube]")?.addEventListener("click", async () => {
    const ok = await confirmDialog({
      title: "Delete YouTube data?",
      body: "This revokes the Google token where possible, clears all YouTube memory caches and deletes the stored YouTube credentials. It cannot be undone.",
      confirmLabel: "Delete YouTube data",
      danger: true,
    });
    if (!ok) return;
    try {
      const payload = await api.disconnectYouTube();
      toast(payload.message || "YouTube data deleted.");
      await ctx.reloadBoot();
    } catch (error) {
      toast(`${error.message}${error.hint ? ` ${error.hint}` : ""}`);
    }
  });

  root.querySelector("[data-delete-all]")?.addEventListener("click", async () => {
    const ok = await confirmDialog({
      title: "Delete all settings?",
      body: "Every encrypted credential and every cached API response will be deleted. This cannot be undone. Environment variables are not touched.",
      confirmLabel: "Delete everything",
      danger: true,
    });
    if (!ok) return;
    try {
      const payload = await api.deleteAll();
      toast(payload.message || "All stored settings deleted.");
      await ctx.reloadBoot();
    } catch (error) {
      toast(`${error.message}${error.hint ? ` ${error.hint}` : ""}`);
    }
  });

  root.querySelector("[data-logout]")?.addEventListener("click", async () => {
    try {
      await api.logout();
      window.location.reload();
    } catch {
      toast("Could not sign out.");
    }
  });
}
