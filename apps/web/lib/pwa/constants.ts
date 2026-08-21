export const PWA_APP_NAME = "SS OPS HUB";

export const PWA_START_PATH = "/m";
/** In-scope start URL. `/m` without a trailing slash sits outside scope `/m/`. */
export const PWA_START_URL = "/m/";
export const PWA_SCOPE = "/m/";

export const PWA_INSTALL_PATH = "/install";
export const PWA_INSTALL_URL = "https://ssopshub.vercel.app/install";

export const PWA_THEME_COLOR = "#818a40";
export const PWA_BACKGROUND_COLOR = "#E9E3D6";

export const PWA_SW_PATH = "/sw.js";
export const PWA_MANIFEST_PATH = "/manifest.webmanifest";

export const PWA_ICON_192 = "/icons/icon-192.png";
export const PWA_ICON_512 = "/icons/icon-512.png";
export const PWA_ICON_MASKABLE = "/icons/icon-512-maskable.png";
export const PWA_APPLE_TOUCH_ICON = "/apple-touch-icon.png";
export const PWA_LOGO_SRC = "/icons/logo.svg";
export const PWA_INSTALL_QR_SRC = "/icons/install-qr.svg";

export const PWA_BANNER_DISMISS_KEY = "ss-ops-pwa-banner-dismissed";
export const PWA_RETURN_PATH_KEY = "ss-ops-pwa-return-path";
/** Hide the in-app install banner for 30 days after dismiss. Not proof of install. */
export const PWA_BANNER_DISMISS_MS = 30 * 24 * 60 * 60 * 1000;
