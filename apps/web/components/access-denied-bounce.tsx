"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { usePageAccess } from "@/components/providers/page-access-provider";
import { useVenueScope } from "@/components/providers/venue-scope-provider";
import { toScopedHref } from "@/lib/venue/scope-routing";

/**
 * Safety net for typed URLs / bookmarks: send the user back to a page they
 * can open and show the access popup, instead of leaving them on an empty page.
 */
export function AccessDeniedBounce() {
  const router = useRouter();
  const { notifyAccessDenied, canOpenHref } = usePageAccess();
  const { scope, slug } = useVenueScope();
  const bounced = useRef(false);

  useEffect(() => {
    if (bounced.current) return;
    bounced.current = true;
    notifyAccessDenied();
    const fallback = canOpenHref("/dashboard")
      ? "/dashboard"
      : canOpenHref("/hr")
        ? "/hr"
        : "/modules";
    router.replace(toScopedHref(fallback, scope, slug));
  }, [canOpenHref, notifyAccessDenied, router, scope, slug]);

  return null;
}
