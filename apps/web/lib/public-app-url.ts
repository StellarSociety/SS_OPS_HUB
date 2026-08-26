/**
 * Canonical public URL for links we put in email (invites, acknowledgements).
 * Local NEXT_PUBLIC_APP_URL is localhost for the running app — never use that
 * in outbound employee email.
 */

export const PRODUCTION_APP_URL = "https://opshub.stellarsocietygroup.com";

function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, "");
}

function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return stripTrailingSlash(trimmed);
  return stripTrailingSlash(`https://${trimmed.replace(/^\/+/, "")}`);
}

function isLocalHostUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "::1"
    );
  } catch {
    return /localhost|127\.0\.0\.1/i.test(url);
  }
}

function firstPublicCandidate(values: Array<string | undefined>): string {
  for (const raw of values) {
    const url = normalizeUrl(String(raw ?? ""));
    if (url && !isLocalHostUrl(url)) return url;
  }
  return "";
}

/**
 * Current environment's app URL (localhost in dev, production URL on Vercel).
 * Use for auth redirects and same-env links. Prefer `publicAppUrl()` in email.
 */
export function envAppUrl(): string {
  return stripTrailingSlash(
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  );
}

export function publicAppUrl(): string {
  const vercelHost = String(
    process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "",
  ).trim();
  return (
    firstPublicCandidate([
      process.env.NEXT_PUBLIC_SITE_URL,
      process.env.NEXT_PUBLIC_APP_URL_PROD,
      process.env.NEXT_PUBLIC_APP_URL,
      vercelHost,
    ]) || PRODUCTION_APP_URL
  );
}

/** Join an in-app path onto the app origin. */
export function joinAppUrl(path: string, base: string = publicAppUrl()): string {
  const parsed = new URL(path, "https://ss.invalid");
  const origin = new URL(normalizeUrl(base) || base).origin;
  return `${origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
}

/** Build an absolute in-app URL from an incoming request. */
export function absoluteAppHref(href: string, requestUrl: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  const origin = new URL(requestUrl).origin;
  const parsed = new URL(href, "https://ss.invalid");
  return `${origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
}

/** Resolve a public-folder path against the current app URL (emails, PDFs). */
export function absolutePublicAssetUrl(url: string): string {
  if (/^https?:\/\//i.test(url) || url.startsWith("data:")) return url;
  const path = url.startsWith("/") ? url : `/${url}`;
  if (typeof window !== "undefined") {
    return new URL(path, window.location.origin).toString();
  }
  return joinAppUrl(path, envAppUrl());
}
