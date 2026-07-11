import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ModuleGridItem } from "@/components/modules/modules-overview";
import { canAccessModule } from "@/lib/module-access";
import { ACTIVE_VENUE_COOKIE } from "@/lib/constants";
import {
  getModuleOverviewByCategory,
  getModulesByCategory,
  isModuleEnabledForVenue,
  type ModuleCategoryKey,
  type ModuleOverviewItem,
} from "@/lib/modules-registry";
import { isAppAdmin } from "@/lib/role-permissions";
import type { UserPermission } from "@/lib/role-permissions";
import { createClient } from "@/lib/supabase/server";
import type { Venue } from "@/lib/types/database";

type VenueModuleRow = {
  module_key: string;
  enabled: boolean;
};

export function buildModuleGridItems(
  modules: ModuleOverviewItem[],
  venueModuleRows: VenueModuleRow[],
  permissions: UserPermission[],
  venueId: string,
  admin: boolean,
): ModuleGridItem[] {
  return modules.map((mod) => {
    const venueEnabled = isModuleEnabledForVenue(venueModuleRows, mod.key);
    const hasAccess = admin || canAccessModule(permissions, mod.key, venueId);
    return {
      key: mod.key,
      label: mod.label,
      iconKey: mod.iconKey,
      category: mod.category,
      href: mod.href,
      status: mod.status,
      description: mod.description,
      clickable:
        mod.status === "live" &&
        Boolean(mod.href) &&
        venueEnabled &&
        hasAccess,
    };
  });
}

export async function loadModulesHubContext() {
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

  const [{ data: permissions }, { data: venueModules }] = await Promise.all([
    supabase.from("user_permissions").select("*").eq("user_id", user.id),
    supabase.from("venue_modules").select("*").eq("venue_id", venue.id),
  ]);

  const perms = (permissions ?? []) as UserPermission[];
  const admin = isAppAdmin(perms);
  const venueModuleRows = venueModules ?? [];

  const toGridItems = (modules: ModuleOverviewItem[]) =>
    buildModuleGridItems(modules, venueModuleRows, perms, venue.id, admin);

  return {
    venue: venue as Venue,
    sections: getModuleOverviewByCategory().map(({ category, modules }) => ({
      category,
      modules: toGridItems(modules),
    })),
    getCategoryModules: (category: ModuleCategoryKey) =>
      toGridItems(getModulesByCategory(category)),
  };
}
