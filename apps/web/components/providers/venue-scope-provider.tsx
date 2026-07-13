"use client";

import { createContext, useContext, useMemo } from "react";
import { usePathname } from "next/navigation";
import {
  toRelativePathname,
  toScopedHref,
  type VenueScope,
} from "@/lib/venue/scope-routing";

type VenueScopeValue = {
  scope: VenueScope;
  /** Venue slug for venue scope; null for global. */
  slug: string | null;
  /** Public URL base for this scope (e.g. `/venue/orilla` or `/global`). */
  base: string;
};

const VenueScopeContext = createContext<VenueScopeValue | null>(null);

export function VenueScopeProvider({
  scope,
  slug,
  base,
  children,
}: VenueScopeValue & { children: React.ReactNode }) {
  const value = useMemo(
    () => ({ scope, slug, base }),
    [scope, slug, base],
  );
  return (
    <VenueScopeContext.Provider value={value}>
      {children}
    </VenueScopeContext.Provider>
  );
}

export function useVenueScope(): VenueScopeValue {
  return (
    useContext(VenueScopeContext) ?? { scope: "venue", slug: null, base: "" }
  );
}

/** Prefix an app-relative href with the current venue/global scope. */
export function useScopedHref(href: string): string {
  const { scope, slug } = useVenueScope();
  return toScopedHref(href, scope, slug);
}

/**
 * The current pathname converted back to its canonical, scope-relative form,
 * so existing nav configs and active-state matching keep working unchanged.
 */
export function useRelativePathname(): string {
  const { scope, slug } = useVenueScope();
  const pathname = usePathname();
  return toRelativePathname(pathname ?? "/", scope, slug);
}
