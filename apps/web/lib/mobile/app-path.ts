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
    id: "notification-alerts",
    label: "Alerts",
    href: `${MOBILE_APP_BASE}/notifications/alerts`,
    venueScoped: true,
    from: "notifications",
  },
  {
    id: "notification-archive",
    label: "Archive",
    href: `${MOBILE_APP_BASE}/notifications/archive`,
    venueScoped: true,
    from: "notifications",
  },
  {
    id: "notification-settings",
    label: "Notification settings",
    href: `${MOBILE_APP_BASE}/notifications/settings`,
    venueScoped: true,
    from: "notifications",
  },
  {
    id: "employee-profile",
    label: "Employee Profile",
    href: `${MOBILE_APP_BASE}/employee-profile`,
    venueScoped: true,
    from: "welcome",
  },
  {
    id: "attendance",
    label: "Attendance",
    href: `${MOBILE_APP_BASE}/attendance`,
    venueScoped: true,
    from: "employee-profile",
  },
  {
    id: "leave",
    label: "Leave",
    href: `${MOBILE_APP_BASE}/leave`,
    venueScoped: true,
    from: "employee-profile",
  },
  {
    id: "docs",
    label: "Docs",
    href: `${MOBILE_APP_BASE}/docs`,
    venueScoped: true,
    from: "employee-profile",
  },
  {
    id: "revenue",
    label: "Revenue",
    href: `${MOBILE_APP_BASE}/revenue`,
    venueScoped: true,
    from: "welcome",
  },
  {
    id: "sentiment",
    label: "Sentiment",
    href: `${MOBILE_APP_BASE}/sentiment`,
    venueScoped: true,
    from: "welcome",
  },
  {
    id: "sentiment-reviews",
    label: "Reviews",
    href: `${MOBILE_APP_BASE}/sentiment/reviews`,
    venueScoped: true,
    from: "sentiment",
  },
  {
    id: "sentiment-calendar",
    label: "Calendar",
    href: `${MOBILE_APP_BASE}/sentiment/calendar`,
    venueScoped: true,
    from: "sentiment",
  },
  {
    id: "sentiment-actions",
    label: "Actions",
    href: `${MOBILE_APP_BASE}/sentiment/actions`,
    venueScoped: true,
    from: "sentiment",
  },
  {
    id: "directory",
    label: "Directory",
    href: `${MOBILE_APP_BASE}/directory`,
    venueScoped: true,
    from: "welcome",
  },
  {
    id: "directory-celebrations",
    label: "Celebrations",
    href: `${MOBILE_APP_BASE}/directory/celebrations`,
    venueScoped: true,
    from: "directory",
  },
  {
    id: "directory-hierarchy",
    label: "Hierarchy",
    href: `${MOBILE_APP_BASE}/directory/hierarchy`,
    venueScoped: true,
    from: "directory",
  },
  {
    id: "hiring",
    label: "Hiring Forms",
    href: `${MOBILE_APP_BASE}/hiring`,
    venueScoped: true,
    from: "welcome",
  },
  {
    id: "hiring-calendar",
    label: "Calendar",
    href: `${MOBILE_APP_BASE}/hiring/calendar`,
    venueScoped: true,
    from: "hiring",
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

const MOBILE_PATH_WITHOUT_VENUE = new Set(["login", "select-venue"]);

/** Venue slug from `/m/<slug>/...`. Null on login, venue picker, and `/m`. */
export function venueSlugFromMobilePathname(
  pathname: string,
): string | null {
  if (!isMobileAppPath(pathname)) return null;
  const segment = pathname.split("/").filter(Boolean)[1];
  if (!segment || MOBILE_PATH_WITHOUT_VENUE.has(segment)) return null;
  return segment;
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

export function mobileNotificationSettingsHref(venueSlug: string): string {
  return `${MOBILE_APP_BASE}/${venueSlug}/notifications/settings`;
}

export function mobileNotificationAlertsHref(venueSlug: string): string {
  return `${MOBILE_APP_BASE}/${venueSlug}/notifications/alerts`;
}

export function mobileNotificationArchiveHref(venueSlug: string): string {
  return `${MOBILE_APP_BASE}/${venueSlug}/notifications/archive`;
}

export function mobileProfileHref(venueSlug: string): string {
  return `${MOBILE_APP_BASE}/${venueSlug}/employee-profile`;
}

export function mobileAttendanceHref(venueSlug: string): string {
  return `${MOBILE_APP_BASE}/${venueSlug}/attendance`;
}

export function mobileLeaveHref(venueSlug: string): string {
  return `${MOBILE_APP_BASE}/${venueSlug}/leave`;
}

export function mobileRevenueHref(venueSlug: string): string {
  return `${MOBILE_APP_BASE}/${venueSlug}/revenue`;
}

export function mobileSentimentHref(venueSlug: string): string {
  return `${MOBILE_APP_BASE}/${venueSlug}/sentiment`;
}

export function mobileDirectoryHref(venueSlug: string): string {
  return `${MOBILE_APP_BASE}/${venueSlug}/directory`;
}

export function mobileHiringHref(venueSlug: string): string {
  return `${MOBILE_APP_BASE}/${venueSlug}/hiring`;
}

export function mobileHiringCalendarHref(venueSlug: string): string {
  return `${MOBILE_APP_BASE}/${venueSlug}/hiring/calendar`;
}

export function mobileDirectoryCelebrationsHref(venueSlug: string): string {
  return `${MOBILE_APP_BASE}/${venueSlug}/directory/celebrations`;
}

export function mobileTermsHref(venueSlug: string): string {
  return `${MOBILE_APP_BASE}/${venueSlug}/terms`;
}

/** Same-origin `/m/...` path only. Resolves `.` / `..` so it cannot leave `/m`. */
export function safeMobileAppPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("://")) {
    return null;
  }
  if (trimmed.includes("\\")) return null;
  try {
    const resolved = new URL(trimmed, "http://ss.invalid");
    if (resolved.origin !== "http://ss.invalid") return null;
    const pathname = resolved.pathname;
    if (!isMobileAppPath(pathname)) return null;
    return `${pathname}${resolved.search}`;
  } catch {
    return null;
  }
}
