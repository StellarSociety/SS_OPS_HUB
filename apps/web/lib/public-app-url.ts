/**
 * Canonical public origin for links we put in email (invites, acknowledgements).
 * Local NEXT_PUBLIC_APP_URL is localhost for the running app — never use that
 * in outbound employee email.
 */

const PRODUCTION_APP_URL = "https://ssopshub.vercel.app";

function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, "");
}

function withHttps(value: string): string {
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
    const url = withHttps(String(raw ?? ""));
    if (url && !isLocalHostUrl(url)) return url;
  }
  return "";
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
