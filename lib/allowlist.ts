import { AppError } from "./errors";

export interface AllowRule {
  provider: "google" | "google-ads" | "meta" | "tiktok" | "youtube";
  host: string;
  method: "GET" | "POST";
  pattern: RegExp;
  label: string;
}

/**
 * The complete set of third-party endpoints AdPulse may call.
 * Every entry is a read or a permitted OAuth/exchange/report job.
 * Anything not matching this list is refused before a socket is opened.
 */
export const ALLOW_RULES: AllowRule[] = [
  {
    provider: "google",
    host: "oauth2.googleapis.com",
    method: "POST",
    pattern: /^\/token$/,
    label: "OAuth token exchange",
  },
  {
    provider: "google",
    host: "oauth2.googleapis.com",
    method: "POST",
    pattern: /^\/revoke$/,
    label: "OAuth token revocation",
  },
  {
    provider: "google-ads",
    host: "googleads.googleapis.com",
    method: "GET",
    pattern: /^\/v\d+\/customers:listAccessibleCustomers$/,
    label: "Google Ads accessible customers",
  },
  {
    provider: "google-ads",
    host: "googleads.googleapis.com",
    method: "POST",
    pattern: /^\/v\d+\/customers\/[^/]+\/googleAds:searchStream$/,
    label: "Google Ads GAQL searchStream",
  },
  {
    provider: "google-ads",
    host: "googleads.googleapis.com",
    method: "POST",
    pattern: /^\/v\d+\/googleAdsFields:search$/,
    label: "Google Ads field metadata search",
  },
  {
    provider: "google-ads",
    host: "googleads.googleapis.com",
    method: "GET",
    pattern: /^\/v\d+\/googleAdsFields\/[A-Za-z0-9_.-]+$/,
    label: "Google Ads field metadata read",
  },
  {
    provider: "meta",
    host: "graph.facebook.com",
    method: "GET",
    pattern: /^\/v\d+\.\d+\/me\/adaccounts$/,
    label: "Meta ad accounts",
  },
  {
    provider: "meta",
    host: "graph.facebook.com",
    method: "GET",
    pattern: /^\/v\d+\.\d+\/act_[^/]+\/(insights|campaigns|adsets|ads)$/,
    label: "Meta ads read",
  },
  {
    provider: "meta",
    host: "graph.facebook.com",
    method: "POST",
    pattern: /^\/v\d+\.\d+\/act_[^/]+\/insights$/,
    label: "Meta async insights job",
  },
  {
    provider: "meta",
    host: "graph.facebook.com",
    method: "GET",
    pattern: /^\/v\d+\.\d+\/\d+\/insights$/,
    label: "Meta async insights results",
  },
  {
    provider: "meta",
    host: "graph.facebook.com",
    method: "GET",
    pattern: /^\/v\d+\.\d+\/\d+$/,
    label: "Meta report run status or object read",
  },
  {
    provider: "tiktok",
    host: "business-api.tiktok.com",
    method: "GET",
    pattern: /^\/open_api\/v\d+(?:\.\d+)?\/(report\/integrated\/get|advertiser\/info|campaign\/get|adgroup\/get|ad\/get)\/$/,
    label: "TikTok Marketing API read",
  },
  {
    provider: "tiktok",
    host: "open.tiktokapis.com",
    method: "POST",
    pattern: /^\/v2\/oauth\/token\/$/,
    label: "TikTok client token exchange",
  },
  {
    provider: "tiktok",
    host: "open.tiktokapis.com",
    method: "POST",
    pattern: /^\/v2\/research\/adlib\/(ad\/detail|ad\/query|ad\/report|advertiser\/query)\/$/,
    label: "TikTok Commercial Content API read",
  },
  {
    provider: "youtube",
    host: "youtubeanalytics.googleapis.com",
    method: "GET",
    pattern: /^\/v2\/reports$/,
    label: "YouTube Analytics report",
  },
  {
    provider: "youtube",
    host: "www.googleapis.com",
    method: "GET",
    pattern: /^\/youtube\/v3\/(channels|videos)$/,
    label: "YouTube Data API read",
  },
];

export interface AllowDecision {
  allowed: boolean;
  rule?: AllowRule;
  reason?: string;
}

export function checkAllowed(method: string, rawUrl: string | URL): AllowDecision {
  let url: URL;
  try {
    url = typeof rawUrl === "string" ? new URL(rawUrl) : rawUrl;
  } catch {
    return { allowed: false, reason: "Invalid URL." };
  }

  if (url.protocol !== "https:") {
    return { allowed: false, reason: "Only HTTPS endpoints are permitted." };
  }

  const upper = method.toUpperCase();
  if (upper !== "GET" && upper !== "POST") {
    return { allowed: false, reason: `The ${upper} method is never permitted.` };
  }

  for (const rule of ALLOW_RULES) {
    if (rule.host === url.hostname && rule.method === upper && rule.pattern.test(url.pathname)) {
      return { allowed: true, rule };
    }
  }

  return {
    allowed: false,
    reason: `No read-only allowlist entry matches ${upper} ${url.hostname}${url.pathname}.`,
  };
}

export function assertAllowed(method: string, rawUrl: string | URL): AllowRule {
  const decision = checkAllowed(method, rawUrl);
  if (!decision.allowed || !decision.rule) {
    throw new AppError("POLICY", {
      status: 403,
      detail: decision.reason ?? "Blocked by the read-only allowlist.",
    });
  }
  return decision.rule;
}

/** Human-readable summary used in Settings and the privacy page. */
export const ALLOWED_SCOPE_SUMMARY = [
  "Google Ads: read campaigns, ad groups, ads, keywords, products and performance reports.",
  "Meta: read ad accounts, campaigns, ad sets, ads and Insights reports.",
  "TikTok: read advertiser, campaign, ad group, ad and report data, plus public Ad Library transparency data.",
  "YouTube: read your channel, its videos and your own analytics reports.",
] as const;
