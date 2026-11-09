import { AppError } from "./errors";
import { assertAllowed } from "./allowlist";

export interface ApiFetchOptions {
  method: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string | URLSearchParams | Record<string, unknown>;
  timeoutMs?: number;
  retries?: number;
  provider: string;
  retryBaseMs?: number;
  retryPost?: boolean;
  sleepFn?: (ms: number) => Promise<void>;
}

export interface ApiResponse {
  status: number;
  headers: Headers;
  json: unknown;
  text: string;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function statusToCode(status: number): "AUTH" | "PERMISSION" | "RATE_LIMIT" | "NOT_FOUND" | "UNAVAILABLE" | "CONFIG" | "UNKNOWN" {
  if (status === 401) return "AUTH";
  if (status === 403) return "PERMISSION";
  if (status === 404) return "NOT_FOUND";
  if (status === 429) return "RATE_LIMIT";
  if (status >= 500) return "UNAVAILABLE";
  if (status >= 400) return "CONFIG";
  return "UNKNOWN";
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function retryAfterMs(headers: Headers): number | null {
  const raw = headers.get("retry-after");
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(0, Math.min(60_000, seconds * 1000));
  const date = Date.parse(raw);
  if (!Number.isNaN(date)) return Math.max(0, Math.min(60_000, date - Date.now()));
  return null;
}

export function rateLimitDetails(headers: Headers): string[] {
  const keys = ["x-ratelimit-remaining", "x-ratelimit-reset", "x-business-use-case-usage", "x-fb-ads-insights-throttle"];
  return keys
    .map((key) => {
      const value = headers.get(key);
      return value ? `${key}: ${value.slice(0, 200)}` : null;
    })
    .filter((value): value is string => Boolean(value));
}

/**
 * All outbound traffic goes through here. It checks the allowlist before
 * opening a connection, never logs headers or bodies, and returns typed errors.
 */
export async function apiFetch(rawUrl: string, options: ApiFetchOptions): Promise<ApiResponse> {
  const rule = assertAllowed(options.method, rawUrl);
  const url = new URL(rawUrl);
  const retries = options.retries ?? 3;
  const base = options.retryBaseMs ?? 600;
  const pause = options.sleepFn ?? sleep;
  const canRetryMethod = options.method === "GET" || options.retryPost === true;

  let headers: Record<string, string> = { accept: "application/json", ...(options.headers ?? {}) };
  let body: BodyInit | undefined;

  if (options.body instanceof URLSearchParams) {
    body = options.body.toString();
    headers = { ...headers, "content-type": "application/x-www-form-urlencoded" };
  } else if (typeof options.body === "string") {
    body = options.body;
  } else if (options.body) {
    body = JSON.stringify(options.body);
    headers = { ...headers, "content-type": "application/json" };
  }

  let lastError: AppError | null = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 20_000);
    try {
      const response = await fetch(url, {
        method: options.method,
        headers,
        body,
        signal: controller.signal,
        cache: "no-store",
        redirect: "error",
      });
      clearTimeout(timer);

      const text = await response.text();
      let json: unknown = null;
      if (text) {
        try {
          json = JSON.parse(text);
        } catch {
          json = null;
        }
      }

      if (!response.ok) {
        const code = statusToCode(response.status);
        lastError = new AppError(code, {
          provider: options.provider,
          status: response.status,
          detail: `${rule.label} returned HTTP ${response.status}.`,
        });

        if (canRetryMethod && isRetryableStatus(response.status) && attempt < retries) {
          const hinted = retryAfterMs(response.headers);
          const delay = hinted ?? Math.round(base * 2 ** attempt + Math.random() * 200);
          await pause(delay);
          continue;
        }
        throw lastError;
      }

      return { status: response.status, headers: response.headers, json, text };
    } catch (error) {
      clearTimeout(timer);
      if (error instanceof AppError) throw error;

      const aborted = error instanceof Error && /abort/i.test(error.name + error.message);
      lastError = new AppError(aborted ? "UNAVAILABLE" : "UNKNOWN", {
        provider: options.provider,
        detail: aborted ? "The request timed out." : "The network request failed.",
      });

      if (canRetryMethod && attempt < retries) {
        const delay = Math.round(base * 2 ** attempt + Math.random() * 200);
        await pause(delay);
        continue;
      }
      throw lastError;
    }
  }

  throw lastError ?? new AppError("UNKNOWN", { provider: options.provider });
}
