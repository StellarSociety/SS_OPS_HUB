"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { reportMobileAppUsage } from "@/lib/actions/mobile-usage";
import { venueSlugFromMobilePathname } from "@/lib/mobile/app-path";
import { mobileUsagePageFromPathname } from "@/lib/mobile/usage";
import { detectPWADeviceFromWindow } from "@/lib/pwa/device";

const DEDUPE_MS = 8_000;
let lastLogged = { path: "", at: 0 };

/**
 * Records one screen view per navigation in the staff PWA (`/m/...`).
 */
export function MobileAppUsageReporter() {
  const pathname = usePathname();

  useEffect(() => {
    const page = mobileUsagePageFromPathname(pathname);
    if (!page) return;

    const timer = window.setTimeout(() => {
      const now = Date.now();
      if (lastLogged.path === pathname && now - lastLogged.at < DEDUPE_MS) {
        return;
      }
      lastLogged = { path: pathname, at: now };
      void reportMobileAppUsage({
        eventType: "view",
        path: pathname,
        venueSlug: venueSlugFromMobilePathname(pathname),
        platform: detectPWADeviceFromWindow().kind,
      });
    }, 400);

    return () => window.clearTimeout(timer);
  }, [pathname]);

  return null;
}
