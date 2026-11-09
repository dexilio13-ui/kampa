import { NextResponse } from "next/server";
import { fail, NO_STORE, ok, readJson, clientKey, guardMutation } from "@/lib/api";
import { authState, checkPassword, createSessionToken, passwordRequired, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const attempts = new Map<string, { count: number; resetAt: number }>();

export async function GET(request: Request) {
  return ok(authState(request));
}

export async function POST(request: Request) {
  try {
    guardMutation(request);
    if (!passwordRequired()) {
      return ok({ ...authState(request), message: "No password is required." });
    }
    const key = clientKey(request);
    const now = Date.now();
    const record = attempts.get(key);
    if (record && record.resetAt > now && record.count >= 8) {
      return NextResponse.json(
        { error: { code: "RATE_LIMIT", message: "Too many attempts.", hint: "Wait a minute and try again.", retryable: true } },
        { status: 429, headers: NO_STORE },
      );
    }

    const body = await readJson(request);
    const password = typeof body.password === "string" ? body.password : "";
    if (!checkPassword(password)) {
      const next = record && record.resetAt > now ? { count: record.count + 1, resetAt: record.resetAt } : { count: 1, resetAt: now + 60_000 };
      attempts.set(key, next);
      return NextResponse.json(
        { error: { code: "AUTH", message: "That password did not match.", hint: "Try again, or ask the person who deployed Kampa.", retryable: false } },
        { status: 401, headers: NO_STORE },
      );
    }

    attempts.delete(key);
    const response = NextResponse.json({ required: true, authenticated: true }, { headers: NO_STORE });
    response.cookies.set(SESSION_COOKIE, createSessionToken(), sessionCookieOptions());
    return response;
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: Request) {
  try {
    guardMutation(request);
    const response = NextResponse.json({ required: passwordRequired(), authenticated: !passwordRequired() }, { headers: NO_STORE });
    response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
    return response;
  } catch (error) {
    return fail(error);
  }
}
