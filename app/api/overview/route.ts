import { fail, guard, ok, searchParams } from "@/lib/api";
import { getOverview } from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    guard(request);
    const params = searchParams(request);
    const data = await getOverview({
      preset: params.get("preset") ?? undefined,
      start: params.get("start") ?? undefined,
      end: params.get("end") ?? undefined,
      refresh: params.get("refresh") === "1",
    });
    return ok(data);
  } catch (error) {
    return fail(error);
  }
}
