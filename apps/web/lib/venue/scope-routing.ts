/**
 * Single source of truth for venue/global URL scoping.
 *
 * The app is navigated through per-tab, URL-scoped prefixes so that multiple
 * venues (and the global view) can be open in different browser tabs at once
 * without sharing state:
 *
 *   - Venue scope:  /venue/<slug>/<canonical>
 *   - Global scope: /global/<mapped>
 *
 * "Canonical" paths are the physical route-tree paths (what page files live at
 * and what nav configs use, e.g. `/dashboard`, `/hr/staff`, `/sales/settings`).
 * Middleware rewrites the public, scoped URL onto the canonical route tree and
 * forwards the resolved scope via request headers, so the active venue is
 * derived from the URL of the current request — never from shared browser
 * state.
 *
 * This module is imported by middleware (edge runtime) and by client helpers,
 * so it must stay pure (no Node/React imports).
 */

export type VenueScope = "venue" | "global";

export const VENUE_SEGMENT = "venue";
export const GLOBAL_SEGMENT = "global";

/** Request headers set by middleware and read during server rendering. */
export const VENUE_SCOPE_HEADER = "x-ss-venue-scope";
export const VENUE_SLUG_HEADER = "x-ss-venue-slug";

/** Canonical app route roots that live under the venue scope. */
export const VENUE_APP_ROOTS = [
  "/dashboard",
  "/modules",
  "/hr",
  "/sales",
  "/settings",
  "/profile",
  "/user-guide",
  "/developers",
  "/legal",
] as const;

/** App-relative paths that are never scoped to a venue/global prefix. */
const UNSCOPED_PREFIXES = [
  "/login",
  "/forgot-password",
  "/reset-password",
  "/select-venue",
  "/auth",
  "/api",
] as const;

export function isUnscopedPath(path: string): boolean {
  return UNSCOPED_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

/** True when `path` is (or is nested under) `root`. */
function underRoot(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}

/** Strip a leading segment prefix, returning the remainder ("" when exact). */
function stripPrefix(path: string, prefix: string): string {
  if (path === prefix) return "";
  if (path.startsWith(`${prefix}/`)) return path.slice(prefix.length);
  return path;
}

export const venueBase = (slug: string): string => `/${VENUE_SEGMENT}/${slug}`;
export const GLOBAL_BASE = `/${GLOBAL_SEGMENT}`;

/**
 * Map a canonical route path to its public, scoped URL for the given scope.
 * Used when rendering links/redirects.
 */
export function toScopedHref(
  href: string,
  scope: VenueScope,
  slug: string | null,
): string {
  if (!href.startsWith("/")) return href;
  if (isUnscopedPath(href)) return href;
  // Already scoped/absolute for a global-only surface.
  if (href.startsWith(`/${VENUE_SEGMENT}/`) || underRoot(href, GLOBAL_BASE)) {
    return href;
  }

  if (scope === "venue") {
    if (!slug) return href;
    return `${venueBase(slug)}${href}`;
  }

  return canonicalToGlobalPublic(href);
}

/** Scope an href for a resolved venue row (server-side redirects/links). */
export function scopedHrefForVenue(
  venue: { is_global: boolean | null; slug: string },
  href: string,
): string {
  return venue.is_global
    ? toScopedHref(href, "global", null)
    : toScopedHref(href, "venue", venue.slug);
}

/** Canonical -> public path within the global scope. */
export function canonicalToGlobalPublic(path: string): string {
  if (path === "/dashboard") return GLOBAL_BASE;
  if (underRoot(path, "/modules")) return `${GLOBAL_BASE}${path}`;
  if (underRoot(path, "/hr/settings")) {
    return `${GLOBAL_BASE}/settings/hr${stripPrefix(path, "/hr/settings")}`;
  }
  if (underRoot(path, "/sales/settings")) {
    return `${GLOBAL_BASE}/settings/sales${stripPrefix(path, "/sales/settings")}`;
  }
  // Global-only pages already live under /global.
  if (underRoot(path, GLOBAL_BASE)) return path;
  // Everything else (profile, user-guide, developers, legal, ...).
  return `${GLOBAL_BASE}${path}`;
}

export type ScopeResolution = {
  scope: VenueScope;
  /** Venue slug for venue scope; null for global. */
  slug: string | null;
  /** Canonical route-tree path the request should render. */
  canonical: string;
  /** Whether the public path differs from canonical (needs a rewrite). */
  needsRewrite: boolean;
};

/**
 * Resolve an incoming public pathname into its scope + canonical route path.
 * Returns null when the path is not venue/global scoped (public/auth routes,
 * or bare canonical app routes that predate scoping).
 */
export function resolvePublicPath(pathname: string): ScopeResolution | null {
  // Normalize a single trailing slash (except root) so scoped roots resolve.
  if (pathname.length > 1 && pathname.endsWith("/")) {
    pathname = pathname.slice(0, -1);
  }

  // Venue scope: /venue/<slug>[/<rest>]
  if (pathname === `/${VENUE_SEGMENT}` || pathname === `/${VENUE_SEGMENT}/`) {
    return null;
  }
  if (pathname.startsWith(`/${VENUE_SEGMENT}/`)) {
    const afterSegment = pathname.slice(`/${VENUE_SEGMENT}/`.length);
    const slashIdx = afterSegment.indexOf("/");
    const slug = slashIdx === -1 ? afterSegment : afterSegment.slice(0, slashIdx);
    if (!slug) return null;
    const rest = slashIdx === -1 ? "" : afterSegment.slice(slashIdx);
    const canonical = rest === "" || rest === "/" ? "/dashboard" : rest;
    return {
      scope: "venue",
      slug,
      canonical,
      needsRewrite: true,
    };
  }

  // Global scope: /global[/<rest>]
  if (pathname === GLOBAL_BASE || underRoot(pathname, GLOBAL_BASE)) {
    const canonical = globalPublicToCanonical(pathname);
    return {
      scope: "global",
      slug: null,
      canonical,
      needsRewrite: canonical !== pathname,
    };
  }

  return null;
}

/** Public path within the global scope -> canonical route-tree path. */
export function globalPublicToCanonical(pathname: string): string {
  if (pathname === GLOBAL_BASE || pathname === `${GLOBAL_BASE}/`) {
    return "/dashboard";
  }
  if (underRoot(pathname, `${GLOBAL_BASE}/modules`)) {
    return stripPrefix(pathname, GLOBAL_BASE);
  }
  if (underRoot(pathname, `${GLOBAL_BASE}/settings/hr`)) {
    return `/hr/settings${stripPrefix(pathname, `${GLOBAL_BASE}/settings/hr`)}`;
  }
  if (underRoot(pathname, `${GLOBAL_BASE}/settings/sales`)) {
    return `/sales/settings${stripPrefix(pathname, `${GLOBAL_BASE}/settings/sales`)}`;
  }
  // Global-only surfaces (/global/settings, /global/settings/apps,
  // /global/settings/branding, ...) render from their own physical routes.
  if (underRoot(pathname, `${GLOBAL_BASE}/settings`)) return pathname;
  // Shared user-level pages mounted under global (profile, user-guide, ...).
  return stripPrefix(pathname, GLOBAL_BASE);
}

/**
 * Convert a public pathname into the canonical path used by nav configs and
 * active-state matching (the inverse of {@link toScopedHref}). Given the
 * current scope/base, strips the scope prefix so existing `/hr`, `/sales`,
 * `startsWith(...)` logic keeps working unchanged.
 */
export function toRelativePathname(
  pathname: string,
  scope: VenueScope,
  slug: string | null,
): string {
  if (scope === "venue" && slug) {
    const base = venueBase(slug);
    if (pathname === base) return "/dashboard";
    if (pathname.startsWith(`${base}/`)) return pathname.slice(base.length);
    return pathname;
  }
  if (scope === "global") {
    return globalPublicToCanonical(pathname);
  }
  return pathname;
}
