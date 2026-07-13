import { cookies, headers } from "next/headers";
import { ACTIVE_SCOPE_COOKIE, ACTIVE_VENUE_COOKIE } from "@/lib/constants";
import type { createClient } from "@/lib/supabase/server";
import type { Venue } from "@/lib/types/database";
import {
  GLOBAL_BASE,
  VENUE_SCOPE_HEADER,
  VENUE_SLUG_HEADER,
  type VenueScope,
  toScopedHref,
  venueBase,
} from "@/lib/venue/scope-routing";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type ActiveScope = {
  scope: VenueScope;
  /** Venue slug for venue scope; null for global. */
  slug: string | null;
};

/**
 * Resolve the active scope for the current request from the headers injected by
 * middleware. Falls back to the "last-used" cookies when headers are absent
 * (e.g. a request that bypassed the scoping middleware).
 */
export async function getActiveScope(): Promise<ActiveScope | null> {
  const headerStore = await headers();
  const headerScope = headerStore.get(VENUE_SCOPE_HEADER) as VenueScope | null;

  if (headerScope === "global") {
    return { scope: "global", slug: null };
  }
  if (headerScope === "venue") {
    const slug = headerStore.get(VENUE_SLUG_HEADER);
    if (slug) return { scope: "venue", slug };
  }

  // Fallback to remembered scope (bare/legacy requests).
  const cookieStore = await cookies();
  const cookieScope = cookieStore.get(ACTIVE_SCOPE_COOKIE)?.value;
  if (cookieScope === "global") {
    return { scope: "global", slug: null };
  }
  const slug = cookieStore.get(ACTIVE_VENUE_COOKIE)?.value;
  if (slug) return { scope: "venue", slug };

  return null;
}

/** Public URL base for the active scope (e.g. `/venue/orilla` or `/global`). */
export async function getActiveScopeBase(): Promise<string | null> {
  const active = await getActiveScope();
  if (!active) return null;
  return active.scope === "global" ? GLOBAL_BASE : venueBase(active.slug ?? "");
}

/**
 * Prefix an app-relative path with the active scope for a server-side
 * `redirect()`, so the redirect stays inside the current tab's venue/global
 * context.
 */
export async function scopedPath(path: string): Promise<string> {
  const active = await getActiveScope();
  if (!active) return path;
  return toScopedHref(path, active.scope, active.slug);
}

/**
 * Resolve the active venue row for the current request. In global scope this
 * returns the row flagged `is_global`; in venue scope it looks up by slug.
 */
export async function resolveActiveVenue(
  supabase: SupabaseServerClient,
): Promise<Venue | null> {
  const active = await getActiveScope();
  if (!active) return null;

  if (active.scope === "global") {
    const { data } = await supabase
      .from("venues")
      .select("*")
      .eq("is_global", true)
      .single();
    return (data as Venue) ?? null;
  }

  const { data } = await supabase
    .from("venues")
    .select("*")
    .eq("slug", active.slug)
    .single();
  return (data as Venue) ?? null;
}
