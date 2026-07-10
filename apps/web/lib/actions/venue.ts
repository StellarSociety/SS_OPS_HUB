"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { writeAuditLog } from "@/lib/audit";
import { ACTIVE_VENUE_COOKIE } from "@/lib/constants";
import { canAccessGlobal } from "@/lib/role-permissions";
import { createClient } from "@/lib/supabase/server";

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
  cookieStore.set(ACTIVE_VENUE_COOKIE, venue.slug, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  await writeAuditLog({
    actor_id: user.id,
    action: "select",
    module_key: "app",
    entity: "venue",
    entity_id: venue.id,
    venue_id: venue.id,
    after: { slug: venue.slug },
  });

  redirect(`/dashboard?venue=${venue.slug}`);
}

export async function clearVenueSelection() {
  const cookieStore = await cookies();
  cookieStore.delete(ACTIVE_VENUE_COOKIE);
  redirect("/select-venue");
}
