import { fail, guard, levelParam, ok, searchParams } from "@/lib/api";
import { getData } from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    guard(request);
    const params = searchParams(request);
    const level = levelParam(request, "channel");
    const data = await getData({
      network: "youtube",
      preset: params.get("preset") ?? undefined,
      start: params.get("start") ?? undefined,
      end: params.get("end") ?? undefined,
      level: level === "video" ? "video" : "channel",
      metricKeys: params.get("metrics")?.split(","),
      dimension: params.get("dimension") ?? undefined,
      refresh: params.get("refresh") === "1",
    });
    return ok(data);
  } catch (error) {
    return fail(error, "youtube");
  }
}
