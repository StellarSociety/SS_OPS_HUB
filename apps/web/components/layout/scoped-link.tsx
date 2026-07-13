"use client";

import Link from "next/link";
import { forwardRef } from "react";
import { useVenueScope } from "@/components/providers/venue-scope-provider";
import { toScopedHref } from "@/lib/venue/scope-routing";

type LinkProps = React.ComponentPropsWithoutRef<typeof Link>;

/**
 * Drop-in replacement for `next/link` that prefixes string hrefs with the
 * active venue/global scope, so every navigation stays inside the current
 * tab's scope. Unscoped/auth paths and already-scoped hrefs pass through.
 */
export const ScopedLink = forwardRef<HTMLAnchorElement, LinkProps>(
  function ScopedLink({ href, ...props }, ref) {
    const { scope, slug } = useVenueScope();
    const scopedHref =
      typeof href === "string" ? toScopedHref(href, scope, slug) : href;
    return <Link ref={ref} href={scopedHref} {...props} />;
  },
);
