import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";

const OAUTH_COOKIE = "ss-sentiment-google-oauth";
const STATE_TTL_MS = 10 * 60 * 1000;
const BUSINESS_SCOPE = "https://www.googleapis.com/auth/business.manage";
const EMAIL_SCOPE = "https://www.googleapis.com/auth/userinfo.email";

export type GoogleOAuthState = {
  venueId: string;
  userId: string;
  slug: string | null;
  nonce: string;
  issuedAt: number;
  redirectOrigin: string;
};

function envOrigin(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
}

export async function requestAppOrigin(): Promise<string> {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  if (!host) return envOrigin();
  const isLocal = host.startsWith("localhost") || host.startsWith("127.0.0.1");
  const proto =
    headerStore.get("x-forwarded-proto") ?? (isLocal ? "http" : "https");
  return `${proto}://${host}`.replace(/\/$/, "");
}

export function googleOAuthConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CLIENT_SECRET?.trim(),
  );
}

export function googlePlacesConfigured(): boolean {
  return Boolean(process.env.GOOGLE_PLACES_API_KEY?.trim());
}

export function googleCallbackUrl(origin?: string | null): string {
  return `${(origin || envOrigin()).replace(/\/$/, "")}/api/sentiment/google/callback`;
}

function signingKey(): Buffer {
  const raw =
    process.env.APP_SECRETS_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!raw) {
    throw new Error("APP_SECRETS_KEY is required to start Google OAuth.");
  }
  return Buffer.from(raw);
}

function signPayload(payload: string): string {
  return createHmac("sha256", signingKey()).update(payload).digest("base64url");
}

export function encodeOAuthState(state: Omit<GoogleOAuthState, "nonce" | "issuedAt">): string {
  const full: GoogleOAuthState = {
    ...state,
    nonce: randomBytes(16).toString("hex"),
    issuedAt: Date.now(),
  };
  const payload = Buffer.from(JSON.stringify(full), "utf8").toString("base64url");
  return `${payload}.${signPayload(payload)}`;
}

export function decodeOAuthState(token: string): GoogleOAuthState | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = signPayload(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as GoogleOAuthState;
    if (!parsed.venueId || !parsed.userId || !parsed.nonce) return null;
    if (Date.now() - parsed.issuedAt > STATE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function storeOAuthCookie(state: string): Promise<void> {
  const store = await cookies();
  store.set(OAUTH_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: STATE_TTL_MS / 1000,
  });
}

export async function readOAuthCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(OAUTH_COOKIE)?.value ?? null;
}

export async function clearOAuthCookie(): Promise<void> {
  const store = await cookies();
  store.delete(OAUTH_COOKIE);
}

export function buildGoogleAuthUrl(state: string, redirectOrigin?: string | null): string {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!clientId) {
    throw new Error("GOOGLE_CLIENT_ID is not set.");
  }
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: googleCallbackUrl(redirectOrigin),
    response_type: "code",
    scope: `${BUSINESS_SCOPE} ${EMAIL_SCOPE}`,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export type GoogleTokenSet = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string;
  email: string | null;
};

export async function exchangeGoogleCode(
  code: string,
  redirectOrigin?: string | null,
): Promise<GoogleTokenSet> {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth is not configured.");
  }

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: googleCallbackUrl(redirectOrigin),
    grant_type: "authorization_code",
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!response.ok || !json.access_token) {
    throw new Error(
      json.error_description || json.error || "Google token exchange failed.",
    );
  }

  const email = await fetchGoogleEmail(json.access_token);
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresAt: new Date(Date.now() + (json.expires_in ?? 3600) * 1000).toISOString(),
    email,
  };
}

export async function refreshGoogleAccessToken(
  refreshToken: string,
): Promise<{ accessToken: string; expiresAt: string }> {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth is not configured.");
  }

  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!response.ok || !json.access_token) {
    throw new Error(
      json.error_description || json.error || "Google token refresh failed.",
    );
  }
  return {
    accessToken: json.access_token,
    expiresAt: new Date(Date.now() + (json.expires_in ?? 3600) * 1000).toISOString(),
  };
}

async function fetchGoogleEmail(accessToken: string): Promise<string | null> {
  const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return null;
  const json = (await response.json()) as { email?: string };
  return json.email ?? null;
}
