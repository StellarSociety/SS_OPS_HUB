"use client";

import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";

const COMPACT_RE = /\/(login|select-venue|welcome)\/?$/;
const PARCHMENT_RE = /\/select-venue\/?$/;
const LOGIN_RE = /\/login\/?$/;

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

  return null;
}
