import { redirect } from "next/navigation";
import {
  getRenderClient,
  getRenderUser,
  getRenderVenue,
} from "@/lib/auth/render-user";
import {
  hasFeatureAccess,
  hasPermission,
  isAppAdmin,
  type AccessLevel,
  type UserPermission,
} from "@/lib/role-permissions";
import { COS_MODULE_KEY } from "@/lib/sales/cos-types";

export async function getCosPageContext() {
  const supabase = await getRenderClient();
  const user = await getRenderUser();
  if (!user) redirect("/login");

  const venue = await getRenderVenue();
  if (!venue) redirect("/select-venue");

  const { data: permissions } = await supabase
    .from("user_permissions")
    .select("*")
    .eq("user_id", user.id);

  return { supabase, venue, permissions: (permissions ?? []) as UserPermission[], user };
}

function matchesVenueScope(
  permissionVenueId: string | null,
  venueId: string,
): boolean {
  return permissionVenueId === null || permissionVenueId === venueId;
}

export function canViewCos(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  if (isAppAdmin(permissions)) return true;
  return permissions.some(
    (p) =>
      p.module_key === COS_MODULE_KEY &&
      p.feature_key === "margins" &&
      matchesVenueScope(p.venue_id, venueId) &&
      hasFeatureAccess([p], COS_MODULE_KEY, "margins"),
  );
}

export function canEditCos(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  if (isAppAdmin(permissions)) return true;
  return permissions.some(
    (p) =>
      p.module_key === COS_MODULE_KEY &&
      p.feature_key === "margins" &&
      matchesVenueScope(p.venue_id, venueId) &&
      hasPermission([p], COS_MODULE_KEY, "margins", "edit" as AccessLevel),
  );
}

export function canEditCosSettings(
  permissions: UserPermission[],
  venueId: string,
): boolean {
  if (isAppAdmin(permissions)) return true;
  return permissions.some(
    (p) =>
      p.module_key === COS_MODULE_KEY &&
      p.feature_key === "settings" &&
      matchesVenueScope(p.venue_id, venueId) &&
      hasPermission([p], COS_MODULE_KEY, "settings", "edit" as AccessLevel),
  );
}
