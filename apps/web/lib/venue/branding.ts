const VENUE_WORDMARKS: Record<string, string> = {
  orilla: "/venues/orilla-wordmark.svg",
};

const VENUE_ICONS: Record<string, string> = {
  orilla: "/venues/orilla-mark.svg",
};

const VENUE_BADGES: Record<string, string> = {
  orilla: "/venues/orilla-badge.svg",
};

export { ORILLA_OLIVE, ORILLA_CREAM } from "@/lib/venue/orilla-brand";

export const ORILLA_ICON_URL = VENUE_ICONS.orilla;
export const ORILLA_BADGE_URL = VENUE_BADGES.orilla;

export function getVenueWordmarkUrl(slug: string): string | null {
  return VENUE_WORDMARKS[slug] ?? null;
}

/** Standalone O mark — vector SVG. */
export function getVenueIconUrl(venue: {
  slug: string;
  logo_url: string | null;
}): string | null {
  return VENUE_ICONS[venue.slug] ?? venue.logo_url;
}

/** Circle badge / favicon — vector SVG. */
export function getVenueBadgeUrl(venue: {
  slug: string;
  logo_url: string | null;
}): string | null {
  return VENUE_BADGES[venue.slug] ?? venue.logo_url;
}

export function hasVectorBrandAssets(slug: string): boolean {
  return slug in VENUE_ICONS;
}
