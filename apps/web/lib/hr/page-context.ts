import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveActiveVenue } from "@/lib/venue/active-venue";

/**
 * Shared server-side context loader for Human Resources pages: resolves the
 * authenticated user, active venue, and their permission rows. Redirects to
 * login / venue picker when prerequisites are missing.
 */
export async function getHrPageContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const venue = await resolveActiveVenue(supabase);
  if (!venue) redirect("/select-venue");

  const { data: permissions } = await supabase
    .from("user_permissions")
    .select("*")
    .eq("user_id", user.id);

  return { supabase, venue, permissions: permissions ?? [] };
}
