"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { reportMobileAppInstall } from "@/lib/actions/mobile-installs";
import { venueSlugFromMobilePathname } from "@/lib/mobile/app-path";
import {
  PWA_APP_VERSION,
  PWA_DEVICE_ID_KEY,
  PWA_SW_CACHE_PREFIX,
} from "@/lib/pwa/constants";
import { detectPWADeviceFromWindow } from "@/lib/pwa/device";
import { isMobileInstallUuid } from "@/lib/mobile/installs";
import { readStandaloneFromWindow } from "@/lib/pwa/standalone";

const PING_GAP_MS = 2 * 60 * 1000;

function readOrCreateDeviceId(): string | null {
  try {
    const existing = window.localStorage.getItem(PWA_DEVICE_ID_KEY)?.trim() ?? "";
    if (isMobileInstallUuid(existing)) return existing;
    const created = window.crypto.randomUUID();
    window.localStorage.setItem(PWA_DEVICE_ID_KEY, created);
    return created;
  } catch {
    return null;
  }
}

async function readSwCacheName(): Promise<string | null> {
  if (typeof caches === "undefined") return null;
  try {
    const keys = await caches.keys();
    return (
      keys.find((key) => key.startsWith(PWA_SW_CACHE_PREFIX)) ??
      keys[0] ??
      null
    );
  } catch {
    return null;
  }
}

/**
 * Silent heartbeat while the staff PWA (`/m/...`) is open.
 * Reports version, platform, and Home Screen vs browser.
 */
export function MobileAppInstallReporter() {
  const pathname = usePathname();
  const lastPingAt = useRef(0);
  const inFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let timer = 0;

    async function ping(force: boolean) {
      if (cancelled || inFlight.current) return;
      const now = Date.now();
      if (!force && now - lastPingAt.current < PING_GAP_MS) return;
      const deviceId = readOrCreateDeviceId();
      if (!deviceId) return;

      inFlight.current = true;
      try {
        const device = detectPWADeviceFromWindow();
        const result = await reportMobileAppInstall({
          deviceId,
          venueSlug: venueSlugFromMobilePathname(pathname),
          platform: device.kind,
          standalone: readStandaloneFromWindow(),
          appVersion: PWA_APP_VERSION,
          swCache: await readSwCacheName(),
          userAgent: window.navigator.userAgent,
        });
        if (cancelled) return;
        if (result.ok) {
          lastPingAt.current = Date.now();
          return;
        }
        console.warn("[mobile-install]", result.error);
      } catch (error) {
        if (!cancelled) {
          console.warn("[mobile-install] report failed:", error);
        }
      } finally {
        inFlight.current = false;
      }
    }

    timer = window.setTimeout(() => {
      void ping(true);
    }, 400);

    function onVisible() {
      if (document.visibilityState === "visible") void ping(false);
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pathname]);

  return null;
}
