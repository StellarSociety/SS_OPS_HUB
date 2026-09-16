"use client";

import { useEffect } from "react";

/**
 * Phone / iPad local-host surfaces should not show the Next.js "N" badge or
 * error overlay. Those belong on the desktop simulator, not the device URL.
 */
export function HideNextDevOverlay() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;

    const style = document.createElement("style");
    style.setAttribute("data-ss-hide-next-overlay", "");
    style.textContent = "nextjs-portal { display: none !important; }";
    document.head.appendChild(style);
    return () => style.remove();
  }, []);

  return null;
}
