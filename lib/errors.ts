export type ErrorCode =
  | "AUTH"
  | "PERMISSION"
  | "RATE_LIMIT"
  | "NOT_FOUND"
  | "UNAVAILABLE"
  | "NOT_CONNECTED"
  | "CONFIG"
  | "POLICY"
  | "UNKNOWN";

export interface FriendlyError {
  code: ErrorCode;
  message: string;
  hint: string;
  retryable: boolean;
}

const FRIENDLY: Record<ErrorCode, { message: string; hint: string; retryable: boolean }> = {
  AUTH: {
    message: "The connection needs to be signed in again.",
    hint: "Open Settings, check the credentials for this network, then use Test connection.",
    retryable: false,
  },
  PERMISSION: {
    message: "This account did not allow access to the requested data.",
    hint: "Check that the token belongs to a user with read access, and that no extra approval is missing.",
    retryable: false,
  },
  RATE_LIMIT: {
    message: "The advertising platform asked us to slow down.",
    hint: "Wait a minute, then press Refresh. Kampa retries automatically a few times first.",
    retryable: true,
  },
  NOT_FOUND: {
    message: "That account or report could not be found.",
    hint: "Check the account ID in Settings, and confirm the account still exists.",
    retryable: false,
  },
  UNAVAILABLE: {
    message: "The advertising platform is temporarily unavailable.",
    hint: "Try again in a few minutes. Your settings and other tabs are unaffected.",
    retryable: true,
  },
  NOT_CONNECTED: {
    message: "This network is not connected yet.",
    hint: "Open Settings and add the credentials, or switch Demo mode on to explore the dashboard.",
    retryable: false,
  },
  CONFIG: {
    message: "A required setting is missing or invalid.",
    hint: "Open Settings, fill in the highlighted field, then save and test the connection.",
    retryable: false,
  },
  POLICY: {
    message: "This request was blocked by Kampa's read-only safety rules.",
    hint: "Only a fixed list of official read endpoints is allowed. No ad account data can be changed.",
    retryable: false,
  },
  UNKNOWN: {
    message: "Something unexpected happened.",
    hint: "Press Refresh. If it keeps happening, open Settings and run Test connection.",
    retryable: true,
  },
};

export class AppError extends Error {
  code: ErrorCode;
  status: number;
  hint: string;
  retryable: boolean;
  provider?: string;
  detail?: string;

  constructor(code: ErrorCode, options: { detail?: string; status?: number; provider?: string } = {}) {
    const friendly = FRIENDLY[code];
    super(friendly.message);
    this.name = "AppError";
    this.code = code;
    this.status = options.status ?? statusFor(code);
    this.hint = friendly.hint;
    this.retryable = friendly.retryable;
    this.provider = options.provider;
    this.detail = options.detail;
  }

  toPublic(): FriendlyError {
    return {
      code: this.code,
      message: this.message,
      hint: this.hint,
      retryable: this.retryable,
    };
  }
}

export function statusFor(code: ErrorCode): number {
  switch (code) {
    case "AUTH":
      return 401;
    case "PERMISSION":
    case "POLICY":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "RATE_LIMIT":
      return 429;
    case "NOT_CONNECTED":
    case "CONFIG":
      return 400;
    case "UNAVAILABLE":
      return 502;
    default:
      return 500;
  }
}

export function toAppError(error: unknown, provider?: string): AppError {
  if (error instanceof AppError) return error;
  const message = error instanceof Error ? error.message : "";
  if (/abort|timeout|timed out/i.test(message)) {
    return new AppError("UNAVAILABLE", {
      detail: "The request timed out.",
      provider,
    });
  }
  return new AppError("UNKNOWN", {
    detail: message.slice(0, 300) || "Unknown error",
    provider,
  });
}

export function publicError(error: unknown, provider?: string): FriendlyError {
  return toAppError(error, provider).toPublic();
}
