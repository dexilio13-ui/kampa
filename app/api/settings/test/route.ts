import { fail, guard, guardMutation, ok, readJson } from "@/lib/api";
import { readSettings } from "@/lib/settings";
import { GoogleAdsClient } from "@/lib/clients/google-ads";
import { MetaClient } from "@/lib/clients/meta";
import { TikTokClient } from "@/lib/clients/tiktok";
import { YouTubeClient } from "@/lib/clients/youtube";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    guard(request);
    guardMutation(request);
    const settings = await readSettings();
    const body = await readJson(request);
    const network = String(body.network ?? "");
    if (settings.demoMode) {
      return ok({ ok: true, message: "Demo mode is on, so no real account is contacted. Turn Demo mode off to test live credentials." });
    }

    if (network === "googleAds") {
      const client = new GoogleAdsClient(settings);
      const accounts = await client.listAccessibleCustomers();
      return ok({ ok: true, message: `Google Ads answered. ${accounts.length} accessible customer${accounts.length === 1 ? "" : "s"} found.` });
    }
    if (network === "meta") {
      const client = new MetaClient(settings);
      const accounts = await client.listAccounts();
      const first = settings.meta.adAccountIds[0] ?? accounts[0]?.id;
      if (!first) throw new AppError("NOT_FOUND", { provider: "meta", detail: "No ad account was found." });
      const message = await client.testConnection(first);
      return ok({ ok: true, message });
    }
    if (network === "tiktok") {
      const client = new TikTokClient(settings);
      const id = settings.tiktok.advertiserIds[0];
      if (!id) throw new AppError("CONFIG", { provider: "tiktok", detail: "Add an advertiser ID first." });
      const message = await client.testConnection(id);
      return ok({ ok: true, message });
    }
    if (network === "youtube") {
      const client = new YouTubeClient(settings);
      const channel = await client.getChannel();
      return ok({ ok: true, message: `YouTube answered for “${channel.title}”.` });
    }
    if (network === "tiktokAdlib") {
      if (!settings.tiktok.ccAccessToken && !(settings.tiktok.ccClientKey && settings.tiktok.ccClientSecret)) {
        throw new AppError("NOT_CONNECTED", { provider: "tiktok", detail: "Add the Commercial Content API keys first." });
      }
      return ok({ ok: true, message: "Commercial Content API credentials are present. Calls only work after TikTok approves the research scope." });
    }
    throw new AppError("CONFIG", { detail: "Unknown network." });
  } catch (error) {
    return fail(error);
  }
}
