import { canAccessMobileApp } from "@/lib/mobile/permissions";
import { createClient } from "@/lib/supabase/server";

export async function requireMobileAppVenueAccess(venueId: string): Promise<{
  userId: string;
  venueId: string;
} | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: venue }, { data: permissions }] = await Promise.all([
    supabase.from("venues").select("id").eq("id", venueId).maybeSingle(),
    supabase.from("user_permissions").select("*").eq("user_id", user.id),
  ]);

  if (!venue?.id || !canAccessMobileApp(permissions ?? [], venue.id)) {
    return null;
  }

  return { userId: user.id, venueId: venue.id };
}
