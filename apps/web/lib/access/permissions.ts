import { redirect } from "next/navigation";
import { isAppAdmin, type UserPermission } from "@/lib/role-permissions";
import { createClient } from "@/lib/supabase/server";
import { scopedPath } from "@/lib/venue/active-venue";

export async function requireAppAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: permissions } = await supabase
    .from("user_permissions")
    .select("*")
    .eq("user_id", user.id);

  const perms = (permissions ?? []) as UserPermission[];
  if (!isAppAdmin(perms)) {
    redirect(await scopedPath("/dashboard"));
  }

  return { supabase, user, permissions: perms };
}
