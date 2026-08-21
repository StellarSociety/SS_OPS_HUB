import type { MetadataRoute } from "next";
import {
  PWA_APP_NAME,
  PWA_BACKGROUND_COLOR,
  PWA_ICON_192,
  PWA_ICON_512,
  PWA_ICON_MASKABLE,
  PWA_INSTALL_URL,
  PWA_MANIFEST_PATH,
  PWA_SCOPE,
  PWA_START_URL,
  PWA_THEME_COLOR,
} from "@/lib/pwa/constants";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: PWA_START_URL,
    name: PWA_APP_NAME,
    short_name: PWA_APP_NAME,
    description:
      "Internal operations hub for Stellar Society venues. Install SS OPS HUB for Home Screen access.",
    start_url: PWA_START_URL,
    scope: PWA_SCOPE,
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "portrait-primary",
    background_color: PWA_BACKGROUND_COLOR,
    theme_color: PWA_THEME_COLOR,
    lang: "en",
    dir: "ltr",
    prefer_related_applications: false,
    related_applications: [
      {
        platform: "webapp",
        url: `${new URL(PWA_MANIFEST_PATH, PWA_INSTALL_URL).origin}${PWA_MANIFEST_PATH}`,
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
