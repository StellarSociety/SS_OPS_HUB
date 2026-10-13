import "server-only";

import { cookies } from "next/headers";
import { MOBILE_APP_BASE, mobileWelcomeHref } from "@/lib/mobile/app-path";
import { phoneVenueIds } from "@/lib/mobile/phone-access";
import { createServiceClient } from "@/lib/supabase/service";

/** The venue last opened in the phone app (slug), so it can open straight there. */
export const MOBILE_LAST_VENUE_COOKIE = "ss-mobile-venue";

/**
 * Where a signed-in phone user lands when opening the app: the venue they
 * last chose (if they still have phone access there), else their only phone
 * venue, else the venue picker.
 */
export async function mobileHomeHref(userId: string): Promise<string> {
  const venueIds = await phoneVenueIds(userId);
  if (venueIds.size === 0) return `${MOBILE_APP_BASE}/select-venue`;

  const { data } = await createServiceClient()
    .from("venues")
    .select("id, slug, is_global")
    .in("id", [...venueIds]);
  const venues = (data ?? []).filter((venue) => !venue.is_global);

  const last = (await cookies()).get(MOBILE_LAST_VENUE_COOKIE)?.value;
  const remembered = venues.find((venue) => venue.slug === last);
  if (remembered) return mobileWelcomeHref(String(remembered.slug));
  if (venues.length === 1) return mobileWelcomeHref(String(venues[0]!.slug));
  return `${MOBILE_APP_BASE}/select-venue`;
}

/** Remember the chosen venue for next time (server actions / route handlers only). */
export async function rememberMobileVenue(slug: string) {
  (await cookies()).set(MOBILE_LAST_VENUE_COOKIE, slug, {
    path: MOBILE_APP_BASE,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
  });
}
