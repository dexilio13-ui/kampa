import { describe, expect, it } from "vitest";
import { ALLOW_RULES, checkAllowed } from "../lib/allowlist";

const POST_LABELS = [
  "OAuth token exchange",
  "OAuth token revocation",
  "Google Ads GAQL searchStream",
  "Google Ads field metadata search",
  "Meta async insights job",
  "TikTok client token exchange",
  "TikTok Commercial Content API read",
];

describe("read-only allowlist", () => {
  it("contains exactly the reviewed endpoint set", () => {
    expect(ALLOW_RULES.map((rule) => rule.label).sort()).toEqual(
      [
        "Google Ads GAQL searchStream",
        "Google Ads accessible customers",
        "Google Ads field metadata read",
        "Google Ads field metadata search",
        "Meta ad accounts",
        "Meta ads read",
        "Meta async insights job",
        "Meta async insights results",
        "Meta report run status or object read",
        "OAuth token exchange",
        "OAuth token revocation",
        "TikTok Commercial Content API read",
        "TikTok Marketing API read",
        "TikTok client token exchange",
        "YouTube Analytics report",
        "YouTube Data API read",
      ].sort(),
    );
  });

  it("permits only GET and POST", () => {
    expect([...new Set(ALLOW_RULES.map((rule) => rule.method))].sort()).toEqual(["GET", "POST"]);
  });

  it("permits POST only for OAuth exchanges and the documented report jobs", () => {
    const postRules = ALLOW_RULES.filter((rule) => rule.method === "POST").map((rule) => rule.label);
    expect(postRules.every((label) => POST_LABELS.includes(label))).toBe(true);
    expect(postRules.filter((label) => label === "OAuth token exchange")).toHaveLength(1);
    expect(postRules.filter((label) => label === "OAuth token revocation")).toHaveLength(1);
    expect(postRules.filter((label) => label === "Google Ads GAQL searchStream")).toHaveLength(1);
    expect(postRules.filter((label) => label === "Meta async insights job")).toHaveLength(1);
  });

  it("accepts only HTTPS", () => {
    expect(checkAllowed("GET", "http://googleads.googleapis.com/v26/customers:listAccessibleCustomers").allowed).toBe(false);
    expect(checkAllowed("GET", "https://googleads.googleapis.com/v26/customers:listAccessibleCustomers").allowed).toBe(true);
  });

  it("rejects every write method on otherwise allowed URLs", () => {
    const urls = [
      "https://googleads.googleapis.com/v26/customers/123/googleAds:searchStream",
      "https://graph.facebook.com/v26.0/act_123/insights",
      "https://open.tiktokapis.com/v2/research/adlib/ad/query/",
    ];
    for (const url of urls) {
      for (const method of ["PUT", "PATCH", "DELETE"]) {
        expect(checkAllowed(method, url).allowed).toBe(false);
      }
    }
  });

  it("rejects Google Ads mutate endpoints and unexpected Meta paths", () => {
    expect(checkAllowed("POST", "https://googleads.googleapis.com/v26/customers/123/googleAds:mutate").allowed).toBe(false);
    expect(checkAllowed("POST", "https://googleads.googleapis.com/v26/customers/123/campaigns:mutate").allowed).toBe(false);
    expect(checkAllowed("GET", "https://graph.facebook.com/v26.0/act_123/insights_extra").allowed).toBe(false);
    expect(checkAllowed("POST", "https://graph.facebook.com/v26.0/act_123/campaigns").allowed).toBe(false);
    expect(checkAllowed("GET", "https://graph.facebook.com/v26.0/me/permissions").allowed).toBe(false);
  });

  it("rejects arbitrary hosts and paths", () => {
    expect(checkAllowed("GET", "https://example.com/v2/reports").allowed).toBe(false);
    expect(checkAllowed("GET", "https://youtubeanalytics.googleapis.com/v2/reports/extra").allowed).toBe(false);
    expect(checkAllowed("GET", "not a url").allowed).toBe(false);
  });

  it("does not allow redirects to be followed", () => {
    // Enforcement lives in http.ts; the allowlist itself must still reject the target.
    expect(checkAllowed("GET", "https://evil.example/steal").allowed).toBe(false);
  });
});
