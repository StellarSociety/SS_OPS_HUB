"use client";

import { useEffect } from "react";
import { recordModuleAccess } from "@/lib/actions/access-log";
import { useRelativePathname } from "@/components/providers/venue-scope-provider";
import { getModuleSidebarForPath } from "@/lib/module-sidebar";

const THROTTLE_MS = 30 * 60 * 1000; // once per module per 30 minutes

/** Records module access events as the user navigates between live apps. */
export function AccessLogger() {
  const pathname = useRelativePathname();

  useEffect(() => {
    const def = getModuleSidebarForPath(pathname);
    if (!def) return;

    const storageKey = `ss-access-${def.moduleKey}`;
    try {
      const last = sessionStorage.getItem(storageKey);
      const now = Date.now();
      if (last && now - Number(last) < THROTTLE_MS) return;
      sessionStorage.setItem(storageKey, String(now));
    } catch {
      // sessionStorage unavailable — still record
    }

    void recordModuleAccess(def.moduleKey, pathname);
  }, [pathname]);

  return null;
}
