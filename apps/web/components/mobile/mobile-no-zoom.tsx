"use client";

import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";
import { mobileAppFrameHeight } from "@/lib/mobile/frame-height";
import { readStandaloneFromWindow } from "@/lib/pwa/standalone";

const COMPACT_RE = /\/(login|select-venue|welcome)\/?$/;
const PARCHMENT_RE = /\/select-venue\/?$/;
const LOGIN_RE = /\/login\/?$/;

function syncMobileAppHeight() {
  const vv = window.visualViewport;
  const height = mobileAppFrameHeight({
    innerHeight: window.innerHeight,
    clientHeight: document.documentElement.clientHeight,
    visualViewportHeight: vv?.height,
    visualViewportOffsetTop: vv?.offsetTop,
    screenHeight: window.screen?.height,
    outerHeight: window.outerHeight,
    standalone: readStandaloneFromWindow(window),
  });
  const px = `${height}px`;
  const root = document.documentElement;
  root.style.setProperty("--mobile-app-height", px);
  root.style.height = px;
  document.body.style.height = px;

  // On-screen keyboard: the frame keeps its full height, so pad the shell by
  // the part the keyboard covers. Inputs (like the chat box) then sit above it.
  const visible = vv ? Math.round(vv.height + vv.offsetTop) : height;
  const covered = isEditable(document.activeElement) ? height - visible : 0;
  root.style.setProperty("--mobile-keyboard-inset", `${covered > 120 ? covered : 0}px`);
}

function isEditable(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) {
    return !["button", "checkbox", "radio", "range", "submit", "file", "color"].includes(el.type);
  }
  return (el as HTMLElement).isContentEditable === true;
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
    // Focus changes too: the keyboard opens / closes with them.
    const onFocusChange = () => window.setTimeout(syncMobileAppHeight, 50);
    window.addEventListener("resize", syncMobileAppHeight);
    vv?.addEventListener("resize", syncMobileAppHeight);
    vv?.addEventListener("scroll", syncMobileAppHeight);
    document.addEventListener("focusin", onFocusChange);
    document.addEventListener("focusout", onFocusChange);
    return () => {
      window.removeEventListener("resize", syncMobileAppHeight);
      vv?.removeEventListener("resize", syncMobileAppHeight);
      vv?.removeEventListener("scroll", syncMobileAppHeight);
      document.removeEventListener("focusin", onFocusChange);
      document.removeEventListener("focusout", onFocusChange);
      document.documentElement.style.removeProperty("--mobile-keyboard-inset");
      document.documentElement.style.removeProperty("--mobile-app-height");
      document.documentElement.style.removeProperty("height");
      document.body.style.removeProperty("height");
    };
  }, []);

  return null;
}
