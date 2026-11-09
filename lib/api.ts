import { NextResponse } from "next/server";
import { AppError, publicError } from "./errors";
import { requireAuth } from "./auth";
import type { Level, Network } from "./types";

export const NO_STORE = {
  "cache-control": "no-store, max-age=0",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
} as const;

export function ok(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: NO_STORE });
}

export function fail(error: unknown, provider?: string): NextResponse {
  const appError = error instanceof AppError ? error : null;
  const friendly = publicError(error, provider);
  return NextResponse.json({ error: friendly }, { status: appError?.status ?? 500, headers: NO_STORE });
}

export function guard(request: Request): void {
  requireAuth(request);
}

/**
 * Reject cross-site mutations. SameSite=Strict already blocks most CSRF, but
 * this also covers browsers or proxies that do not send a session cookie.
 */
export function guardMutation(request: Request): void {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") {
    throw new AppError("POLICY", { status: 403, detail: "Cross-site mutation blocked." });
  }
  const origin = request.headers.get("origin");
  if (!origin) return;
  try {
    const originUrl = new URL(origin);
    const requestUrl = new URL(request.url);
    const forwarded = request.headers.get("x-forwarded-host");
    if (originUrl.host !== requestUrl.host && originUrl.host !== forwarded) {
      throw new AppError("POLICY", { status: 403, detail: "Origin mismatch." });
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("POLICY", { status: 403, detail: "Invalid origin." });
  }
}

export function searchParams(request: Request): URLSearchParams {
  return new URL(request.url).searchParams;
}

const LEVELS = new Set<Level>(["account", "campaign", "ad_group", "ad", "keyword", "search_term", "product", "video", "channel", "asset_group", "placement"]);

export function levelParam(request: Request, fallback: Level = "campaign"): Level {
  const value = searchParams(request).get("level") as Level | null;
  return value && LEVELS.has(value) ? value : fallback;
}

export function networkPath(network: Network): string {
  return `/api/${network}`;
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
    return {};
  } catch {
    return {};
  }
}

export function clientKey(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}
