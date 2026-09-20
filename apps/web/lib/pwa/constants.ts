import { DEFAULT_APP_NAME } from "@/lib/group/branding";
import { joinAppUrl, publicAppUrl } from "@/lib/public-app-url";

/** Same default as Global Settings → App name. */
export const PWA_APP_NAME = DEFAULT_APP_NAME;

export const PWA_START_PATH = "/m";
/** In-scope start URL. `/m` without a trailing slash sits outside scope `/m/`. */
export const PWA_START_URL = "/m/";
export const PWA_SCOPE = "/m/";

/** Mac / Windows / laptop Add to Dock should open the hub, not `/m/`. */
export const PWA_DESKTOP_START_URL = "/";
export const PWA_DESKTOP_SCOPE = "/";

export const PWA_INSTALL_PATH = "/install";
export const PWA_REINSTALL_PATH = "/install?reinstall=1";
export const PWA_INSTALL_URL = joinAppUrl("/install", publicAppUrl());
export const PWA_REINSTALL_URL = joinAppUrl(PWA_REINSTALL_PATH, publicAppUrl());

export const PWA_THEME_COLOR = "#818a40";
export const PWA_BACKGROUND_COLOR = "#E9E3D6";

export const PWA_SW_PATH = "/sw.js";
export const PWA_MANIFEST_PATH = "/manifest.webmanifest";
export const PWA_DESKTOP_MANIFEST_PATH = "/manifest-desktop.webmanifest";

/**
 * Newest first. Keep in lockstep with `CACHE_NAME` in `public/sw.js`
 * (`ss-ops-hub-pwa-v{N}`): prepend a row when you bump the service worker.
 * Users Device shows the current build plus the previous 6.
 */
export type PwaAppRelease = {
  version: string;
  releasedAt: string;
  notes: string;
};

export const PWA_APP_RELEASES: PwaAppRelease[] = [
  {
    version: "11",
    releasedAt: "2026-09-18T02:31:38+04:00",
    notes: "Home Screen app with device notifications, org chart, and revenue.",
  },
  {
    version: "10",
    releasedAt: "2026-08-27T00:58:50+04:00",
    notes: "Production app URL for the Home Screen install.",
  },
  {
    version: "9",
    releasedAt: "2026-08-24T19:05:17+04:00",
    notes: "Staff Attendance shortcut and profile tabs on the phone app.",
  },
  {
    version: "8",
    releasedAt: "2026-08-22T03:42:15+04:00",
    notes: "Group branding, app icon, and Home Screen name.",
  },
  {
    version: "7",
    releasedAt: "2026-08-22T01:10:00+04:00",
    notes: "Install shell polish for Add to Home Screen.",
  },
  {
    version: "6",
    releasedAt: "2026-08-21T20:15:00+04:00",
    notes: "Home Screen icons and favicon.",
  },
  {
    version: "5",
    releasedAt: "2026-08-21T14:30:00+04:00",
    notes: "Install page with iOS and Android Home Screen steps.",
  },
  {
    version: "1",
    releasedAt: "2026-08-21T08:24:34+04:00",
    notes: "First installable Home Screen app and /install page.",
  },
];

export const PWA_APP_VERSION = PWA_APP_RELEASES[0]?.version ?? "1";
export const PWA_APP_RELEASED_AT =
  PWA_APP_RELEASES[0]?.releasedAt ?? "2026-08-21T08:24:34+04:00";
export const PWA_APP_RELEASE_NOTES =
  PWA_APP_RELEASES[0]?.notes ?? "Home Screen app.";
export const PWA_SW_CACHE_PREFIX = "ss-ops-hub-pwa-";
export const PWA_SW_CACHE_NAME = `${PWA_SW_CACHE_PREFIX}v${PWA_APP_VERSION}`;
export const PWA_DEVICE_ID_KEY = "ss-ops-mobile-device-id";

export function pwaAppVersionLabel(version: string = PWA_APP_VERSION): string {
  const trimmed = version.trim();
  if (!trimmed) return "V";
  return /^v/i.test(trimmed) ? `V${trimmed.slice(1)}` : `V${trimmed}`;
}

export function pwaPreviousAppReleases(
  releases: PwaAppRelease[] = PWA_APP_RELEASES,
  limit: number = 6,
): PwaAppRelease[] {
  return releases.slice(1, 1 + Math.max(0, limit));
}

export const PWA_ICON_192 = "/icons/icon-192.png";
export const PWA_ICON_512 = "/icons/icon-512.png";
export const PWA_ICON_MASKABLE = "/icons/icon-512-maskable.png";
export const PWA_APPLE_TOUCH_ICON = "/apple-touch-icon.png";
export const PWA_LOGO_SRC = "/brand/ss-ops-hub-app-icon.webp";
export const PWA_INSTALL_QR_SRC = "/icons/install-qr.svg?v=2";

export const PWA_BANNER_DISMISS_KEY = "ss-ops-pwa-banner-dismissed";
export const PWA_RETURN_PATH_KEY = "ss-ops-pwa-return-path";
/** Hide the in-app install banner for 30 days after dismiss. Not proof of install. */
export const PWA_BANNER_DISMISS_MS = 30 * 24 * 60 * 60 * 1000;
