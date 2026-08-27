/** Shared Apify scrape limits — keep this file free of server-only imports. */

export const APIFY_MANUAL_COOLDOWN_MS = 2 * 60 * 60 * 1000;
export const APIFY_MANUAL_LOOKBACK_DAYS = 2;
export const APIFY_CRON_LOOKBACK_DAYS = 3;
export const APIFY_MANUAL_LOOKBACK = `${APIFY_MANUAL_LOOKBACK_DAYS} days`;
export const APIFY_MANUAL_MAX_REVIEWS = 25;
export const APIFY_CRON_LOOKBACK = `${APIFY_CRON_LOOKBACK_DAYS} days`;
export const APIFY_CRON_MAX_REVIEWS = 40;

export function apifyLookbackSinceDate(mode: "cron" | "manual"): string {
  const days =
    mode === "manual" ? APIFY_MANUAL_LOOKBACK_DAYS : APIFY_CRON_LOOKBACK_DAYS;
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export function apifyManualCooldownRemainingMs(
  lastSyncedAt: string | null | undefined,
): number {
  if (!lastSyncedAt) return 0;
  const last = Date.parse(lastSyncedAt);
  if (Number.isNaN(last)) return 0;
  return Math.max(0, last + APIFY_MANUAL_COOLDOWN_MS - Date.now());
}

export function formatCooldownUntil(remainingMs: number): string {
  const until = new Date(Date.now() + remainingMs);
  try {
    return until.toLocaleTimeString("en-AE", {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return until.toISOString();
  }
}
