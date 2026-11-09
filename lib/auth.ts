import { AppError } from "./errors";
import { safeEqual, signPayload } from "./crypto";

export const SESSION_COOKIE = "adpulse_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export function passwordRequired(): boolean {
  return Boolean(process.env.APP_PASSWORD);
}

function secret(): string {
  const value = process.env.APP_SECRET;
  if (!value) {
    throw new AppError("CONFIG", {
      detail: "APP_SECRET is required to sign the login session.",
    });
  }
  return value;
}

export function createSessionToken(now = Date.now()): string {
  const expires = Math.floor(now / 1000) + SESSION_TTL_SECONDS;
  const payload = `adpulse:${expires}`;
  return `${expires}.${signPayload(payload, secret())}`;
}

export function verifySessionToken(token: string | undefined | null, now = Date.now()): boolean {
  if (!token) return false;
  const [expiresRaw, signature] = token.split(".");
  if (!expiresRaw || !signature) return false;
  const expires = Number(expiresRaw);
  if (!Number.isFinite(expires) || expires * 1000 < now) return false;
  try {
    return safeEqual(signature, signPayload(`adpulse:${expires}`, secret()));
  } catch {
    return false;
  }
}

export function parseCookies(header: string | null): Record<string, string> {
  if (!header) return {};
  const result: Record<string, string> = {};
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) result[key] = decodeURIComponent(value);
  }
  return result;
}

export function isAuthenticated(request: Request): boolean {
  if (!passwordRequired()) return true;
  const cookies = parseCookies(request.headers.get("cookie"));
  return verifySessionToken(cookies[SESSION_COOKIE]);
}

export function requireAuth(request: Request): void {
  if (!isAuthenticated(request)) {
    throw new AppError("AUTH", { status: 401, detail: "The optional password gate is enabled." });
  }
}

export function checkPassword(candidate: string): boolean {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return true;
  return safeEqual(candidate, expected);
}

export function sessionCookieOptions(): {
  httpOnly: true;
  sameSite: "strict";
  secure: boolean;
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}

export function authState(request: Request) {
  return {
    required: passwordRequired(),
    authenticated: isAuthenticated(request),
  };
}
