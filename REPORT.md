# Kampa build report

**Date:** 2026-11-09  
**Result:** Demo/read-only dashboard complete and verified. Live provider integrations implemented but not verified against real accounts.

## Summary

Kampa is a Next.js 15.5.29 / React 19.3.1 application with a hand-written vanilla ES-module dashboard. It supports Overview, Google Ads, Meta, TikTok, YouTube, and Settings; runs fully in deterministic demo mode; enforces a reviewed read-only allowlist; encrypts server-side settings; and isolates YouTube from advertising data by construction.

All requested release checks pass: lint, typecheck, 61 tests, production build, and built-bundle secret scan. Desktop and true 360 px layouts were exercised in headless Chrome, including keyboard navigation, focus tooltips, settings, empty data, and a simulated provider failure.

## Delivered

### Server

- Next.js app shell, privacy page, favicon.
- 11 API routes: bootstrap, overview, four networks, TikTok Ad Library, settings, settings test, auth, YouTube disconnect.
- Shared normalized data contract, catalogs, date ranges, five-minute cache, typed provider errors.
- Google Ads, Meta, TikTok Marketing, TikTok Ad Library, YouTube, and Google OAuth clients.
- AES-256-GCM settings persistence with masked public responses.
- Optional password gate with signed `HttpOnly` session cookie and failure throttling.
- Same-origin guard for mutations and security headers.

### Browser UI

- Six responsive tabs with ARIA roles and roving tabindex.
- Themed per network: graphite, Google blue, Meta gradient, monochrome TikTok, YouTube red.
- SVG sparklines and time-series charts; animated funnel canvas; reduced-motion fallback.
- Overview currency guard and YouTube exclusion.
- Google Ads subtabs/levels, account summary, conversion actions, column chooser, sorting, CSV.
- Meta Facebook/Instagram views, campaign objects, action type control, placement breakdown, column chooser, CSV.
- TikTok performance levels, report type labels, isolated public Ad Library section.
- YouTube channel/video analytics and separate Google Ads video-campaign section with explicit non-combination copy.
- Settings with masked secrets, connection tests, API versions, demo switch, timezone, reduced motion, YouTube disconnect, and danger zone.
- Mobile 3×2 tab grid and wrapped settings navigation.

### Documentation

- `README.md`
- `docs/API_NOTES.md`
- `docs/PLAN.md`
- `docs/DECISIONS.md`
- `docs/CHECKLIST.md`
- `REPORT.md`

## Verification evidence

```text
npm run verify

lint        PASS
typecheck   PASS
tests       PASS — 9 files, 61 tests
build       PASS — 6 static pages, 11 API routes
scan        PASS — 30 files, 0 NEXT_PUBLIC variables, no token-shaped strings
```

Production build summary:

```text
/                 450 B   103 kB first load
/privacy          3.46 kB  106 kB first load
11 API routes     150 B each
shared JS         103 kB
```

Vanilla UI bundle: 105,347 bytes raw, 28,335 bytes gzip (target: <150 KB gzip).

Browser checks:

- Desktop Overview/Google Ads/Meta/TikTok/Settings.
- Instagram tab renders gradient and data.
- TikTok theme computes monochrome positive/accent colors.
- Tab click navigation and ArrowRight keyboard navigation activate the selected tab and content.
- Tooltip becomes visible on keyboard focus.
- Google Ads column dialog contains 23 metric checkboxes.
- 360 px: `document.scrollWidth = 360`; six tabs visible in a 3×2 grid inside the viewport; settings nav right edge 341 px.
- Empty response: “No rows returned” with empty chart/breakdown copy.
- Simulated HTTP 500: “This data could not be loaded,” retry button, Settings link.
- Normal load: no console errors, exceptions, or HTTP 4xx/5xx responses.
- Overview animation measured 57–62 rAF callbacks per second in headless Chrome.

## Defects found and fixed during verification

1. **Tab clicks changed the URL but not the view.** `navigate` called `setTab` (which used `pushState`) and only activated when `setTab` returned `false`. `pushState` does not emit `hashchange`, so the content stayed on the old tab. Fixed by always calling `activate(tab)` after setting the hash.
2. **Mobile tab bar stretched the sixth tab across a full row.** Replaced the auto-growing flex wrap with a 3-column, 2-row grid at ≤600 px.
3. **Missing favicon caused a 404.** Added `app/icon.svg`.
4. **`TIKTOK_ADLIB_ENABLED` was documented but not enforced.** Added a live-call gate; demo mode still works, and live calls now require the explicit flag plus credentials.

## Security posture

- Provider access is read-only at the network boundary, not just in the UI.
- No provider write endpoint is allowlisted.
- Secrets never reach the browser and are encrypted at rest.
- `.env*` and `data/` are gitignored.
- Mutation routes reject cross-origin requests.
- Built static assets are scanned for secrets.

## Limitations

- **No live provider validation.** Google Ads, Meta, TikTok, and YouTube clients are implemented and policy-tested but were not executed against real accounts. See the unverified register in `docs/API_NOTES.md`.
- **Meta async and TikTok Ad Library are gated/experimental.** Meta async is off unless `META_ASYNC_ENABLED=true`; live Ad Library is refused unless `TIKTOK_ADLIB_ENABLED=true` and approved credentials exist.
- **No OAuth callback flow.** Refresh/access tokens are obtained out of band and pasted into Settings.
- **No provider quota model.** Generic retry/`Retry-After` handling exists; specific quota budgets are not guaranteed.
- **No multi-user accounts or background scheduler.** One deployment is one trust boundary.
- **Secure cookie requires HTTPS in production.** Serve behind TLS if `APP_PASSWORD` is enabled outside localhost.
- **Real-device/browser-matrix performance was not measured.** The animation measurement is from headless Chrome.
- **Secret scan had no configured environment values to compare.** Rerun with production secrets before deployment.
- **No git repository was initialized or committed** in this workspace.

## Recommended next steps

1. Connect test accounts one network at a time and complete the live checks in `docs/API_NOTES.md`.
2. Confirm current provider API versions and permissions, then adjust defaults/documentation.
3. Exercise Meta async jobs and TikTok Ad Library only after approval.
4. Validate YouTube monetary metrics with a monetized test channel.
5. Rerun `npm run verify` with production environment values and deploy behind HTTPS.
