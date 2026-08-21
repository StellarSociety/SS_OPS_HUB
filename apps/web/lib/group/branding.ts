import { cache } from "react";
import { createServiceClient } from "@/lib/supabase/service";

/** Built-in Stellar Society Group wordmark used on sign-in until a custom file is uploaded. */
export const DEFAULT_GROUP_LOGO_URL =
  "/brand/stellar-society-group-logo.webp?v=3";

/** Built-in SS OPS HUB app icon used on the install page and Home Screen. */
export const DEFAULT_APP_ICON_URL = "/brand/ss-ops-hub-app-icon.webp";

/** Built-in Home Screen / PWA name. Same as Global Settings → App name. */
export const DEFAULT_APP_NAME = "SS Ops HUB";

export const APP_NAME_MAX_LENGTH = 20;

/** Built-in group favicon for sign-in and Global browser tabs. */
export const DEFAULT_GROUP_FAVICON_URL =
  "/brand/stellar-society-group-favicon.webp?v=2";

export const GROUP_LOGO_STORAGE_PATHS = [
  "group/logo.webp",
  "group/logo.png",
  "group/logo.jpg",
  "group/logo.jpeg",
  "group/logo.svg",
] as const;

export const GROUP_APP_ICON_STORAGE_PATHS = [
  "group/app-icon.webp",
  "group/app-icon.png",
  "group/app-icon.jpg",
  "group/app-icon.jpeg",
  "group/app-icon.svg",
] as const;

export const GROUP_FAVICON_STORAGE_PATHS = [
  "group/favicon.webp",
  "group/favicon.png",
  "group/favicon.jpg",
  "group/favicon.jpeg",
  "group/favicon.svg",
  "group/favicon.ico",
] as const;

export type GroupLogoState = {
  /** URL to render (uploaded override or built-in default). */
  logoUrl: string;
  /** Stored override URL, or null when using the built-in default. */
  storedUrl: string | null;
};

export type GroupAppIconState = {
  appIconUrl: string;
  storedAppIconUrl: string | null;
  appName: string;
  storedAppName: string | null;
};

export type GroupFaviconState = {
  faviconUrl: string;
  storedFaviconUrl: string | null;
};

export type GroupBrandingState = GroupLogoState &
  GroupAppIconState &
  GroupFaviconState;

export function resolveGroupLogoUrl(storedUrl: string | null | undefined): string {
  const trimmed = storedUrl?.trim();
  return trimmed || DEFAULT_GROUP_LOGO_URL;
}

export function resolveAppIconUrl(
  storedUrl: string | null | undefined,
): string {
  const trimmed = storedUrl?.trim();
  return trimmed || DEFAULT_APP_ICON_URL;
}

export function resolveGroupFaviconUrl(
  storedUrl: string | null | undefined,
): string {
  const trimmed = storedUrl?.trim();
  return trimmed || DEFAULT_GROUP_FAVICON_URL;
}

export function resolveAppName(storedName: string | null | undefined): string {
  const trimmed = storedName?.trim();
  return trimmed || DEFAULT_APP_NAME;
}

const EMPTY_BRANDING: GroupBrandingState = {
  logoUrl: DEFAULT_GROUP_LOGO_URL,
  storedUrl: null,
  appIconUrl: DEFAULT_APP_ICON_URL,
  storedAppIconUrl: null,
  appName: DEFAULT_APP_NAME,
  storedAppName: null,
  faviconUrl: DEFAULT_GROUP_FAVICON_URL,
  storedFaviconUrl: null,
};

export const fetchGroupBrandingState = cache(async function fetchGroupBrandingState(): Promise<GroupBrandingState> {
  try {
    const service = createServiceClient();
    const { data, error } = await service
      .from("group_branding")
      .select("logo_url, app_icon_url, favicon_url, app_name")
      .eq("id", 1)
      .maybeSingle();

    if (error) {
      console.error("[group_branding] fetch failed:", error.message);
      return EMPTY_BRANDING;
    }

    const storedUrl =
      typeof data?.logo_url === "string" && data.logo_url.trim()
        ? data.logo_url
        : null;
    const storedAppIconUrl =
      typeof data?.app_icon_url === "string" && data.app_icon_url.trim()
        ? data.app_icon_url
        : null;
    const storedFaviconUrl =
      typeof data?.favicon_url === "string" && data.favicon_url.trim()
        ? data.favicon_url
        : null;
    const storedAppName =
      typeof data?.app_name === "string" && data.app_name.trim()
        ? data.app_name.trim()
        : null;

    return {
      logoUrl: resolveGroupLogoUrl(storedUrl),
      storedUrl,
      appIconUrl: resolveAppIconUrl(storedAppIconUrl),
      storedAppIconUrl,
      appName: resolveAppName(storedAppName),
      storedAppName,
      faviconUrl: resolveGroupFaviconUrl(storedFaviconUrl),
      storedFaviconUrl,
    };
  } catch (error) {
    console.error("[group_branding] fetch failed:", error);
    return EMPTY_BRANDING;
  }
});

export async function fetchGroupLogoState(): Promise<GroupLogoState> {
  const { logoUrl, storedUrl } = await fetchGroupBrandingState();
  return { logoUrl, storedUrl };
}
