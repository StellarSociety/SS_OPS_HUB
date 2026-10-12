"use client";

import { useEffect } from "react";

/**
 * Brings `#post-<id>` into view when a feed opens from a notification link.
 * The phone feed scrolls inside its own container and is often reached by a
 * client-side route change, where the browser's own anchor jump doesn't run.
 */
export function ScrollToPost() {
  useEffect(() => {
    const scrollToHash = () => {
      const id = window.location.hash.slice(1);
      if (!id.startsWith("post-")) return;
      document.getElementById(id)?.scrollIntoView({ block: "start" });
    };
    scrollToHash();
    // Images above the post can shift it while they load; correct once more.
    const retry = window.setTimeout(scrollToHash, 400);
    window.addEventListener("hashchange", scrollToHash);
    return () => {
      window.clearTimeout(retry);
      window.removeEventListener("hashchange", scrollToHash);
    };
  }, []);

  return null;
}
