import { promises as fs } from "node:fs";
import path from "node:path";
import { AppError } from "./errors";
import { decryptJson, encryptJson, maskValue } from "./crypto";
import type { AppSettings, MetaSettings, PublicSettings, TikTokSettings } from "./types";
import { cacheClear } from "./cache";

export const DEFAULT_SETTINGS: AppSettings = {
  demoMode: true,
  timezone: "UTC",
  defaultRange: "last_7d",
  reduceMotion: false,
  apiVersions: {
    googleAds: process.env.GOOGLE_ADS_API_VERSION || "v26",
    meta: process.env.META_API_VERSION || "v26.0",
    tiktok: process.env.TIKTOK_API_VERSION || "v1.3",
  },
  googleAds: {
    customerIds: [],
  },
  meta: {
    adAccountIds: [],
  },
  tiktok: {
    advertiserIds: [],
  },
  youtube: {
    monetized: false,
  },
};

export function settingsFilePath(): string {
  return process.env.KAMPA_SETTINGS_FILE || path.join(process.cwd(), "data", "settings.enc.json");
}

function appSecret(): string {
  const secret = process.env.APP_SECRET;
  if (!secret) {
    throw new AppError("CONFIG", {
      detail: "APP_SECRET is missing. Add it to .env.local before saving settings.",
    });
  }
  return secret;
}

function sanitizeVersion(value: unknown, fallback: string): string {
  return typeof value === "string" && /^v\d+(\.\d+)?$/.test(value) ? value : fallback;
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return [...new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))].slice(0, 200);
}

function validTimezone(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return value;
  } catch {
    return undefined;
  }
}

function normalise(raw: Partial<AppSettings>): AppSettings {
  const demoMode = typeof raw.demoMode === "boolean" ? raw.demoMode : DEFAULT_SETTINGS.demoMode;
  return {
    demoMode,
    timezone: validTimezone(raw.timezone) ?? DEFAULT_SETTINGS.timezone,
    defaultRange: typeof raw.defaultRange === "string" ? raw.defaultRange : DEFAULT_SETTINGS.defaultRange,
    reduceMotion: typeof raw.reduceMotion === "boolean" ? raw.reduceMotion : false,
    apiVersions: {
      googleAds: sanitizeVersion(raw.apiVersions?.googleAds, DEFAULT_SETTINGS.apiVersions.googleAds),
      meta: sanitizeVersion(raw.apiVersions?.meta, DEFAULT_SETTINGS.apiVersions.meta),
      tiktok: sanitizeVersion(raw.apiVersions?.tiktok, DEFAULT_SETTINGS.apiVersions.tiktok),
    },
    googleAds: {
      developerToken: raw.googleAds?.developerToken,
      clientId: raw.googleAds?.clientId,
      clientSecret: raw.googleAds?.clientSecret,
      refreshToken: raw.googleAds?.refreshToken,
      loginCustomerId: raw.googleAds?.loginCustomerId,
      customerIds: stringArray(raw.googleAds?.customerIds) ?? [],
      connectedAt: raw.googleAds?.connectedAt,
    },
    meta: {
      accessToken: raw.meta?.accessToken,
      appId: raw.meta?.appId,
      appSecret: raw.meta?.appSecret,
      adAccountIds: stringArray(raw.meta?.adAccountIds) ?? [],
      connectedAt: raw.meta?.connectedAt,
    },
    tiktok: {
      appId: raw.tiktok?.appId,
      appSecret: raw.tiktok?.appSecret,
      accessToken: raw.tiktok?.accessToken,
      advertiserIds: stringArray(raw.tiktok?.advertiserIds) ?? [],
      ccClientKey: raw.tiktok?.ccClientKey,
      ccClientSecret: raw.tiktok?.ccClientSecret,
      ccAccessToken: raw.tiktok?.ccAccessToken,
      connectedAt: raw.tiktok?.connectedAt,
    },
    youtube: {
      clientId: raw.youtube?.clientId,
      clientSecret: raw.youtube?.clientSecret,
      refreshToken: raw.youtube?.refreshToken,
      channelId: raw.youtube?.channelId,
      channelTitle: raw.youtube?.channelTitle,
      monetized: raw.youtube?.monetized === true,
      connectedAt: raw.youtube?.connectedAt,
    },
  };
}

export async function readSettings(): Promise<AppSettings> {
  const file = settingsFilePath();
  try {
    const text = await fs.readFile(file, "utf8");
    const envelope = JSON.parse(text);
    const decrypted = decryptJson<Partial<AppSettings>>(envelope, appSecret());
    return normalise(decrypted);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return structuredClone(DEFAULT_SETTINGS);
    if (error instanceof AppError) throw error;
    throw new AppError("CONFIG", { detail: "Stored settings are not readable." });
  }
}

export async function writeSettings(settings: AppSettings): Promise<void> {
  const file = settingsFilePath();
  const envelope = encryptJson(settings, appSecret());
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temp, JSON.stringify(envelope), { encoding: "utf8", mode: 0o600 });
  await fs.rename(temp, file);
  cacheClear();
}

function pickSecret(current: string | undefined, incoming: unknown): string | undefined {
  if (incoming === "__CLEAR__") return undefined;
  if (incoming === undefined || incoming === null || incoming === "" || incoming === "__KEEP__") return current;
  if (typeof incoming !== "string") return current;
  return incoming.trim();
}

function pickText(current: string | undefined, incoming: unknown): string | undefined {
  if (incoming === undefined) return current;
  if (incoming === null) return undefined;
  if (typeof incoming !== "string") return current;
  const trimmed = incoming.trim();
  return trimmed || undefined;
}

export interface SettingsPatch {
  demoMode?: boolean;
  timezone?: string;
  defaultRange?: string;
  reduceMotion?: boolean;
  apiVersions?: Partial<AppSettings["apiVersions"]>;
  googleAds?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  tiktok?: Record<string, unknown>;
  youtube?: Record<string, unknown>;
}

export function mergeSettings(current: AppSettings, patch: SettingsPatch): AppSettings {
  const g = patch.googleAds ?? {};
  const m = patch.meta ?? {};
  const t = patch.tiktok ?? {};
  const y = patch.youtube ?? {};

  const meta: MetaSettings = {
    ...current.meta,
    accessToken: pickSecret(current.meta.accessToken, m.accessToken),
    appId: pickSecret(current.meta.appId, m.appId),
    appSecret: pickSecret(current.meta.appSecret, m.appSecret),
    adAccountIds: stringArray(m.adAccountIds) ?? current.meta.adAccountIds,
    connectedAt: current.meta.connectedAt,
  };

  const tiktok: TikTokSettings = {
    ...current.tiktok,
    appId: pickSecret(current.tiktok.appId, t.appId),
    appSecret: pickSecret(current.tiktok.appSecret, t.appSecret),
    accessToken: pickSecret(current.tiktok.accessToken, t.accessToken),
    ccClientKey: pickSecret(current.tiktok.ccClientKey, t.ccClientKey),
    ccClientSecret: pickSecret(current.tiktok.ccClientSecret, t.ccClientSecret),
    ccAccessToken: pickSecret(current.tiktok.ccAccessToken, t.ccAccessToken),
    advertiserIds: stringArray(t.advertiserIds) ?? current.tiktok.advertiserIds,
    connectedAt: current.tiktok.connectedAt,
  };

  const merged: AppSettings = {
    ...current,
    demoMode: typeof patch.demoMode === "boolean" ? patch.demoMode : current.demoMode,
    timezone: validTimezone(patch.timezone) ?? current.timezone,
    defaultRange: typeof patch.defaultRange === "string" ? patch.defaultRange : current.defaultRange,
    reduceMotion: typeof patch.reduceMotion === "boolean" ? patch.reduceMotion : current.reduceMotion,
    apiVersions: {
      googleAds: sanitizeVersion(patch.apiVersions?.googleAds, current.apiVersions.googleAds),
      meta: sanitizeVersion(patch.apiVersions?.meta, current.apiVersions.meta),
      tiktok: sanitizeVersion(patch.apiVersions?.tiktok, current.apiVersions.tiktok),
    },
    googleAds: {
      ...current.googleAds,
      developerToken: pickSecret(current.googleAds.developerToken, g.developerToken),
      clientId: pickSecret(current.googleAds.clientId, g.clientId),
      clientSecret: pickSecret(current.googleAds.clientSecret, g.clientSecret),
      refreshToken: pickSecret(current.googleAds.refreshToken, g.refreshToken),
      loginCustomerId: pickText(current.googleAds.loginCustomerId, g.loginCustomerId),
      customerIds: stringArray(g.customerIds) ?? current.googleAds.customerIds,
    },
    meta,
    tiktok,
    youtube: {
      ...current.youtube,
      clientId: pickSecret(current.youtube.clientId, y.clientId),
      clientSecret: pickSecret(current.youtube.clientSecret, y.clientSecret),
      refreshToken: pickSecret(current.youtube.refreshToken, y.refreshToken),
      channelId: pickText(current.youtube.channelId, y.channelId),
      channelTitle: pickText(current.youtube.channelTitle, y.channelTitle),
      monetized: typeof y.monetized === "boolean" ? y.monetized : current.youtube.monetized,
    },
  };

  const now = new Date().toISOString();
  if (merged.googleAds.customerIds.length > 0 || merged.googleAds.refreshToken) {
    merged.googleAds.connectedAt = merged.googleAds.connectedAt ?? now;
  }
  if (merged.meta.adAccountIds.length > 0 || merged.meta.accessToken) {
    merged.meta.connectedAt = merged.meta.connectedAt ?? now;
  }
  if (merged.tiktok.advertiserIds.length > 0 || merged.tiktok.accessToken) {
    merged.tiktok.connectedAt = merged.tiktok.connectedAt ?? now;
  }
  if (merged.youtube.refreshToken) {
    merged.youtube.connectedAt = merged.youtube.connectedAt ?? now;
  }

  return merged;
}

export function toPublicSettings(settings: AppSettings): PublicSettings {
  return {
    demoMode: settings.demoMode,
    timezone: settings.timezone,
    defaultRange: settings.defaultRange,
    reduceMotion: settings.reduceMotion,
    apiVersions: settings.apiVersions,
    googleAds: {
      developerToken: maskValue(settings.googleAds.developerToken),
      clientId: maskValue(settings.googleAds.clientId),
      clientSecret: maskValue(settings.googleAds.clientSecret),
      refreshToken: maskValue(settings.googleAds.refreshToken),
      loginCustomerId: settings.googleAds.loginCustomerId ?? "",
      customerIds: settings.googleAds.customerIds,
      connectedAt: settings.googleAds.connectedAt ?? null,
    },
    meta: {
      accessToken: maskValue(settings.meta.accessToken),
      appId: maskValue(settings.meta.appId),
      appSecret: maskValue(settings.meta.appSecret),
      adAccountIds: settings.meta.adAccountIds,
      connectedAt: settings.meta.connectedAt ?? null,
    },
    tiktok: {
      appId: maskValue(settings.tiktok.appId),
      appSecret: maskValue(settings.tiktok.appSecret),
      accessToken: maskValue(settings.tiktok.accessToken),
      advertiserIds: settings.tiktok.advertiserIds,
      ccClientKey: maskValue(settings.tiktok.ccClientKey),
      ccClientSecret: maskValue(settings.tiktok.ccClientSecret),
      ccAccessToken: maskValue(settings.tiktok.ccAccessToken),
      connectedAt: settings.tiktok.connectedAt ?? null,
    },
    youtube: {
      clientId: maskValue(settings.youtube.clientId),
      clientSecret: maskValue(settings.youtube.clientSecret),
      refreshToken: maskValue(settings.youtube.refreshToken),
      channelId: settings.youtube.channelId ?? "",
      channelTitle: settings.youtube.channelTitle ?? "",
      monetized: settings.youtube.monetized,
      connectedAt: settings.youtube.connectedAt ?? null,
    },
  };
}

export function connectionState(settings: AppSettings) {
  return {
    googleAds: Boolean(settings.googleAds.refreshToken && settings.googleAds.developerToken) || settings.googleAds.customerIds.length > 0,
    meta: Boolean(settings.meta.accessToken),
    tiktok: Boolean(settings.tiktok.accessToken),
    youtube: Boolean(settings.youtube.refreshToken),
    tiktokAdlib: Boolean(settings.tiktok.ccAccessToken || (settings.tiktok.ccClientKey && settings.tiktok.ccClientSecret)),
  };
}

export async function deleteAllSettings(): Promise<void> {
  try {
    await fs.unlink(settingsFilePath());
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  cacheClear();
  // Data lives in memory only; there is no data directory besides settings.
}

export async function clearYouTubeSettings(settings: AppSettings): Promise<AppSettings> {
  const cleared: AppSettings = {
    ...settings,
    youtube: { monetized: false },
  };
  await writeSettings(cleared);
  cacheClear("youtube");
  return cleared;
}
