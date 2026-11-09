import { fail, guard, ok } from "@/lib/api";
import { readSettings, toPublicSettings, connectionState } from "@/lib/settings";
import { authState } from "@/lib/auth";
import { labeledCatalog, catalogSummaries } from "@/lib/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    guard(request);
    const settings = await readSettings();
    const includeExperimental = settings.demoMode;
    return ok({
      demoMode: settings.demoMode,
      settings: toPublicSettings(settings),
      connections: connectionState(settings),
      catalogs: {
        "google-ads": labeledCatalog("google-ads", { includeExperimental }),
        meta: labeledCatalog("meta", { includeExperimental }),
        tiktok: labeledCatalog("tiktok", { includeExperimental }),
        youtube: labeledCatalog("youtube", { monetized: settings.youtube.monetized, includeExperimental }),
      },
      catalogSummaries: catalogSummaries(),
      auth: authState(request),
      readOnly: true,
      scopes: {
        googleAds: ["https://www.googleapis.com/auth/adwords"],
        meta: ["ads_read", "business_management (only to list accounts)"],
        tiktok: ["Marketing API reporting and object read access", "research.adlib.basic (optional public Ad Library)"],
        youtube: [
          "https://www.googleapis.com/auth/youtube.readonly",
          "https://www.googleapis.com/auth/yt-analytics.readonly",
          "https://www.googleapis.com/auth/yt-analytics-monetary.readonly (optional, monetized channels only)",
        ],
      },
    });
  } catch (error) {
    return fail(error);
  }
}
