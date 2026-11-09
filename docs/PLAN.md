# Implementation plan

Status as of 2026-11-09.

## Goal

Ship a read-only all-in-one advertising dashboard that works immediately with deterministic demo data, enforces a reviewable provider allowlist, isolates YouTube by policy, and can be switched to live official APIs without changing the UI or normalization contract.

## Delivery phases

| Phase | Scope | Status |
| --- | --- | --- |
| 1. Scaffold | Next.js 15/React 19 app, TypeScript, ESLint, Vitest, environment template, gitignore, security headers. | Complete |
| 2. Server contract | Shared types, catalogs, date ranges, cache, typed errors, encrypted settings, optional password gate, origin guard. | Complete |
| 3. Read-only policy | Exact host/method/path allowlist, central HTTP client, GET/POST restrictions, retry/timeout behavior, policy tests. | Complete |
| 4. Provider clients | Google Ads, Meta, TikTok Marketing, TikTok Ad Library, YouTube, Google OAuth. | Complete; live response shapes unverified |
| 5. Normalization and demo | Demo fixtures, micros/percentage handling, common totals/series, currency guard, overview isolation. | Complete and tested |
| 6. API routes | Bootstrap, overview, four networks, TikTok Ad Library, settings, connection test, auth, YouTube disconnect. | Complete |
| 7. Vanilla UI | Router, ARIA tabs, API/state layer, overview, Google Ads, Meta, TikTok, YouTube, Settings, charts, canvas, cursor, themes. | Complete |
| 8. Responsive and accessibility | 360 px layouts, wrapped mobile tabs/settings nav, visible focus, tooltips on focus, reduced motion, touch cursor fallback. | Complete and browser-checked |
| 9. Hardening | Secret masking, encrypted at rest, CSRF/origin checks, password throttling, built-bundle secret scan. | Complete |
| 10. Verification | Lint, typecheck, 61 tests, production build, secret scan, desktop and 360 px browser checks. | Complete |
| 11. Live-account validation | Provider tokens, real reports, quota behavior, async Meta, YouTube monetization. | **Blocked: no credentials** |

## Milestones and acceptance criteria

1. **Demo-first**
   - App renders all six tabs with no environment secrets.
   - Permanent `DEMO DATA` badge.
   - Demo rows pass through the same normalizers as live rows.
2. **Read-only proof**
   - No caller can fetch an unlisted URL.
   - No write method reaches a provider.
   - Allowlist changes require an intentional test update.
3. **Currency and data integrity**
   - Google micros are converted once.
   - Percentages are normalized consistently.
   - Overview suppresses a total when currencies differ.
4. **YouTube separation**
   - YouTube is absent from Overview queries and totals.
   - No YouTube CSV path exists.
   - No YouTube data is persisted to disk or logged.
   - Disconnect revokes and clears credentials/cache.
5. **UI quality**
   - Keyboard tabs use arrow/Home/End keys and roving tabindex.
   - Tooltips are reachable by focus, not hover only.
   - Layout has no horizontal page overflow at 360 px.
   - Reduced-motion preference stops nonessential animation.
6. **Release gate**
   - `npm run verify` passes.
   - Secret scan finds no configured secret in `.next/static`.

## Work completed in this build

- Replaced a tab-navigation defect where `pushState` changed the hash without activating the selected tab. Tab clicks and arrow navigation now update both state and content immediately.
- Changed the 360 px tab bar from a stretched 5+1 wrap to a stable 3×2 grid.
- Added the missing favicon, eliminating the only browser 404.
- Added a real `TIKTOK_ADLIB_ENABLED` gate so live Ad Library calls cannot run merely because credentials are present.
- Verified desktop and 360 px views, settings, focus tooltips, tab keyboard behavior, Instagram theming, columns dialog, and console/network errors in headless Chrome.
- Verified 28,335 bytes gzipped for the hand-written vanilla UI chunk; the 150 KB target applies to that bundle.

## Remaining work

1. Connect test accounts for each provider and execute the checks in `docs/API_NOTES.md`.
2. Confirm provider API version support and adjust defaults or documentation.
3. Exercise Meta async report jobs and TikTok Ad Library with approved access.
4. Validate YouTube analytics and optional monetary metrics against Studio.
5. Decide whether to keep the experimental flags or promote them after live validation.

These are credential/approval blockers, not unfinished demo functionality.
