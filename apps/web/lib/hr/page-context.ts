import { redirect } from "next/navigation";
import { getRenderClient, getRenderUser, getRenderVenue } from "@/lib/auth/render-user";

/**
 * Shared server-side context loader for Human Resources pages: resolves the
 * authenticated user, active venue, and their permission rows. Redirects to
 * login / venue picker when prerequisites are missing.
 */
export async function getHrPageContext() {
  const supabase = await getRenderClient();
  const user = await getRenderUser();
  if (!user) redirect("/login");

  const venue = await getRenderVenue();
  if (!venue) redirect("/select-venue");

  const { data: permissions } = await supabase
    .from("user_permissions")
    .select("*")
    .eq("user_id", user.id);

  return { supabase, user, venue, permissions: permissions ?? [] };
}
