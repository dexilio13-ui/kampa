import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, mergeSettings, toPublicSettings } from "../lib/settings";

function current() {
  return structuredClone(DEFAULT_SETTINGS);
}

describe("settings merging and masking", () => {
  it("keeps an existing secret when the field is omitted", () => {
    const base = current();
    base.googleAds.developerToken = "dev-secret-value";
    base.googleAds.refreshToken = "refresh-secret-value";
    const merged = mergeSettings(base, { googleAds: { customerIds: ["1234567890"] } });
    expect(merged.googleAds.developerToken).toBe("dev-secret-value");
    expect(merged.googleAds.refreshToken).toBe("refresh-secret-value");
    expect(merged.googleAds.customerIds).toEqual(["1234567890"]);
  });

  it("supports explicit keep and clear markers", () => {
    const base = current();
    base.meta.accessToken = "meta-token-1234";
    const kept = mergeSettings(base, { meta: { accessToken: "__KEEP__" } });
    expect(kept.meta.accessToken).toBe("meta-token-1234");
    const cleared = mergeSettings(base, { meta: { accessToken: "__CLEAR__" } });
    expect(cleared.meta.accessToken).toBeUndefined();
  });

  it("trims, deduplicates and caps ID arrays", () => {
    const merged = mergeSettings(current(), {
      tiktok: { advertiserIds: [" 7001 ", "7001", "", "7002"] },
    });
    expect(merged.tiktok.advertiserIds).toEqual(["7001", "7002"]);
  });

  it("rejects unsafe API version strings and invalid timezones", () => {
    const merged = mergeSettings(current(), {
      apiVersions: { googleAds: "../../admin", meta: "v26.0/evil" },
      timezone: "Not/AZone",
      defaultRange: "custom",
    });
    expect(merged.apiVersions.googleAds).toBe(DEFAULT_SETTINGS.apiVersions.googleAds);
    expect(merged.apiVersions.meta).toBe(DEFAULT_SETTINGS.apiVersions.meta);
    expect(merged.timezone).toBe("UTC");
    expect(merged.defaultRange).toBe("custom");
  });

  it("enforces the monetized boolean", () => {
    const merged = mergeSettings(current(), { youtube: { monetized: true } });
    expect(merged.youtube.monetized).toBe(true);
    const ignored = mergeSettings(merged, { youtube: { monetized: "yes" as never } });
    expect(ignored.youtube.monetized).toBe(true);
  });

  it("never returns raw secrets in public settings", () => {
    const base = current();
    base.googleAds.developerToken = "dev-token-should-never-leak";
    base.googleAds.clientSecret = "client-secret-should-never-leak";
    base.youtube.refreshToken = "youtube-refresh-should-never-leak";
    base.tiktok.ccAccessToken = "adlib-token-should-never-leak";
    const publicSettings = toPublicSettings(base);
    const serialized = JSON.stringify(publicSettings);
    expect(serialized).not.toContain("should-never-leak");
    expect(serialized).not.toContain("dev-token-should");
    expect(publicSettings.googleAds.developerToken.isSet).toBe(true);
    expect(publicSettings.googleAds.developerToken.masked).toContain("leak");
    expect(publicSettings.youtube.refreshToken.masked).toContain("leak");
  });

  it("marks connection timestamps when credentials exist", () => {
    const merged = mergeSettings(current(), {
      meta: { accessToken: "token" },
      youtube: { refreshToken: "refresh" },
    });
    expect(merged.meta.connectedAt).toBeTruthy();
    expect(merged.youtube.connectedAt).toBeTruthy();
  });
});
