"use server";

import { redirect } from "next/navigation";
import { writeAuditLog } from "@/lib/audit";
import { canAccessGlobal } from "@/lib/role-permissions";
import { createClient } from "@/lib/supabase/server";
import { mobileWelcomeHref, MOBILE_APP_BASE } from "@/lib/mobile/app-path";
import { canAccessMobileApp } from "@/lib/mobile/permissions";

export async function selectMobileVenue(venueSlug: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`${MOBILE_APP_BASE}/login`);
  }

  const { data: venue, error } = await supabase
    .from("venues")
    .select("*")
    .eq("slug", venueSlug)
    .single();

  if (error || !venue) {
    return { error: "Venue not found." };
  }

  const { data: permissions } = await supabase
    .from("user_permissions")
    .select("*")
    .eq("user_id", user.id);

  if (venue.is_global && !canAccessGlobal(permissions ?? [])) {
    return { error: "You do not have access to the Global view." };
  }

  if (!canAccessMobileApp(permissions ?? [], venue.id)) {
    return { error: "You do not have access to the mobile app for this venue." };
  }

  await writeAuditLog({
    actor_id: user.id,
    action: "select",
    module_key: "mobile_app",
    entity: "venue",
    entity_id: venue.id,
    venue_id: venue.id,
    after: { slug: venue.slug, runtime: "mobile" },
  });

  redirect(mobileWelcomeHref(venue.slug));
}
