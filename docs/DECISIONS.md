# Decisions

## 1. Next.js server with a vanilla browser UI

**Decision:** Use Next.js 15/React 19 only as a shell and API host. The dashboard is hand-written ES modules in `vanilla/`, mounted by `app/ClientShell.tsx`.

**Why:** The product calls for a distinctive visual layer, charts, canvas animation, and a small bundle. A vanilla view layer avoids shipping a component framework twice and keeps rendering predictable.

**Consequence:** React does not own dashboard state. The router, API client, and views are separate modules with no build-time framework. Shared UI helpers stay in `vanilla/`.

## 2. Enforce read-only access centrally, not per client

**Decision:** Every outbound provider call goes through `apiFetch`, which checks an exact allowlist of host, method, and path. Clients cannot call `fetch` directly.

**Why:** A UI-level “read-only” label is not a security boundary. A central gate makes review and testing possible.

**Consequence:** New endpoints require a deliberate allowlist edit and test update. This is intentionally friction-heavy. Only the explicitly reviewed POSTs are allowed.

## 3. Demo data through the production normalization path

**Decision:** Demo fixtures produce provider-shaped rows, then flow through the same normalizers and aggregates as live data.

**Why:** Separate demo rendering would hide normalization bugs until a live account was connected.

**Consequence:** Demo totals and comparisons exercise micros, percentages, action types, currencies, and levels. Demo mode makes no provider calls.

## 4. No fake data in live mode

**Decision:** When demo mode is off, missing credentials produce a disconnected state or an error. There is no fallback sample data and no silent placeholder.

**Why:** A metrics dashboard must not be mistaken for real performance.

**Consequence:** A partially configured live dashboard can be empty by network. The UI explains the connection state instead of fabricating values.

## 5. Encrypted settings file, not a database

**Decision:** Store settings in `data/settings.enc.json` using AES-256-GCM with `APP_SECRET`. Write atomically with mode `0600`.

**Why:** This is a single-instance, local-only reporting tool. A database would add operational surface without improving the threat model.

**Consequence:** Changing or losing `APP_SECRET` makes existing settings unreadable. There is no multi-user account separation; deploy one instance per trust boundary.

## 6. Optional password gate, no user accounts

**Decision:** `APP_PASSWORD` enables a single shared password. Successful login sets a signed seven-day `HttpOnly`, `SameSite=Strict` cookie. Failed attempts are throttled in memory.

**Why:** The app is intended for a private deployment, not a multi-tenant SaaS.

**Consequence:** There is no per-user audit trail or role model. In production the cookie is `Secure`, so the app should be served over HTTPS. An in-memory throttle resets when the process restarts.

## 7. Exact provider versions as configurable defaults

**Decision:** Default to Google Ads `v26`, Meta `v26.0`, and TikTok `v1.3`; allow environment overrides after validation.

**Why:** Provider versions change on their own schedules. Hard-coding a version without a live check would be worse than making it explicit and configurable.

**Consequence:** Version availability is marked unverified. If a provider rejects the version, the operator can change the environment and restart without a code change.

## 8. Runtime field verification for Google Ads

**Decision:** Fetch Google Ads metric metadata with `googleAdsFields:search` and hide unconfirmed metrics. If metadata fails, show only conservative defaults.

**Why:** A seed catalog can drift from the live API. Silently querying unknown fields would break reports.

**Consequence:** Live mode performs an extra metadata call and caches it. Experimental metrics are available only in demo mode. The field set is verified; actual report execution still requires a live account.

## 9. Conservative Meta Insights fields

**Decision:** Request only core identifiers and dates from Insights. Read objective, budget, bid strategy, and status from campaign objects instead of adding them to the Insights field list.

**Why:** Adding unverified fields makes reports fail. Campaign object fields are a more defensible source for those attributes.

**Consequence:** Some campaign attributes may be absent for non-campaign levels. The UI handles missing values rather than inventing them.

## 10. Async Meta jobs are opt-in

**Decision:** Use synchronous paginated Insights by default. Allow asynchronous report jobs only with `META_ASYNC_ENABLED=true`.

**Why:** Async job status fields and polling behavior are not live-verified, and polling can hold a request for about a minute.

**Consequence:** Very large accounts may hit synchronous limits until the operator enables the experimental path after testing it.

## 11. TikTok Ad Library is separate and gated

**Decision:** Treat Commercial Content API research as a separate data source. Require credentials and `TIKTOK_ADLIB_ENABLED=true`; never merge its output into performance totals.

**Why:** It requires separate approval, uses a different API host, and returns transparency data rather than ad performance.

**Consequence:** Ad Library can be unavailable while TikTok Marketing works. The UI labels the distinction and disables live calls by default.

## 12. YouTube is isolated by construction

**Decision:** Exclude YouTube from Overview at both the service and UI layers. Never export YouTube to CSV, never persist it, and clear it on disconnect.

**Why:** YouTube API policy requires channel analytics to remain separate from advertising data.

**Consequence:** Users cannot see a single “all channels” spend including YouTube. That is deliberate. YouTube analytics are served from memory only and disappear on restart or cache expiry.

## 13. One currency rule for the blended total

**Decision:** Show a blended spend total only when every connected network reports the same non-empty currency. Never convert currencies.

**Why:** An FX conversion would invent a rate and misrepresent spend. Summing different currencies is simply wrong.

**Consequence:** Mixed-currency accounts see per-network totals but no blended number, with an explanation.

## 14. Vanilla UI bundle budget

**Decision:** Keep the hand-written UI bundle under 150 KB gzipped.

**Why:** Fast first paint and a clear separation from framework overhead.

**Consequence:** The verified vanilla chunk is 28,335 bytes gzipped. Next.js shared framework chunks are separate from this budget and are not counted as the vanilla bundle.

## 15. Accessibility and motion are product requirements

**Decision:** Use ARIA tabs with roving tabindex and arrow/Home/End navigation. Make tooltips focus-visible. Respect `prefers-reduced-motion` and the server-side motion setting. Disable the custom cursor on touch and reduced motion.

**Why:** A dashboard that only works with a mouse or only looks correct with animation is incomplete.

**Consequence:** More CSS and event handling, but keyboard and reduced-motion behavior are testable and were browser-checked.

## 16. Browser hardening and CSP

**Decision:** Send `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, a restrictive `Permissions-Policy`, and a CSP with `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`, and `object-src 'none'` from `next.config.ts`.

**Why:** The dashboard handles sensitive reporting data and optional provider credentials. Framing, base-tag injection, form hijacking, plugin content, and MIME sniffing should be closed by policy, not left to page code.

**Consequence:** The CSP intentionally does not restrict script sources because Next.js injects inline bootstrap scripts. The server-rendered app and the static GitHub Pages site are separate targets: the Pages site is a presentation layer and contains no credentials or server APIs.
