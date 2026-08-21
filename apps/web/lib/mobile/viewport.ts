import type { Viewport } from "next";

/**
 * Mobile app pages lock pinch / double-tap zoom (native-app feel).
 * Do not enable page zoom unless David explicitly asks for it.
 * iOS input-focus zoom is separately prevented by 16px form controls.
 */
export const MOBILE_APP_VIEWPORT: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};
