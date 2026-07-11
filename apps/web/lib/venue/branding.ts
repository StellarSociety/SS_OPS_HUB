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

export type VenueBrandAssetSource = {
  slug: string;
  logo_url?: string | null;
  icon_url?: string | null;
  favicon_url?: string | null;
};

export const BRANDING_STORAGE_MARKER = "/storage/v1/object/public/venue-branding/";

export function isStorageBrandAssetUrl(url: string | null | undefined): boolean {
  return Boolean(url?.includes(BRANDING_STORAGE_MARKER));
}

export function storagePathFromBrandAssetUrl(
  url: string | null | undefined,
): string | null {
  if (!url) return null;
  const index = url.indexOf(BRANDING_STORAGE_MARKER);
  if (index === -1) return null;
  const path = url.slice(index + BRANDING_STORAGE_MARKER.length).split("?")[0];
  return path ? decodeURIComponent(path) : null;
}

export function getDefaultBrandAssetUrl(
  slug: string,
  asset: "logo" | "icon" | "favicon",
): string | null {
  if (asset === "logo") return getVenueWordmarkUrl(slug);
  if (asset === "icon") return VENUE_ICONS[slug] ?? null;
  return VENUE_BADGES[slug] ?? null;
}

export function getVenueWordmarkUrl(slug: string): string | null {
  return VENUE_WORDMARKS[slug] ?? null;
}

/** Full venue logo / wordmark for headers and exports. */
export function getVenueLogoUrl(venue: VenueBrandAssetSource): string | null {
  if (isStorageBrandAssetUrl(venue.logo_url)) return venue.logo_url ?? null;
  return getVenueWordmarkUrl(venue.slug) ?? venue.logo_url ?? null;
}

/** Standalone mark / app icon. */
export function getVenueIconUrl(venue: VenueBrandAssetSource): string | null {
  if (isStorageBrandAssetUrl(venue.icon_url)) return venue.icon_url ?? null;
  return VENUE_ICONS[venue.slug] ?? null;
}

/** Circle badge / favicon. */
export function getVenueBadgeUrl(venue: VenueBrandAssetSource): string | null {
  if (isStorageBrandAssetUrl(venue.favicon_url)) return venue.favicon_url ?? null;
  return VENUE_BADGES[venue.slug] ?? null;
}

export function hasVectorBrandAssets(slug: string): boolean {
  return slug in VENUE_ICONS;
}

export function hasUploadedBrandAssets(venue: VenueBrandAssetSource): boolean {
  return Boolean(venue.logo_url || venue.icon_url || venue.favicon_url);
}

export function hasVenueBrandAssets(venue: VenueBrandAssetSource): boolean {
  return hasUploadedBrandAssets(venue) || hasVectorBrandAssets(venue.slug);
}

export function venueUsesCustomBrandAsset(
  venue: VenueBrandAssetSource,
  asset: "logo" | "icon" | "favicon",
): boolean {
  const column =
    asset === "logo" ? "logo_url" : asset === "icon" ? "icon_url" : "favicon_url";
  return isStorageBrandAssetUrl(venue[column]);
}

/** True when the database has a stored override that Clear can remove. */
export function hasClearableBrandAsset(
  venue: VenueBrandAssetSource,
  asset: "logo" | "icon" | "favicon",
): boolean {
  const column =
    asset === "logo" ? "logo_url" : asset === "icon" ? "icon_url" : "favicon_url";
  return Boolean(venue[column]);
}
