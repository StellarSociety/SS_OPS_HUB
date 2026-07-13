import { redirect } from "next/navigation";
import type { ModuleGridItem } from "@/components/modules/modules-overview";
import { canAccessModule } from "@/lib/module-access";
import { resolveActiveVenue } from "@/lib/venue/active-venue";
import {
  fetchAppModuleStateMap,
  resolveModuleState,
} from "@/lib/app-module-states";
import {
  getModuleOverviewByCategory,
  getModulesByCategory,
  isModuleEnabledForVenue,
  type AppModuleState,
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

/**
 * In global context the Apps Hub becomes a per-app settings launcher: each live
 * app tile links to that app's settings landing page instead of the app itself.
 */
const MODULE_SETTINGS_ROUTES: Record<string, string> = {
  sales: "/sales/settings",
  hr: "/hr/settings",
};

/** Standalone "Global Settings" tile shown at the bottom of the global Apps Hub. */
export const GLOBAL_SETTINGS_TILE: ModuleGridItem = {
  key: "global_settings",
  label: "Global Settings",
  iconKey: "settings",
  category: "management",
  href: "/global/settings",
  status: "live",
  description:
    "Cross-venue configuration — branding, defaults, and organisation-wide options.",
  clickable: true,
};

export function buildModuleGridItems(
  modules: ModuleOverviewItem[],
  venueModuleRows: VenueModuleRow[],
  permissions: UserPermission[],
  venueId: string,
  admin: boolean,
  appStateMap: Map<string, AppModuleState>,
  isGlobal = false,
): ModuleGridItem[] {
  return modules
    .map((mod) => {
      const state = resolveModuleState(mod.status, appStateMap.get(mod.key));
      const venueEnabled = isModuleEnabledForVenue(venueModuleRows, mod.key);
      const hasAccess = admin || canAccessModule(permissions, mod.key, venueId);
      const settingsHref = MODULE_SETTINGS_ROUTES[mod.key];
      const href = isGlobal ? settingsHref : mod.href;
      const openableIfPermitted =
        state === "live" && Boolean(href) && (isGlobal || venueEnabled);
      return {
        key: mod.key,
        label: mod.label,
        iconKey: mod.iconKey,
        category: mod.category,
        href,
        status: state,
        description: mod.description,
        clickable: openableIfPermitted && hasAccess,
        // Live + enabled app the user simply isn't permitted to open.
        blockedReason: (openableIfPermitted && !hasAccess
          ? "access"
          : null) as "access" | null,
      };
    })
    .filter((item) => item.status !== "hidden");
}

export async function loadModulesHubContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const venue = await resolveActiveVenue(supabase);
  if (!venue) redirect("/select-venue");

  const [{ data: permissions }, { data: venueModules }, appStateMap] =
    await Promise.all([
      supabase.from("user_permissions").select("*").eq("user_id", user.id),
      supabase.from("venue_modules").select("*").eq("venue_id", venue.id),
      fetchAppModuleStateMap(supabase),
    ]);

  const perms = (permissions ?? []) as UserPermission[];
  const admin = isAppAdmin(perms);
  const venueModuleRows = venueModules ?? [];
  const isGlobal = Boolean((venue as Venue).is_global);

  const toGridItems = (modules: ModuleOverviewItem[], asSettings = false) =>
    buildModuleGridItems(
      modules,
      venueModuleRows,
      perms,
      venue.id,
      admin,
      appStateMap,
      asSettings,
    );

  return {
    venue: venue as Venue,
    isGlobal,
    sections: getModuleOverviewByCategory().map(({ category, modules }) => ({
      category,
      modules: toGridItems(modules),
    })),
    // In global context, tiles link to each app's settings landing page.
    settingsSections: getModuleOverviewByCategory().map(
      ({ category, modules }) => ({
        category,
        modules: toGridItems(modules, true),
      }),
    ),
    // Extra tile appended to the bottom of the global Apps Hub (admins only).
    globalSettingsTile: admin ? GLOBAL_SETTINGS_TILE : null,
    getCategoryModules: (category: ModuleCategoryKey) =>
      toGridItems(getModulesByCategory(category)),
  };
}
