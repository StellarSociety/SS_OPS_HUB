export const MOBILE_APP_BASE = "/m";

export type AppPathPage = {
  id: string;
  label: string;
  href: string;
  /** Login / venue picker have no venue segment. */
  venueScoped?: boolean;
  /** Reached from this page instead of the previous list item (a branch). */
  from?: string;
};

/**
 * Ordered screens in the mobile app module (`/m/...`).
 * These are not webapp routes — the device preview and the phone host
 * must use this tree only.
 */
export const APP_PATH: AppPathPage[] = [
  { id: "login", label: "Login", href: `${MOBILE_APP_BASE}/login` },
  {
    id: "select-venue",
    label: "Venue selection",
    href: `${MOBILE_APP_BASE}/select-venue`,
  },
  {
    id: "welcome",
    label: "Welcome",
    href: `${MOBILE_APP_BASE}/welcome`,
    venueScoped: true,
  },
  {
    id: "notifications",
    label: "Notifications",
    href: `${MOBILE_APP_BASE}/notifications`,
    venueScoped: true,
    from: "welcome",
  },
  {
    id: "employee-profile",
    label: "Employee Profile",
    href: `${MOBILE_APP_BASE}/employee-profile`,
    venueScoped: true,
    from: "welcome",
  },
  {
    id: "revenue",
    label: "Revenue",
    href: `${MOBILE_APP_BASE}/revenue`,
    venueScoped: true,
    from: "welcome",
  },
  {
    id: "terms",
    label: "Terms & Conditions",
    href: `${MOBILE_APP_BASE}/terms`,
    venueScoped: true,
    from: "welcome",
  },
];

export function getAppPathPage(id: string): AppPathPage {
  return APP_PATH.find((page) => page.id === id) ?? APP_PATH[0];
}

export function isMobileAppPath(pathname: string): boolean {
  return (
    pathname === MOBILE_APP_BASE || pathname.startsWith(`${MOBILE_APP_BASE}/`)
  );
}

/** Public phone URL for the screen currently shown in the device preview. */
export function appPathPublicHref(
  page: AppPathPage,
  venue: { slug: string },
): string {
  if (!page.venueScoped) return page.href;
  const rest = page.href.slice(MOBILE_APP_BASE.length);
  return `${MOBILE_APP_BASE}/${venue.slug}${rest}`;
}

export function mobileWelcomeHref(venueSlug: string): string {
  return `${MOBILE_APP_BASE}/${venueSlug}/welcome`;
}

export function mobileNotificationsHref(venueSlug: string): string {
  return `${MOBILE_APP_BASE}/${venueSlug}/notifications`;
}

export function mobileProfileHref(venueSlug: string): string {
  return `${MOBILE_APP_BASE}/${venueSlug}/employee-profile`;
}

export function mobileRevenueHref(venueSlug: string): string {
  return `${MOBILE_APP_BASE}/${venueSlug}/revenue`;
}

export function mobileTermsHref(venueSlug: string): string {
  return `${MOBILE_APP_BASE}/${venueSlug}/terms`;
}

/** Same-origin `/m/...` path only. */
export function safeMobileAppPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!isMobileAppPath(trimmed.split("?")[0] ?? trimmed)) return null;
  if (trimmed.startsWith("//") || trimmed.includes("://")) return null;
  return trimmed;
}
