"use client";

import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";

const COMPACT_RE = /\/(login|select-venue|welcome)\/?$/;
const PARCHMENT_RE = /\/select-venue\/?$/;
const LOGIN_RE = /\/login\/?$/;

function syncMobileAppHeight() {
  const vv = window.visualViewport;
  const height = Math.max(window.innerHeight, vv?.height ?? 0);
  document.documentElement.style.setProperty(
    "--mobile-app-height",
    `${Math.round(height)}px`,
  );
}

/** Document-level no-zoom for real mobile-app routes (not the device preview). */
export function MobileNoZoom() {
  const pathname = usePathname();

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.add("mobile-app-no-zoom");
    root.classList.toggle("mobile-app-compact", COMPACT_RE.test(pathname));
    root.classList.toggle("mobile-app-parchment", PARCHMENT_RE.test(pathname));
    root.classList.toggle("mobile-app-login", LOGIN_RE.test(pathname));
    return () => {
      root.classList.remove(
        "mobile-app-no-zoom",
        "mobile-app-compact",
        "mobile-app-parchment",
        "mobile-app-login",
      );
    };
  }, [pathname]);

  useLayoutEffect(() => {
    syncMobileAppHeight();
    const vv = window.visualViewport;
    window.addEventListener("resize", syncMobileAppHeight);
    vv?.addEventListener("resize", syncMobileAppHeight);
    vv?.addEventListener("scroll", syncMobileAppHeight);
    return () => {
      window.removeEventListener("resize", syncMobileAppHeight);
      vv?.removeEventListener("resize", syncMobileAppHeight);
      vv?.removeEventListener("scroll", syncMobileAppHeight);
      document.documentElement.style.removeProperty("--mobile-app-height");
    };
  }, []);

  return null;
}
