import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACTIVE_VENUE_COOKIE } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";

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

  const cookieStore = await cookies();
  const slug = cookieStore.get(ACTIVE_VENUE_COOKIE)?.value;
  if (!slug) redirect("/select-venue");

  const { data: venue } = await supabase
    .from("venues")
    .select("*")
    .eq("slug", slug)
    .single();
  if (!venue) redirect("/select-venue");

  const { data: permissions } = await supabase
    .from("user_permissions")
    .select("*")
    .eq("user_id", user.id);

  return { supabase, venue, permissions: permissions ?? [] };
}
