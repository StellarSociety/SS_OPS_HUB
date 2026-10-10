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

  // On-screen keyboard. iOS shrinks the *visual* viewport and also scrolls it
  // (offsetTop) to reveal the focused field, so pin the app to what is
  // actually visible: shift the frame down by the scroll and pad the shell by
  // the keyboard's full height (including the QuickType / accessory bar).
  const keyboard = vv && isEditable(document.activeElement) ? Math.round(height - vv.height) : 0;
  const open = keyboard > 120;
  root.style.setProperty("--mobile-keyboard-inset", `${open ? keyboard : 0}px`);
  root.style.setProperty("--mobile-keyboard-offset", `${open && vv ? Math.round(vv.offsetTop) : 0}px`);
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
      document.documentElement.style.removeProperty("--mobile-keyboard-offset");
      document.documentElement.style.removeProperty("--mobile-app-height");
      document.documentElement.style.removeProperty("height");
      document.body.style.removeProperty("height");
    };
  }, []);

  return null;
}
