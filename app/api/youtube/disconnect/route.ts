import { fail, guard, guardMutation, ok } from "@/lib/api";
import { readSettings, clearYouTubeSettings } from "@/lib/settings";
import { YouTubeClient } from "@/lib/clients/youtube";
import { cacheClear } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    guard(request);
    guardMutation(request);
    const settings = await readSettings();
    let revokeNote = "YouTube credentials and cached data were deleted.";
    if (settings.youtube.refreshToken) {
      try {
        await new YouTubeClient(settings).revoke();
      } catch {
        revokeNote = "Local YouTube credentials and cached data were deleted. Google's revocation endpoint could not be reached.";
      }
    }
    await clearYouTubeSettings(settings);
    cacheClear("youtube");
    cacheClear("data:youtube");
    cacheClear("overview");
    cacheClear("oauth:google:youtube");
    return ok({ ok: true, message: revokeNote });
  } catch (error) {
    return fail(error, "youtube");
  }
}
