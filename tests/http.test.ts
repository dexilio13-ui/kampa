import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "../lib/http";
import { AppError } from "../lib/errors";

describe("apiFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("refuses an unknown endpoint without opening a socket", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      apiFetch("https://example.com/anything", { method: "GET", provider: "test" }),
    ).rejects.toBeInstanceOf(AppError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a write before calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      apiFetch("https://googleads.googleapis.com/v26/customers/123/googleAds:searchStream", {
        method: "PUT" as never,
        provider: "google-ads",
      }),
    ).rejects.toMatchObject({ code: "POLICY" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows the documented Google Ads searchStream POST only as a read query", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => "[]",
    });
    vi.stubGlobal("fetch", fetchMock);
    await apiFetch("https://googleads.googleapis.com/v26/customers/123/googleAds:searchStream", {
      method: "POST",
      body: { query: "SELECT campaign.id FROM campaign" },
      provider: "google-ads",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][1]?.body)).toContain("SELECT campaign.id FROM campaign");
  });

  it("does not log secrets and returns parsed JSON on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      text: async () => JSON.stringify({ ok: true }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const response = await apiFetch("https://youtubeanalytics.googleapis.com/v2/reports?ids=channel%3D%3D1", {
      method: "GET",
      headers: { authorization: "Bearer super-secret" },
      provider: "youtube",
    });
    expect(response.json).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
