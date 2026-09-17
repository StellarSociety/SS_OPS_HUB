// Next.js only inlines NEXT_PUBLIC_* when the member access is static.
// Optional chaining on process.env.NEXT_PUBLIC_* ships as `undefined` in production.
const NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY;

export const WEB_PUSH_PUBLIC_KEY = (NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY ?? "").trim();

export const PUSH_BANNER_DISMISS_KEY = "ss-ops-push-banner-dismissed";
/** Hide the enable banner for 14 days after dismiss. */
export const PUSH_BANNER_DISMISS_MS = 14 * 24 * 60 * 60 * 1000;
