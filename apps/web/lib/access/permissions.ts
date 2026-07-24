import { redirect } from "next/navigation";
import { isAppAdmin, type UserPermission } from "@/lib/role-permissions";
import { getRenderClient, getRenderUser } from "@/lib/auth/render-user";
import { scopedPath } from "@/lib/venue/active-venue";

export async function requireAppAdmin() {
  const supabase = await getRenderClient();
  const user = await getRenderUser();
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
