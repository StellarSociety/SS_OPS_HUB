"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { writeAuditLog } from "@/lib/audit";
import { ACTIVE_SCOPE_COOKIE, ACTIVE_VENUE_COOKIE } from "@/lib/constants";
import { canAccessGlobal } from "@/lib/role-permissions";
import { createClient } from "@/lib/supabase/server";
import { GLOBAL_BASE, venueBase } from "@/lib/venue/scope-routing";

export async function selectVenue(venueSlug: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: venue, error } = await supabase
    .from("venues")
    .select("*")
    .eq("slug", venueSlug)
    .single();

  if (error || !venue) {
    return { error: "Venue not found." };
  }

  if (venue.is_global) {
    const { data: permissions } = await supabase
      .from("user_permissions")
      .select("*")
      .eq("user_id", user.id);

    if (!canAccessGlobal(permissions ?? [])) {
      return { error: "You do not have access to the Global view." };
    }
  }

  const cookieStore = await cookies();
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  };
  // Remembered defaults for bare/entry URLs — not the source of truth for the
  // active venue, which is derived per-request from the scoped URL.
  cookieStore.set(ACTIVE_VENUE_COOKIE, venue.slug, cookieOptions);
  cookieStore.set(
    ACTIVE_SCOPE_COOKIE,
    venue.is_global ? "global" : "venue",
    cookieOptions,
  );

  await writeAuditLog({
    actor_id: user.id,
    action: "select",
    module_key: "app",
    entity: "venue",
    entity_id: venue.id,
    venue_id: venue.id,
    after: { slug: venue.slug },
  });

  redirect(venue.is_global ? GLOBAL_BASE : `${venueBase(venue.slug)}/dashboard`);
}

export async function clearVenueSelection() {
  const cookieStore = await cookies();
  cookieStore.delete(ACTIVE_VENUE_COOKIE);
  cookieStore.delete(ACTIVE_SCOPE_COOKIE);
  redirect("/select-venue");
}
