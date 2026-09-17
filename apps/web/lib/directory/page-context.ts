import { getRenderClient, getRenderUser, getRenderVenue } from "@/lib/auth/render-user";
import { loadDirectoryStaff } from "./store";
import type { UserPermission } from "@/lib/role-permissions";
import type { Venue } from "@/lib/types/database";
import { redirect } from "next/navigation";

export async function getDirectoryPage() {
  const supabase = await getRenderClient();
  const user = await getRenderUser();
  if (!user) redirect("/login");

  const venue = await getRenderVenue();
  if (!venue) redirect("/select-venue");

  const { data: permissions } = await supabase
    .from("user_permissions")
    .select("*")
    .eq("user_id", user.id);

  const staff = await loadDirectoryStaff(supabase, venue as Venue);

  return {
    venue: venue as Venue,
    permissions: (permissions ?? []) as UserPermission[],
    user,
    staff,
    supabase,
  };
}
