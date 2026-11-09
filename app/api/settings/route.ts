import { fail, guard, guardMutation, ok, readJson } from "@/lib/api";
import { deleteAllSettings, mergeSettings, readSettings, toPublicSettings, writeSettings, connectionState } from "@/lib/settings";
import type { SettingsPatch } from "@/lib/settings";
import { authState } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    guard(request);
    const settings = await readSettings();
    return ok({
      settings: toPublicSettings(settings),
      connections: connectionState(settings),
      auth: authState(request),
      readOnly: true,
    });
  } catch (error) {
    return fail(error);
  }
}

function patchFrom(body: Record<string, unknown>): SettingsPatch {
  const patch: SettingsPatch = {};
  if (typeof body.demoMode === "boolean") patch.demoMode = body.demoMode;
  if (typeof body.timezone === "string") patch.timezone = body.timezone;
  if (typeof body.defaultRange === "string") patch.defaultRange = body.defaultRange;
  if (typeof body.reduceMotion === "boolean") patch.reduceMotion = body.reduceMotion;
  if (body.apiVersions && typeof body.apiVersions === "object") patch.apiVersions = body.apiVersions as SettingsPatch["apiVersions"];
  for (const key of ["googleAds", "meta", "tiktok", "youtube"] as const) {
    const value = body[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      patch[key] = value as Record<string, unknown>;
    }
  }
  return patch;
}

export async function POST(request: Request) {
  try {
    guard(request);
    guardMutation(request);
    const body = await readJson(request);
    const current = await readSettings();
    const next = mergeSettings(current, patchFrom(body));
    await writeSettings(next);
    return ok({
      settings: toPublicSettings(next),
      connections: connectionState(next),
      message: "Settings saved.",
    });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: Request) {
  try {
    guard(request);
    guardMutation(request);
    await deleteAllSettings();
    const empty = await readSettings();
    return ok({
      message: "All stored settings and cached data were deleted.",
      settings: toPublicSettings(empty),
      connections: connectionState(empty),
    });
  } catch (error) {
    return fail(error);
  }
}
