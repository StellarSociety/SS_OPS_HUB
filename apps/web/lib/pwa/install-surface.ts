import {
  PWA_DESKTOP_MANIFEST_PATH,
  PWA_MANIFEST_PATH,
} from "@/lib/pwa/constants";

export type PwaInstallSurface = "mobile" | "desktop";

/**
 * Phones install the staff app (`/m/`). Desks, laptops, and tablets install
 * the hub (`/`). iPadOS 13+ sends a Macintosh UA, which correctly maps here
 * to desktop — the phone app is for a handset, not a large screen.
 */
export function pwaInstallSurfaceFromUserAgent(
  userAgent: string,
): PwaInstallSurface {
  if (/iPhone|iPod/i.test(userAgent)) return "mobile";
  if (/Android/i.test(userAgent) && /Mobile/i.test(userAgent)) return "mobile";
  return "desktop";
}

export function manifestPathForSurface(surface: PwaInstallSurface): string {
  return surface === "desktop"
    ? PWA_DESKTOP_MANIFEST_PATH
    : PWA_MANIFEST_PATH;
}

export function applyPwaManifestLink(href: string): void {
  if (typeof document === "undefined") return;
  const links = [
    ...document.querySelectorAll<HTMLLinkElement>('link[rel="manifest"]'),
  ];
  if (links.length === 0) {
    const link = document.createElement("link");
    link.rel = "manifest";
    link.href = href;
    document.head.appendChild(link);
    return;
  }
  links.forEach((link, index) => {
    if (index === 0) {
      if (link.getAttribute("href") !== href) link.href = href;
      return;
    }
    link.remove();
  });
}
