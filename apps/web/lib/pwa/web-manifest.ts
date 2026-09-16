import type { MetadataRoute } from "next";
import {
  PWA_APP_NAME,
  PWA_BACKGROUND_COLOR,
  PWA_DESKTOP_MANIFEST_PATH,
  PWA_DESKTOP_SCOPE,
  PWA_DESKTOP_START_URL,
  PWA_ICON_192,
  PWA_ICON_512,
  PWA_ICON_MASKABLE,
  PWA_INSTALL_URL,
  PWA_MANIFEST_PATH,
  PWA_SCOPE,
  PWA_START_URL,
  PWA_THEME_COLOR,
} from "@/lib/pwa/constants";
import type { PwaInstallSurface } from "@/lib/pwa/install-surface";

export function buildPwaWebManifest(
  surface: PwaInstallSurface,
  appName: string,
): MetadataRoute.Manifest {
  const name = appName || PWA_APP_NAME;
  const mobile = surface === "mobile";
  const manifestPath = mobile ? PWA_MANIFEST_PATH : PWA_DESKTOP_MANIFEST_PATH;
  const origin = new URL(manifestPath, PWA_INSTALL_URL).origin;

  return {
    id: mobile ? PWA_START_URL : PWA_DESKTOP_START_URL,
    name,
    short_name: name,
    description: mobile
      ? `Internal operations hub for Stellar Society venues. Install ${name} for Home Screen access.`
      : `Internal operations hub for Stellar Society venues.`,
    start_url: mobile ? PWA_START_URL : PWA_DESKTOP_START_URL,
    scope: mobile ? PWA_SCOPE : PWA_DESKTOP_SCOPE,
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    ...(mobile ? { orientation: "portrait-primary" as const } : {}),
    background_color: PWA_BACKGROUND_COLOR,
    theme_color: PWA_THEME_COLOR,
    lang: "en",
    dir: "ltr",
    prefer_related_applications: false,
    related_applications: [
      {
        platform: "webapp",
        url: `${origin}${manifestPath}`,
      },
    ],
    icons: [
      {
        src: PWA_ICON_192,
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: PWA_ICON_512,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: PWA_ICON_MASKABLE,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
