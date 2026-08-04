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
  /** Zoho OAuth `error` code when present (e.g. invalid_client). */
  code: string | null;
  /** Zoho OAuth `error_description` when present. */
  description: string | null;

  constructor(
    message: string,
    status: number,
    body: string,
    options?: { code?: string | null; description?: string | null },
  ) {
    super(message);
    this.name = "WorkDriveApiError";
    this.status = status;
    this.body = body;
    this.code = options?.code ?? null;
    this.description = options?.description ?? null;
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
  const url = `https://${host}/oauth/v2/token`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(12_000),
  });
  const rawText = await res.text().catch(() => "");
  let json: TokenResponse = {};
  try {
    json = rawText ? (JSON.parse(rawText) as TokenResponse) : {};
  } catch {
    json = {};
  }
  if (!res.ok || json.error || !json.access_token) {
    const code = String(json.error ?? "").trim() || null;
    const description = String(json.error_description ?? "").trim() || null;
    const summary =
      [code, description].filter(Boolean).join(" — ") ||
      (rawText.trim() ? rawText.trim().slice(0, 300) : "Token request failed");
    throw new WorkDriveApiError(summary, res.status, rawText || JSON.stringify(json), {
      code,
      description,
    });
  }
  return json;
}

/** Safe fingerprint for logs / UI (never the full secret). */
export function fingerprintCredential(value: string | null | undefined): string {
  const t = String(value ?? "").trim();
  if (!t) return "(empty)";
  if (t.length <= 10) return `${t.length} chars`;
  return `${t.length} chars · ${t.slice(0, 6)}…${t.slice(-4)}`;
}

export type WorkDriveCredentialProbe = {
  region: string;
  accountsHost: string;
  clientId: string;
  clientIdSource: "db" | "env" | "missing";
  clientSecretSource: "db" | "env" | "missing";
  refreshTokenSource: "db" | "env" | "missing";
  clientSecretDecrypt: "ok" | "failed" | "skipped";
  refreshTokenDecrypt: "ok" | "failed" | "skipped";
  clientSecretFingerprint: string;
  refreshTokenFingerprint: string;
  decryptError?: string;
};

/** Probe how credentials will be resolved (no secrets returned in full). */
export function probeWorkDriveCredentials(
  settings: HrWorkDriveSettings,
): WorkDriveCredentialProbe {
  const envCreds = readWorkDriveEnvCredentials();
  const region = settings.region || envCreds.region || "com";
  const accountsHost = zohoAccountsHost(region);

  const clientIdSource: WorkDriveCredentialProbe["clientIdSource"] = settings.clientId
    ? "db"
    : envCreds.clientId
      ? "env"
      : "missing";
  const clientId =
    settings.clientId || envCreds.clientId
      ? fingerprintCredential(settings.clientId || envCreds.clientId)
      : "(missing)";

  let clientSecretSource: WorkDriveCredentialProbe["clientSecretSource"] = "missing";
  let clientSecretDecrypt: WorkDriveCredentialProbe["clientSecretDecrypt"] = "skipped";
  let clientSecretFingerprint = "(missing)";
  let decryptError: string | undefined;

  if (settings.clientSecretEncrypted) {
    clientSecretSource = "db";
    try {
      const secret = decryptSecret(settings.clientSecretEncrypted);
      clientSecretDecrypt = "ok";
      clientSecretFingerprint = fingerprintCredential(secret);
    } catch (error) {
      clientSecretDecrypt = "failed";
      decryptError =
        error instanceof Error ? error.message : "Client secret decrypt failed";
    }
  } else if (envCreds.clientSecret) {
    clientSecretSource = "env";
    clientSecretDecrypt = "ok";
    clientSecretFingerprint = fingerprintCredential(envCreds.clientSecret);
  }

  let refreshTokenSource: WorkDriveCredentialProbe["refreshTokenSource"] = "missing";
  let refreshTokenDecrypt: WorkDriveCredentialProbe["refreshTokenDecrypt"] = "skipped";
  let refreshTokenFingerprint = "(missing)";

  if (settings.refreshTokenEncrypted) {
    refreshTokenSource = "db";
    try {
      const token = decryptSecret(settings.refreshTokenEncrypted);
      refreshTokenDecrypt = "ok";
      refreshTokenFingerprint = fingerprintCredential(token);
    } catch (error) {
      refreshTokenDecrypt = "failed";
      if (!decryptError) {
        decryptError =
          error instanceof Error
            ? error.message
            : "Refresh token decrypt failed";
      }
    }
  } else if (envCreds.refreshToken) {
    refreshTokenSource = "env";
    refreshTokenDecrypt = "ok";
    refreshTokenFingerprint = fingerprintCredential(envCreds.refreshToken);
  }

  return {
    region,
    accountsHost,
    clientId,
    clientIdSource,
    clientSecretSource,
    refreshTokenSource,
    clientSecretDecrypt,
    refreshTokenDecrypt,
    clientSecretFingerprint,
    refreshTokenFingerprint,
    decryptError,
  };
}

function explainZohoOAuthCode(code: string | null | undefined): string | null {
  const c = String(code ?? "").trim().toLowerCase();
  if (c === "invalid_client") {
    return [
      "Zoho rejected the OAuth client (invalid_client).",
      "Usual causes:",
      "• Client ID and Client Secret do not belong to the same Zoho API Console app",
      "• Client Secret was rotated in Zoho but not re-saved here",
      "• Refresh token was issued for a different Client ID",
      "• Wrong data center / region (this request uses the Accounts host below)",
      "Fix: paste the current Client Secret from Zoho API Console → Self Client,",
      "then generate a fresh grant code and click Exchange code (or paste a new refresh token).",
    ].join("\n");
  }
  if (c === "invalid_code") {
    return "Grant code is invalid or expired (codes last ~3 minutes). Generate a new Self Client code and exchange it immediately.";
  }
  if (c === "access_denied") {
    return "Zoho denied access. Check that the Self Client scopes include WorkDrive.files.ALL and WorkDrive.teamfolders.READ.";
  }
  if (c === "invalid_grant" || c === "invalid_token") {
    return "Refresh token is invalid or revoked. Generate a new Self Client grant code and exchange it to replace the refresh token.";
  }
  return null;
}

/** Multi-line error for Test connection UI / lastError (no secrets). */
export function formatWorkDriveTestFailure(
  error: unknown,
  probe: WorkDriveCredentialProbe,
  options?: { step?: string; folderId?: string },
): string {
  const lines: string[] = [];
  const step = options?.step ?? "token refresh";
  lines.push(`WorkDrive test failed at: ${step}`);

  if (error instanceof WorkDriveApiError) {
    lines.push(`Zoho error: ${error.message}`);
    if (error.code) lines.push(`Error code: ${error.code}`);
    if (error.description) lines.push(`Description: ${error.description}`);
    lines.push(`HTTP status: ${error.status || "(Zoho often returns 200 with an error body)"}`);
    const tip = explainZohoOAuthCode(error.code || error.message);
    if (tip) {
      lines.push("");
      lines.push(tip);
    }
    if (error.body && error.body !== error.message) {
      lines.push("");
      lines.push(`Raw response: ${error.body.slice(0, 400)}`);
    }
  } else if (error instanceof Error) {
    lines.push(`Error: ${error.message}`);
    const tip = explainZohoOAuthCode(error.message);
    if (tip) {
      lines.push("");
      lines.push(tip);
    }
  } else {
    lines.push("Error: Connection test failed.");
  }

  lines.push("");
  lines.push("Debug:");
  lines.push(`• Region: ${probe.region}`);
  lines.push(`• Accounts host: https://${probe.accountsHost}/oauth/v2/token`);
  lines.push(`• Client ID: ${probe.clientId} (source: ${probe.clientIdSource})`);
  lines.push(
    `• Client secret: ${probe.clientSecretFingerprint} (source: ${probe.clientSecretSource}, decrypt: ${probe.clientSecretDecrypt})`,
  );
  lines.push(
    `• Refresh token: ${probe.refreshTokenFingerprint} (source: ${probe.refreshTokenSource}, decrypt: ${probe.refreshTokenDecrypt})`,
  );
  if (options?.folderId) {
    lines.push(`• Folder ID under test: ${options.folderId}`);
  }
  if (probe.decryptError) {
    lines.push(`• Decrypt error: ${probe.decryptError}`);
  }

  return lines.join("\n");
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
