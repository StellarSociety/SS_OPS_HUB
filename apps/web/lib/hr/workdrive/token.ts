import "server-only";

import { decryptSecret } from "@/lib/email/secret";
import { readWorkDriveEnvCredentials } from "@/lib/hr/workdrive/env";
import {
  zohoAccountsHost,
  zohoWorkDriveApiHost,
} from "@/lib/hr/workdrive/settings";
import type { HrWorkDriveSettings } from "@/lib/hr/types";

type TokenCacheEntry = {
  accessToken: string;
  apiDomain: string;
  expiresAtMs: number;
};

/** Per-venue access-token cache (~55 min). Warm serverless instances only. */
const tokenCache = new Map<string, TokenCacheEntry>();

export class WorkDriveApiError extends Error {
  status: number;
  body: string;

  constructor(message: string, status: number, body: string) {
    super(message);
    this.name = "WorkDriveApiError";
    this.status = status;
    this.body = body;
  }
}

export type WorkDriveCredentials = {
  region: HrWorkDriveSettings["region"];
  clientId: string;
  clientSecret: string;
  refreshToken: string;
};

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  api_domain?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

async function requestToken(
  region: HrWorkDriveSettings["region"],
  body: URLSearchParams,
): Promise<TokenResponse> {
  const host = zohoAccountsHost(region);
  const res = await fetch(`https://${host}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || json.error || !json.access_token) {
    throw new WorkDriveApiError(
      json.error_description || json.error || "Token request failed",
      res.status,
      JSON.stringify(json),
    );
  }
  return json;
}

export function credentialsFromSettings(
  settings: HrWorkDriveSettings,
): WorkDriveCredentials {
  const envCreds = readWorkDriveEnvCredentials();
  const clientId = settings.clientId || envCreds.clientId || "";
  if (!clientId) throw new Error("WorkDrive Client ID is missing.");

  let clientSecret = "";
  if (settings.clientSecretEncrypted) {
    clientSecret = decryptSecret(settings.clientSecretEncrypted);
  } else if (envCreds.clientSecret) {
    clientSecret = envCreds.clientSecret;
  }
  if (!clientSecret) throw new Error("WorkDrive client secret is missing.");

  let refreshToken = "";
  if (settings.refreshTokenEncrypted) {
    refreshToken = decryptSecret(settings.refreshTokenEncrypted);
  } else if (envCreds.refreshToken) {
    refreshToken = envCreds.refreshToken;
  }
  if (!refreshToken) throw new Error("WorkDrive refresh token is missing.");

  return {
    region: settings.region || envCreds.region || "com",
    clientId,
    clientSecret,
    refreshToken,
  };
}

/** One-time: authorization grant code → refresh + access token. */
export async function exchangeAuthorizationCode(params: {
  region: HrWorkDriveSettings["region"];
  clientId: string;
  clientSecret: string;
  code: string;
}): Promise<{
  accessToken: string;
  refreshToken: string;
  apiDomain: string;
  expiresIn: number;
}> {
  const json = await requestToken(
    params.region,
    new URLSearchParams({
      grant_type: "authorization_code",
      client_id: params.clientId,
      client_secret: params.clientSecret,
      code: params.code.trim(),
    }),
  );
  if (!json.refresh_token) {
    throw new Error(
      "Token response had no refresh_token. Regenerate a Self Client code with access_type offline / Generate Code flow.",
    );
  }
  return {
    accessToken: json.access_token!,
    refreshToken: json.refresh_token,
    apiDomain:
      json.api_domain || `https://${zohoWorkDriveApiHost(params.region)}`,
    expiresIn: Number(json.expires_in) || 3600,
  };
}

/**
 * Refresh via `POST accounts…/oauth/v2/token` (`grant_type=refresh_token`).
 * Caches access token ~55 min in memory (Zoho access tokens live 1h).
 * Never stores the access token as env.
 */
export async function ensureAccessToken(
  venueId: string,
  credentials: WorkDriveCredentials,
  options?: { forceRefresh?: boolean },
): Promise<{ accessToken: string; apiDomain: string }> {
  const cached = tokenCache.get(venueId);
  const now = Date.now();
  if (
    !options?.forceRefresh &&
    cached &&
    cached.expiresAtMs > now + 60_000
  ) {
    return { accessToken: cached.accessToken, apiDomain: cached.apiDomain };
  }

  const json = await requestToken(
    credentials.region,
    new URLSearchParams({
      grant_type: "refresh_token",
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      refresh_token: credentials.refreshToken,
    }),
  );

  const apiDomain =
    json.api_domain || `https://${zohoWorkDriveApiHost(credentials.region)}`;
  const expiresIn = Number(json.expires_in) || 3600;
  const entry: TokenCacheEntry = {
    accessToken: json.access_token!,
    apiDomain,
    expiresAtMs: now + Math.max(60, expiresIn - 300) * 1000,
  };
  tokenCache.set(venueId, entry);
  return { accessToken: entry.accessToken, apiDomain: entry.apiDomain };
}

export function clearAccessTokenCache(venueId?: string) {
  if (venueId) tokenCache.delete(venueId);
  else tokenCache.clear();
}
