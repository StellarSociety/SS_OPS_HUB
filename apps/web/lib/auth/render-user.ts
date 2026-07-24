import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { resolveActiveVenue } from "@/lib/venue/active-venue";
import type { Venue } from "@/lib/types/database";

/**
 * Render-path auth + data helpers.
 *
 * These exist to keep navigation fast. They:
 *  1. Resolve the signed-in user from the session JWT using LOCAL verification
 *     (`getClaims`) instead of a network round-trip to the Supabase auth server
 *     (`getUser`). With asymmetric signing keys the JWT is verified in-process
 *     against a cached JWKS, so there is no per-render auth API call.
 *  2. Are wrapped in React `cache()` so the shared server client, the user, and
 *     the active venue are resolved AT MOST ONCE per request — deduping the work
 *     that the app layout and the page underneath it would otherwise each do.
 *
 * IMPORTANT: use these on the read/render path only (layouts, pages, read
 * helpers). For mutations / server actions keep using `supabase.auth.getUser()`,
 * which revalidates the session against the auth server.
 */

export type RenderUser = {
  id: string;
  email: string | null;
  user_metadata: Record<string, unknown>;
};

/** One Supabase server client per request (deduped across layout + page). */
export const getRenderClient = cache(async () => createClient());

/**
 * The authenticated user for the current request, or `null` when there is no
 * valid session. Verified locally from the JWT — no auth-server round-trip.
 */
export const getRenderUser = cache(async (): Promise<RenderUser | null> => {
  const supabase = await getRenderClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) {
    return null;
  }
  return {
    id: claims.sub,
    email: claims.email ?? null,
    user_metadata: (claims.user_metadata as Record<string, unknown> | undefined) ?? {},
  };
});

/** The active venue for the current request (deduped across layout + page). */
export const getRenderVenue = cache(async (): Promise<Venue | null> => {
  const supabase = await getRenderClient();
  return resolveActiveVenue(supabase);
});
