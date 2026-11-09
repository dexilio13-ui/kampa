import { apiFetch } from "../http";
import { cacheGetOrLoad } from "../cache";
import { AppError } from "../errors";

export interface GoogleOAuthCreds {
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
}

export async function googleAccessToken(creds: GoogleOAuthCreds, provider: string): Promise<string> {
  if (!creds.clientId || !creds.clientSecret || !creds.refreshToken) {
    throw new AppError("NOT_CONNECTED", { provider, detail: "Google OAuth credentials are incomplete." });
  }
  const key = `oauth:google:${provider}:${creds.clientId}:${creds.refreshToken.slice(-8)}`;
  return cacheGetOrLoad(
    key,
    async () => {
      const response = await apiFetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        provider,
        timeoutMs: 15_000,
        retries: 1,
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: creds.clientId!,
          client_secret: creds.clientSecret!,
          refresh_token: creds.refreshToken!,
        }),
      });
      const json = response.json as { access_token?: string; expires_in?: number } | null;
      if (!json?.access_token) {
        throw new AppError("AUTH", { provider, detail: "The token exchange returned no access token." });
      }
      return json.access_token;
    },
    50 * 60 * 1000,
  );
}

export async function revokeGoogleToken(token: string): Promise<void> {
  if (!token) return;
  await apiFetch("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    provider: "google",
    timeoutMs: 10_000,
    retries: 1,
    body: new URLSearchParams({ token }),
  });
}

export interface TikTokClientTokenCreds {
  clientKey?: string;
  clientSecret?: string;
}

export async function tiktokClientToken(creds: TikTokClientTokenCreds): Promise<string> {
  if (!creds.clientKey || !creds.clientSecret) {
    throw new AppError("NOT_CONNECTED", { provider: "tiktok", detail: "TikTok Commercial Content API keys are missing." });
  }
  const key = `oauth:tiktok:${creds.clientKey}:${creds.clientSecret.slice(-6)}`;
  return cacheGetOrLoad(
    key,
    async () => {
      const response = await apiFetch("https://open.tiktokapis.com/v2/oauth/token/", {
        method: "POST",
        provider: "tiktok",
        timeoutMs: 15_000,
        retries: 1,
        body: {
          client_key: creds.clientKey,
          client_secret: creds.clientSecret,
          grant_type: "client_credentials",
        },
      });
      const json = response.json as { access_token?: string; data?: { access_token?: string } } | null;
      const token = json?.access_token ?? json?.data?.access_token;
      if (!token) {
        throw new AppError("AUTH", { provider: "tiktok", detail: "TikTok did not return a client token." });
      }
      return token;
    },
    50 * 60 * 1000,
  );
}
