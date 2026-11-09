import { fail, guard, levelParam, ok, searchParams } from "@/lib/api";
import { getData } from "@/lib/data";
import type { Network } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    guard(request);
    const params = searchParams(request);
    const data = await getData({
      network: "google-ads" as Network,
      preset: params.get("preset") ?? undefined,
      start: params.get("start") ?? undefined,
      end: params.get("end") ?? undefined,
      level: levelParam(request, "campaign"),
      accountId: params.get("account") ?? undefined,
      subtab: params.get("subtab") ?? "search",
      metricKeys: params.get("metrics")?.split(","),
      refresh: params.get("refresh") === "1",
    });
    return ok(data);
  } catch (error) {
    return fail(error, "google-ads");
  }
}
