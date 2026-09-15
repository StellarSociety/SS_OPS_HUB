/** Shared Apify scrape limits — keep this file free of server-only imports. */

export const APIFY_MANUAL_COOLDOWN_MS = 2 * 60 * 60 * 1000;
export const APIFY_MANUAL_LOOKBACK_DAYS = 2;
export const APIFY_CRON_LOOKBACK_DAYS = 3;
export const APIFY_CRON_CATCHUP_MAX_DAYS = 30;
export const APIFY_MANUAL_LOOKBACK = `${APIFY_MANUAL_LOOKBACK_DAYS} days`;
export const APIFY_MANUAL_MAX_REVIEWS = 25;
export const APIFY_CRON_LOOKBACK = `${APIFY_CRON_LOOKBACK_DAYS} days`;
export const APIFY_CRON_MAX_REVIEWS = 40;
export const APIFY_CRON_CATCHUP_MAX_REVIEWS = 80;

/** Cron lookback grows to cover a missed sync, capped so the free Apify plan stays intact. */
export function apifyCronLookbackDays(
  lastSyncedAt: string | null | undefined,
): number {
  if (!lastSyncedAt) return APIFY_CRON_LOOKBACK_DAYS;
  const last = Date.parse(lastSyncedAt);
  if (Number.isNaN(last)) return APIFY_CRON_LOOKBACK_DAYS;
  const daysAgo = Math.ceil((Date.now() - last) / 86_400_000) + 1;
  return Math.min(
    Math.max(daysAgo, APIFY_CRON_LOOKBACK_DAYS),
    APIFY_CRON_CATCHUP_MAX_DAYS,
  );
}

export function apifyCronLookbackSince(
  lastSyncedAt: string | null | undefined,
): string {
  return `${apifyCronLookbackDays(lastSyncedAt)} days`;
}

export function apifyCronMaxReviews(lookback: string): number {
  const days = Number.parseInt(lookback, 10);
  if (!Number.isFinite(days) || days <= APIFY_CRON_LOOKBACK_DAYS) {
    return APIFY_CRON_MAX_REVIEWS;
  }
  return APIFY_CRON_CATCHUP_MAX_REVIEWS;
}

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
