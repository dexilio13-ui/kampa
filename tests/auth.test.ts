import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkPassword,
  createSessionToken,
  isAuthenticated,
  parseCookies,
  passwordRequired,
  requireAuth,
  sessionCookieOptions,
  verifySessionToken,
} from "../lib/auth";

const SECRET = "test-secret-with-enough-length-2026";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("optional password gate", () => {
  it("is open when APP_PASSWORD is absent", () => {
    vi.stubEnv("APP_PASSWORD", "");
    const request = new Request("http://localhost/api/bootstrap");
    expect(passwordRequired()).toBe(false);
    expect(isAuthenticated(request)).toBe(true);
    expect(checkPassword("anything")).toBe(true);
  });

  it("requires the correct password and signed cookie when enabled", () => {
    vi.stubEnv("APP_SECRET", SECRET);
    vi.stubEnv("APP_PASSWORD", "open-sesame");
    expect(passwordRequired()).toBe(true);
    expect(checkPassword("open-sesame")).toBe(true);
    expect(checkPassword("wrong")).toBe(false);
    const request = new Request("http://localhost/api/bootstrap");
    expect(isAuthenticated(request)).toBe(false);
    expect(() => requireAuth(request)).toThrow(/optional password|signed in/i);
  });

  it("creates an expiring signed token that the request can present", () => {
    vi.stubEnv("APP_SECRET", SECRET);
    vi.stubEnv("APP_PASSWORD", "open-sesame");
    const token = createSessionToken();
    expect(verifySessionToken(token)).toBe(true);
    expect(verifySessionToken(`${token}x`)).toBe(false);
    expect(verifySessionToken(undefined)).toBe(false);
    expect(verifySessionToken("1.bad")).toBe(false);

    const request = new Request("http://localhost/api/bootstrap", {
      headers: { cookie: `kampa_session=${token}` },
    });
    expect(isAuthenticated(request)).toBe(true);
  });

  it("rejects expired tokens", () => {
    vi.stubEnv("APP_SECRET", SECRET);
    const expired = createSessionToken(Date.now() - 8 * 24 * 60 * 60 * 1000);
    expect(verifySessionToken(expired)).toBe(false);
  });

  it("uses a hardened cookie", () => {
    vi.stubEnv("NODE_ENV", "production");
    const options = sessionCookieOptions();
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("strict");
    expect(options.secure).toBe(true);
    expect(options.path).toBe("/");
    expect(options.maxAge).toBeGreaterThan(0);
  });

  it("parses cookies without throwing on malformed pairs", () => {
    expect(parseCookies("a=1; b=two; broken; c=hello%20world")).toEqual({ a: "1", b: "two", c: "hello world" });
    expect(parseCookies(null)).toEqual({});
  });
});
