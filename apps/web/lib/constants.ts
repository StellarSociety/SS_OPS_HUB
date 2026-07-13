export const ACTIVE_VENUE_COOKIE = "ss-active-venue";

/**
 * Remembers whether the last-used scope was a real venue or the global view.
 * Used only to route bare/entry URLs (`/`, login, bookmarks) to a sensible
 * default scoped URL — never as the source of truth for the active venue,
 * which is derived per-request from the URL.
 */
export const ACTIVE_SCOPE_COOKIE = "ss-active-scope";

export const PUBLIC_ROUTES = [
  "/login",
  "/forgot-password",
  "/reset-password",
  "/auth/callback",
] as const;
