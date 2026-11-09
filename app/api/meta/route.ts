import { fail, guard, levelParam, ok, searchParams } from "@/lib/api";
import { getData } from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    guard(request);
    const params = searchParams(request);
    const platformRaw = params.get("platform");
    const platform = platformRaw === "facebook" || platformRaw === "instagram" ? platformRaw : "both";
    const data = await getData({
      network: "meta",
      preset: params.get("preset") ?? undefined,
      start: params.get("start") ?? undefined,
      end: params.get("end") ?? undefined,
      level: levelParam(request, "campaign"),
      accountId: params.get("account") ?? undefined,
      platform,
      actionType: params.get("actionType") ?? "purchase",
      metricKeys: params.get("metrics")?.split(","),
      refresh: params.get("refresh") === "1",
    });
    return ok(data);
  } catch (error) {
    return fail(error, "meta");
  }
}
