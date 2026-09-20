import { redirect } from "next/navigation";
import type { ModuleGridItem } from "@/components/modules/modules-overview";
import { canAccessModule } from "@/lib/module-access";
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
import { getRenderClient, getRenderUser, getRenderVenue } from "@/lib/auth/render-user";
import {
  employeeHubLevelFromState,
  type AccessMatrixLevel,
} from "@/lib/access/matrix";
import { defaultModuleConfig, type ModuleAccessConfig } from "@/lib/access/roles";
import { MOBILE_APP_MODULE_KEY } from "@/lib/mobile/types";
import { MOBILE_EMPLOYEE_HUB_MODULE_KEY } from "@/lib/modules-catalog";
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
  accounting: "/accounting/settings",
  sentiment: "/sentiment/settings",
  guests_intel: "/guests-intel/settings",
  save_log: "/save-log/settings",
  mobile_app: "/mobile/settings",
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
  hiddenModuleKeys: ReadonlySet<string> = new Set(),
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
    .filter((item) => item.status !== "hidden")
    .filter((item) => !hiddenModuleKeys.has(item.key));
}

function pickAccessRow<T extends { module_key: string; venue_id: string | null }>(
  rows: T[],
  moduleKey: string,
  venueId: string,
): T | undefined {
  return (
    rows.find((row) => row.module_key === moduleKey && row.venue_id === venueId) ??
    rows.find((row) => row.module_key === moduleKey && row.venue_id == null) ??
    rows.find((row) => row.module_key === moduleKey)
  );
}

function accessToConfig(
  moduleKey: string,
  row:
    | {
        venue_id: string | null;
        enabled: boolean;
        hidden?: boolean | null;
        role: string;
        suspended: boolean;
      }
    | undefined,
): ModuleAccessConfig {
  const base = defaultModuleConfig(moduleKey, row?.venue_id ?? null);
  if (!row) return base;
  return {
    ...base,
    enabled: row.enabled,
    hidden: Boolean(row.hidden),
    suspended: row.suspended,
    role: (row.role === "editor" || row.role === "app_admin" || row.role === "viewer"
      ? row.role
      : "viewer"),
    venueId: row.venue_id,
  };
}

export async function loadModulesHubContext(options?: {
  venue?: Venue;
  signInHref?: string;
  selectVenueHref?: string;
}) {
  const supabase = await getRenderClient();
  const user = await getRenderUser();
  if (!user) redirect(options?.signInHref ?? "/login");

  const venue = options?.venue ?? (await getRenderVenue());
  if (!venue) redirect(options?.selectVenueHref ?? "/select-venue");

  const [
    { data: permissions },
    { data: venueModules },
    appStateMap,
    { data: profile },
    accessResult,
  ] = await Promise.all([
    supabase.from("user_permissions").select("*").eq("user_id", user.id),
    supabase.from("venue_modules").select("*").eq("venue_id", venue.id),
    fetchAppModuleStateMap(supabase),
    supabase.from("profiles").select("full_name").eq("id", user.id).single(),
    supabase
      .from("user_module_access")
      .select("module_key, venue_id, enabled, hidden, role, suspended")
      .eq("user_id", user.id),
  ]);

  const accessRows: {
    module_key: string;
    venue_id: string | null;
    enabled: boolean;
    role: string;
    suspended: boolean;
    hidden?: boolean | null;
  }[] = accessResult.error
    ? ((
        await supabase
          .from("user_module_access")
          .select("module_key, venue_id, enabled, role, suspended")
          .eq("user_id", user.id)
      ).data ?? [])
    : (accessResult.data ?? []);

  const hiddenModuleKeys = new Set(
    [...new Set(accessRows.map((row) => row.module_key as string))]
      .filter((key) => Boolean(pickAccessRow(accessRows, key, venue.id)?.hidden)),
  );

  const employeeHubLevel: AccessMatrixLevel = employeeHubLevelFromState([
    accessToConfig(
      MOBILE_APP_MODULE_KEY,
      pickAccessRow(accessRows, MOBILE_APP_MODULE_KEY, venue.id),
    ),
    accessToConfig(
      MOBILE_EMPLOYEE_HUB_MODULE_KEY,
      pickAccessRow(accessRows, MOBILE_EMPLOYEE_HUB_MODULE_KEY, venue.id),
    ),
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
    userName: (profile?.full_name as string | null)?.trim() || null,
    hiddenModuleKeys: [...hiddenModuleKeys],
    employeeHubLevel,
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
