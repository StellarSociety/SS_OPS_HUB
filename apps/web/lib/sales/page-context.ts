import { redirect } from "next/navigation";
import { getRenderClient, getRenderUser, getRenderVenue } from "@/lib/auth/render-user";

export async function getSalesPageContext() {
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
