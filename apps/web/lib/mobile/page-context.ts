import { redirect } from "next/navigation";
import { getRenderClient, getRenderUser, getRenderVenue } from "@/lib/auth/render-user";
import { MOBILE_APP_BASE } from "@/lib/mobile/app-path";
import type { Venue } from "@/lib/types/database";

/** Context for the webapp Mobile module (device preview inside AppShell). */
export async function getMobilePageContext() {
  const supabase = await getRenderClient();
  const user = await getRenderUser();
  if (!user) redirect("/login");

  const venue = await getRenderVenue();
  if (!venue) redirect("/select-venue");

  const { data: permissions } = await supabase
    .from("user_permissions")
    .select("*")
    .eq("user_id", user.id);

  return { supabase, venue, permissions: permissions ?? [], user };
}

/** Context for the phone app at `/m/<venueSlug>/...`. */
export async function getMobileAppContext(venueSlug: string) {
  const supabase = await getRenderClient();
  const user = await getRenderUser();
  if (!user) redirect(`${MOBILE_APP_BASE}/login`);

  const { data: venue } = await supabase
    .from("venues")
    .select("*")
    .eq("slug", venueSlug)
    .maybeSingle();

  if (!venue) redirect(`${MOBILE_APP_BASE}/select-venue`);

  const { data: permissions } = await supabase
    .from("user_permissions")
    .select("*")
    .eq("user_id", user.id);

  return {
    supabase,
    venue: venue as Venue,
    permissions: permissions ?? [],
    user,
  };
}
