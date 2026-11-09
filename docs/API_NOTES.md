# API notes

Status as of 2026-11-09. This file records exactly what AdPulse calls, how values are normalized, and what remains unverified. It is intentionally conservative: an endpoint or field is only marked verified when this repository proves it locally or a live account has confirmed it.

## Read-only policy

Every provider request uses `apiFetch` (`lib/http.ts`), which calls `assertAllowed` before opening a connection (`lib/allowlist.ts`). The allowlist restricts:

- HTTPS only.
- `GET` and `POST` only. No `PUT`, `PATCH`, `DELETE`, or arbitrary methods.
- Exact provider hosts and path patterns.
- POST only for OAuth exchange/revocation, Google Ads `searchStream` and field-metadata search, Meta asynchronous Insights jobs, and TikTok Commercial Content API research calls.

The test `tests/allowlist.test.ts` verifies the reviewed endpoint set, blocks unknown hosts, blocks write methods, and blocks HTTP. All application data routes are read-only except the local settings/auth endpoints.

## Endpoint inventory

### Google Ads

Default version `v26` (`GOOGLE_ADS_API_VERSION`).

| Method | Host and path | Purpose |
| --- | --- | --- |
| POST | `oauth2.googleapis.com/token` | Exchange a refresh token for a short-lived access token. |
| GET | `googleads.googleapis.com/v26/customers:listAccessibleCustomers` | Discover accessible customer IDs when none are configured. |
| POST | `googleads.googleapis.com/v26/customers/{customerId}/googleAds:searchStream` | Execute GAQL reports and account/customer reads. |
| POST | `googleads.googleapis.com/v26/googleAdsFields:search` | Fetch live field metadata for metrics. |
| GET | `googleads.googleapis.com/v26/googleAdsFields/{field}` | Read a single field definition. Implemented and allowlisted; not currently used by the dashboard path. |

Authentication headers: `developer-token`, `login-customer-id` when configured, and `Authorization: Bearer <access token>`. OAuth scope: `https://www.googleapis.com/auth/adwords`.

Resources used for reports: `campaign`, `ad_group`, `ad_group_ad`, `keyword_view`, `search_term_view`, `shopping_performance_view`, `asset_group`. Report queries always include `segments.date` and an inclusive date filter. Channel filters use `campaign.advertising_channel_type` for Search, Performance Max, Demand Gen, Shopping, and Video.

### Meta

Default version `v26.0` (`META_API_VERSION`).

| Method | Host and path | Purpose |
| --- | --- | --- |
| GET | `graph.facebook.com/v26.0/me/adaccounts` | List ad accounts. |
| GET | `graph.facebook.com/v26.0/act_{id}/insights` | Synchronous Insights report, paginated. |
| GET | `graph.facebook.com/v26.0/act_{id}/campaigns` | Campaign objects (status, objective, budget, bid strategy). |
| GET | `graph.facebook.com/v26.0/act_{id}/adsets` | Ad set objects. |
| GET | `graph.facebook.com/v26.0/act_{id}/ads` | Ad objects. |
| POST | `graph.facebook.com/v26.0/act_{id}/insights` | Submit an asynchronous Insights job. Gated by `META_ASYNC_ENABLED=true`. |
| GET | `graph.facebook.com/v26.0/{report_run_id}` | Poll asynchronous job status. |
| GET | `graph.facebook.com/v26.0/{report_run_id}/insights` | Read asynchronous job results. |

Authentication: `Authorization: Bearer <access token>`. Intended permissions: `ads_read`; `business_management` only when required to list accounts. The Insights field list is deliberately limited to core identifiers and dates. Objective, budget, bid strategy, and effective status are read from campaign objects instead of being asserted as Insights fields.

### TikTok Marketing

Default version `v1.3` (`TIKTOK_API_VERSION`).

| Method | Host and path | Purpose |
| --- | --- | --- |
| GET | `business-api.tiktok.com/open_api/v1.3/report/integrated/get/` | Integrated performance report. |
| GET | `business-api.tiktok.com/open_api/v1.3/advertiser/info/` | Advertiser metadata and currency. |
| GET | `business-api.tiktok.com/open_api/v1.3/campaign/get/` | Campaign objects. |
| GET | `business-api.tiktok.com/open_api/v1.3/adgroup/get/` | Ad group objects. |
| GET | `business-api.tiktok.com/open_api/v1.3/ad/get/` | Ad objects. |

Authentication: `Access-Token` header. Intended access: Marketing API reporting and object-read permission.

### TikTok Commercial Content API (Ad Library)

This is a separate product and approval from TikTok Marketing. Live calls require both credentials and `TIKTOK_ADLIB_ENABLED=true`.

| Method | Host and path | Purpose |
| --- | --- | --- |
| POST | `open.tiktokapis.com/v2/oauth/token/` | Client-credentials token for research access. |
| POST | `open.tiktokapis.com/v2/research/adlib/ad/query/` | Search public ads. |
| POST | `open.tiktokapis.com/v2/research/adlib/ad/detail/` | Read one public ad. |
| POST | `open.tiktokapis.com/v2/research/adlib/ad/report/` | Read aggregate ad transparency data. |
| POST | `open.tiktokapis.com/v2/research/adlib/advertiser/query/` | Search public advertisers. |

These POSTs return transparency data only. The UI never presents them as spend, clicks, conversions, or performance, and they are not merged into TikTok performance totals.

### YouTube

| Method | Host and path | Purpose |
| --- | --- | --- |
| GET | `youtubeanalytics.googleapis.com/v2/reports` | Channel/video analytics. |
| GET | `www.googleapis.com/youtube/v3/channels` | Channel metadata (`mine=true`). |
| GET | `www.googleapis.com/youtube/v3/videos` | Video metadata, batched up to 50 IDs per request. |
| POST | `oauth2.googleapis.com/token` | Refresh access token. |
| POST | `oauth2.googleapis.com/revoke` | Revoke the token during YouTube disconnect. |

Scopes:

- `https://www.googleapis.com/auth/youtube.readonly`
- `https://www.googleapis.com/auth/yt-analytics.readonly`
- `https://www.googleapis.com/auth/yt-analytics-monetary.readonly` — optional, only enabled for a monetized channel.

YouTube policy boundaries are enforced by construction:

- YouTube is not part of `getOverview`; the overview only queries Google Ads, Meta, and TikTok.
- YouTube rows are never exported to CSV; the YouTube column dialog and export path are separated from advertising tabs.
- YouTube data is never written to `data/` or any other file. The server cache is an in-memory `Map`, and disconnect clears YouTube cache keys and stored YouTube credentials.
- YouTube data is never combined with advertising data, including Google Ads video campaigns. The YouTube tab labels the separate “Google Ads video campaigns” section and explicitly says it is not combined.

## Normalization rules

- **One contract:** demo and live rows both go through `lib/normalize/*` and the shared catalog shapes. Demo mode never bypasses normalization.
- **Money:** Google Ads cost is read from `metrics.cost_micros` and divided by 1,000,000. All displayed amounts use the selected account's currency.
- **Percentages:** Google Ads fractional rates are multiplied by 100 for display. Meta and TikTok rates are treated as percentages as returned.
- **Totals:** totals are recomputed from normalized rows, never by adding already-rounded display values.
- **Comparison:** the previous period is the equal-length range immediately before the selected range.
- **Currencies:** no FX conversion occurs. The Overview total is available only when all connected networks return the same non-empty currency; otherwise the UI explains why no total is shown.
- **Levels:** Meta `ad_group` maps to API `adset`. TikTok levels map to `AUCTION_ADVERTISER`, `AUCTION_CAMPAIGN`, `AUCTION_ADGROUP`, and `AUCTION_AD`.
- **Field availability:** Google Ads live catalogs are filtered against `googleAdsFields:search` at runtime. If field metadata cannot be fetched, only conservative default metrics are offered. Experiment metrics are hidden outside demo mode.

## Caching, pagination, and failures

- Server cache TTL is five minutes. `Refresh` deletes the current key and reloads; it does not bypass provider quotas.
- OAuth access tokens are cached for 50 minutes in server memory.
- Default request timeout is 20 seconds. OAuth token exchange uses 15 seconds; revocation uses 10 seconds.
- GET requests retry up to three times for 429, 500, 502, 503, and 504, honoring `Retry-After` capped at 60 seconds. POST requests do not retry by default.
- Meta account listing reads up to 10 pages. Meta Insights reads up to 25 pages. TikTok reports read up to 20 pages of 1,000 rows. These are implementation caps, not claims about provider limits.
- Meta's `x-fb-ads-insights-throttle` values at or above 90 produce a retryable rate-limit error.
- Provider error bodies are not copied into logs. The UI receives a friendly error code, provider, status, and a short detail.
- Async Meta jobs poll up to 12 times at five-second intervals, so a request can take about one minute. This path is off by default and experimental.

## Unverified register

| Item | Status | Why it is unverified | How to verify |
| --- | --- | --- | --- |
| Google Ads live report calls and response mapping | **UNVERIFIED** | No live Google Ads developer token/account was available. Endpoint policy and normalizers are tested with fixtures. | Connect a test account, run each level/subtab, compare totals with Google Ads UI for the same date range. |
| Google Ads version `v26` availability | **UNVERIFIED for this date** | Version is configurable and defaults to `v26`; availability depends on the provider's current support window. | Call `listAccessibleCustomers` with a real token; switch `GOOGLE_ADS_API_VERSION` if the API reports an unsupported version. |
| Google Ads seed metric list | **Runtime-verified design, UNVERIFIED live** | Metrics are filtered by live field metadata before use; the seed fields themselves have not been checked against a real account. | Enable live mode and inspect the column dialog; any field absent from metadata is hidden. |
| Meta sync Insights fields and response shape | **UNVERIFIED** | No live Meta token/account. Core fields are intentionally minimal. | Fetch one campaign-level report and compare spend, impressions, clicks, and the selected action type. |
| Meta `v26.0` availability and permissions | **UNVERIFIED** | Version/permission set depends on the Meta app and account. | Run the Settings connection test with a real token. |
| Meta asynchronous job API (`report_run_id`, `async_status`) | **UNVERIFIED / EXPERIMENTAL** | Off by default; polling and status field names follow the documented report-job flow but have not been exercised live. | Enable `META_ASYNC_ENABLED=true` on a large test account; verify submit, status polling, result paging, and failure states. |
| TikTok Marketing report/object fields and `v1.3` | **UNVERIFIED** | No approved TikTok advertiser credentials. | Run one report per level and compare with TikTok Ads Manager. |
| TikTok Ad Library (`research/adlib/*`) | **UNVERIFIED / GATED** | Requires separate TikTok approval and credentials, and is refused unless `TIKTOK_ADLIB_ENABLED=true`. | With approved research access, test query/detail/report/advertiser calls and confirm only public transparency fields are displayed. |
| YouTube Analytics metrics, dimensions, and response shape | **UNVERIFIED** | No live OAuth token/channel. | Connect a channel, load channel and video views, compare with YouTube Studio; test monetized fields only with the monetary scope. |
| YouTube monetary scope approval | **UNVERIFIED** | Optional scope; depends on channel monetization and Google approval. | Enable monetization in Settings with a monetized channel and verify revenue/CPM fields appear. |
| Provider quotas and rate limits | **Not claimed** | No hard-coded quota tables; only generic 429/5xx retry behavior is implemented. | Observe live headers and provider console; do not assume a quota budget. |

## Deliberate omissions

- No `objective`, `optimization_goal`, or `effective_status` is requested from Meta Insights. Those values come from campaign objects where available.
- No ad-level private data or audience identities are requested.
- No write/mutate endpoints are allowlisted, even though some provider SDKs expose them.
- No FX conversion, estimated revenue, audience-size estimation, channel ranking, or cross-source YouTube blending is implemented.
