"use client";

import { useLayoutEffect } from "react";

/** Document-level no-zoom for real mobile-app routes (not the device preview). */
export function MobileNoZoom() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.add("mobile-app-no-zoom");
    return () => root.classList.remove("mobile-app-no-zoom");
  }, []);
  return null;
}
