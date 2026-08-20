"use client";

import { useEffect } from "react";
import { pingOnlineSession } from "@/lib/actions/access-log";

const HEARTBEAT_MS = 60 * 1000;

/**
 * Keeps the current user's online session alive while the tab is visible.
 * Idle gaps (no ping for 5 minutes) close the previous session.
 */
export function OnlinePresence() {
  useEffect(() => {
    let cancelled = false;

    const ping = () => {
      if (cancelled) return;
      if (document.visibilityState === "hidden") return;
      void pingOnlineSession();
    };

    ping();
    const interval = window.setInterval(ping, HEARTBEAT_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") ping();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return null;
}
