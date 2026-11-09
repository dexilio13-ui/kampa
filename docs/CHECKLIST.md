# Verification checklist

Final run: 2026-11-09. Every item below was executed in this repository; anything that could not be verified is marked as a limitation rather than a pass.

## Release gate

| Check | Command | Result |
| --- | --- | --- |
| ESLint | `npm run lint` | **PASS** — no errors or warnings |
| TypeScript | `npm run typecheck` | **PASS** — `tsc --noEmit` |
| Unit/integration tests | `npm test` | **PASS** — 9 files, 61 tests |
| Production build | `npm run build` | **PASS** — 6 static pages, 11 API routes, `/icon.svg` |
| Built-bundle secret scan | `npm run scan:secrets` | **PASS** — 30 client files, no `NEXT_PUBLIC_` variables or token-shaped strings |
| Full gate | `npm run verify` | **PASS** — all five steps completed in order |

The secret scan reported “0 environment value(s) compared” because this workspace has no `APP_SECRET`/provider values in the environment at scan time. It still checked for `NEXT_PUBLIC_` and token-shaped strings. Set real environment values before production and rerun `npm run scan:secrets` to compare them.

## Read-only policy

- [x] Exact host + method + path allowlist; no generic provider wildcard.
- [x] HTTPS enforced.
- [x] Only `GET` and `POST`; `PUT`, `PATCH`, and `DELETE` rejected.
- [x] POST restricted to OAuth exchange/revocation, Google Ads `searchStream`/field search, Meta async report jobs, and TikTok research calls.
- [x] Unknown host/path rejected before a request is opened.
- [x] `tests/allowlist.test.ts` locks the reviewed endpoint set (8 tests).
- [x] No provider write/mutate endpoint appears in the allowlist.
- [x] All clients call `apiFetch`; no direct provider `fetch` in client modules.

## Security

- [x] AES-256-GCM encryption for `data/settings.enc.json`.
- [x] Settings writes are atomic and use mode `0600`.
- [x] Secrets are masked to the last four characters in bootstrap/settings responses.
- [x] No secret uses a `NEXT_PUBLIC_` variable.
- [x] `data/` and `.env*` are gitignored (`.env.example` excepted).
- [x] Optional `APP_PASSWORD` session is signed, `HttpOnly`, `SameSite=Strict`, seven-day expiry.
- [x] Failed password attempts are throttled (8 per minute per client).
- [x] Mutation routes require a same-origin request.
- [x] Security headers: frame deny, nosniff, no-referrer, restrictive permissions policy, CSP framing/base/form/object restrictions.
- [x] Built static assets scanned for secrets.
- [x] Error responses do not copy provider headers or full provider bodies into logs.

## Data integrity

- [x] Google Ads `cost_micros` divided once by 1,000,000.
- [x] Google Ads percent fractions converted to percentages.
- [x] Demo and live rows share the same normalizers.
- [x] Totals are recomputed from unrounded normalized rows.
- [x] Previous-period comparison is equal length.
- [x] Overview blended total is suppressed unless all connected networks share one currency.
- [x] Account currency is displayed; no FX conversion.
- [x] Meta campaign attributes are not asserted as Insights fields.
- [x] Google live metric catalog is filtered against field metadata.

## YouTube isolation

- [x] YouTube is not queried by `getOverview`.
- [x] YouTube rows cannot appear in Overview totals.
- [x] No YouTube CSV export control is rendered.
- [x] YouTube table export/column paths are separate from advertising tabs.
- [x] YouTube data is held in an in-memory cache only; no file write path exists.
- [x] Disconnect revokes the Google token, removes YouTube settings, and clears YouTube/overview/oauth cache keys.
- [x] Privacy page explains the isolation and deletion behavior.

## UI, accessibility, and states

Browser checks used headless Chrome with CDP device emulation. Normal-motion desktop and true 360 px viewports were inspected.

- [x] Overview, Google Ads, Meta, TikTok, YouTube, and Settings render.
- [x] Tab clicks activate content immediately (fixed `pushState`-without-activation defect).
- [x] Keyboard ArrowRight moves focus and activates the neighboring tab.
- [x] Tooltips are keyboard-focusable and reached opacity `1` / visibility `visible`.
- [x] Google Ads columns dialog opens with 23 metric checkboxes.
- [x] Meta Instagram view applies the Instagram gradient and shows rows.
- [x] TikTok theme is monochrome; positive indicator computes to `rgb(0, 0, 0)`.
- [x] 360 px viewport: 6 tabs in 3 columns × 2 rows; all 6 tabs inside the 360 px viewport.
- [x] 360 px page: `document.scrollWidth` equals 360 (no horizontal page overflow).
- [x] 360 px Settings: nav items fit (right edge 341 px at 360 px viewport); secret replacement controls are hidden.
- [x] Normal page load: zero console errors, zero exceptions, zero HTTP 4xx/5xx responses.
- [x] Favicon present; previous `/favicon.ico` 404 eliminated.
- [x] Demo mode: deterministic cards, totals, badge, and connection chips.
- [x] Empty state: intercepted Google Ads response with zero rows renders “No rows returned,” KPI placeholders, and chart/breakdown empty copy.
- [x] Error state: intercepted Meta HTTP 500 renders “This data could not be loaded,” friendly message, “Try again,” and “Open Settings.”
- [x] Reduced-motion support is implemented and was checked visually in an earlier pass.
- [x] Canvas animation measured 57–62 `requestAnimationFrame` callbacks per second in headless Chrome on Overview. This is a synthetic headless measurement, not a hardware GPU guarantee.

## Responsive coverage

| Width | Method | Result |
| --- | --- | --- |
| 1440 px | Headless Chrome window | Desktop layout verified across all tabs |
| 360 px | CDP `Emulation.setDeviceMetricsOverride` | True 360 px layout, no page overflow, 3×2 tabs, settings fit |

## Bundle budget

- Hand-written vanilla UI chunk: **105,347 bytes raw / 28,335 bytes gzip**, within the 150 KB gzipped target.
- Next.js shared framework chunks are separate and not counted as the vanilla UI bundle.
- First-load JS reported by the build: 103 kB shared, 450 B page.

## Not verified

- Live Google Ads, Meta, TikTok Marketing, TikTok Ad Library, and YouTube requests and response shapes: **no real credentials/approvals were available**.
- Provider API version availability: defaults are configurable but unconfirmed live.
- Meta asynchronous report jobs: gated and untested live.
- YouTube monetary metrics: untested live.
- Real-device 60 fps and browser matrix (Safari/Firefox/mobile hardware): not tested.
- Password-gated deployment over HTTPS: cookie behavior is implemented but not exercised live in this workspace.
