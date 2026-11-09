import { fail, guard, guardMutation, ok, readJson } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { readSettings } from "@/lib/settings";
import { TikTokClient } from "@/lib/clients/tiktok";
import { demoAdLibrary } from "@/lib/demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Optional public Ad Library calls. These endpoints return transparency data
 * only (reach ranges and targeting), never spend, clicks or conversions.
 */
export async function POST(request: Request) {
  try {
    guard(request);
    guardMutation(request);
    const settings = await readSettings();
    const body = await readJson(request);
    const action = String(body.action ?? "query");

    if (settings.demoMode) {
      return ok({ demo: true, data: demoAdLibrary(), message: "Demo Ad Library data." });
    }
    if (process.env.TIKTOK_ADLIB_ENABLED !== "true") {
      throw new AppError("CONFIG", {
        provider: "tiktok",
        detail: "Live TikTok Ad Library calls are disabled. Set TIKTOK_ADLIB_ENABLED=true after TikTok approves research access.",
      });
    }
    if (!settings.tiktok.ccAccessToken && !(settings.tiktok.ccClientKey && settings.tiktok.ccClientSecret)) {
      throw new AppError("NOT_CONNECTED", {
        provider: "tiktok",
        detail: "The Commercial Content API requires separate TikTok approval.",
      });
    }

    const client = new TikTokClient(settings);
    if (action === "detail") {
      const data = await client.adDetail(String(body.adId ?? ""));
      return ok({ demo: false, data });
    }
    if (action === "advertisers") {
      const data = await client.advertiserQuery(String(body.searchTerm ?? "").slice(0, 50));
      return ok({ demo: false, data });
    }
    if (action === "report") {
      const min = String(body.min ?? "").replace(/[^0-9]/g, "");
      const max = String(body.max ?? "").replace(/[^0-9]/g, "");
      const data = await client.adReport(min, max);
      return ok({ demo: false, data });
    }
    const data = await client.adQuery({
      min: String(body.min ?? "").replace(/[^0-9]/g, ""),
      max: String(body.max ?? "").replace(/[^0-9]/g, ""),
      country: typeof body.country === "string" ? body.country.slice(0, 2) : undefined,
      status: body.status === "ACTIVE" || body.status === "INACTIVE" ? body.status : undefined,
    });
    return ok({ demo: false, data });
  } catch (error) {
    return fail(error, "tiktok");
  }
}
