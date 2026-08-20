"use client";

import Link from "next/link";
import { forwardRef } from "react";
import {
  guardAppNavigation,
  usePageAccess,
} from "@/components/providers/page-access-provider";
import { useVenueScope } from "@/components/providers/venue-scope-provider";
import { toScopedHref } from "@/lib/venue/scope-routing";

type LinkProps = React.ComponentPropsWithoutRef<typeof Link>;

/**
 * Drop-in replacement for `next/link` that prefixes string hrefs with the
 * active venue/global scope, so every navigation stays inside the current
 * tab's scope. Unscoped/auth paths and already-scoped hrefs pass through.
 *
 * In-app pages the user cannot open are blocked here — a popup stays on the
 * current view instead of loading an empty "no access" page.
 */
export const ScopedLink = forwardRef<HTMLAnchorElement, LinkProps>(
  function ScopedLink({ href, onClick, ...props }, ref) {
    const { scope, slug } = useVenueScope();
    const access = usePageAccess();
    const scopedHref =
      typeof href === "string" ? toScopedHref(href, scope, slug) : href;

    return (
      <Link
        ref={ref}
        href={scopedHref}
        onClick={(event) => {
          if (typeof href === "string") {
            const allowed = guardAppNavigation(access, href, event);
            if (!allowed) return;
          }
          onClick?.(event);
        }}
        {...props}
      />
    );
  },
);
