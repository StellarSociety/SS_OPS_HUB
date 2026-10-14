import { redirect } from "next/navigation";
import type { ModuleGridItem } from "@/components/modules/modules-overview";
import { canAccessModule } from "@/lib/module-access";
import { canAccessConnect } from "@/lib/connect/permissions";
import { CONNECT_MODULE_KEY } from "@/lib/connect/types";
import {
  fetchAppModuleStateMap,
  resolveModuleState,
} from "@/lib/app-module-states";
import {
  getModuleOverviewByCategory,
  getModulesByCategory,
  hubModuleSortIndex,
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
import { loadPhoneAccess, PHONE_HUB_KEY } from "@/lib/mobile/phone-access";
import { PHONE_SHORTCUTS, type WelcomeShortcut } from "@/lib/mobile/shortcuts";
import type { createServiceClient } from "@/lib/supabase/service";
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
  team_connect: "/connect/settings",
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
  appStateMap: Map<string, AppModuleState>,
  isGlobal = false,
  hiddenModuleKeys: ReadonlySet<string> = new Set(),
): ModuleGridItem[] {
  return modules
    .map((mod) => {
      const state = resolveModuleState(mod.status, appStateMap.get(mod.key));
      const venueEnabled = isModuleEnabledForVenue(venueModuleRows, mod.key);
      // The app's own toggle decides — admins included.
      const hasAccess =
        mod.key === CONNECT_MODULE_KEY
          ? canAccessConnect(permissions, venueId)
          : canAccessModule(permissions, mod.key, venueId);
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

/** Apps whose icon shows an unread-notification count. */
const BADGED_MODULE_KEYS = [CONNECT_MODULE_KEY] as const;

/** Unread, unarchived notifications per badged app for this user at the venue. */
async function loadAppBadgeCounts(
  supabase: Awaited<ReturnType<typeof getRenderClient>>,
  userId: string,
  venueId: string,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const { data, error } = await supabase
    .from("notifications")
    .select("module_key")
    .eq("user_id", userId)
    .eq("venue_id", venueId)
    .in("module_key", [...BADGED_MODULE_KEYS])
    .is("read_at", null)
    .is("archived_at", null)
    .limit(1000);
  if (error) return counts;
  for (const row of data ?? []) {
    const key = row.module_key as string;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

type HubClient =
  | Awaited<ReturnType<typeof getRenderClient>>
  | ReturnType<typeof createServiceClient>;

/**
 * Everything that decides which apps a given user sees at a venue: their
 * permissions, per-app access rows (hidden / no access), and app states.
 * Shared by the real hub and the mobile simulator's "preview as employee".
 */
export async function loadHubAccessForUser(
  supabase: HubClient,
  userId: string,
  venue: Venue,
) {
  const [
    { data: permissions },
    { data: venueModules },
    appStateMap,
    { data: profile },
    accessResult,
  ] = await Promise.all([
    supabase.from("user_permissions").select("*").eq("user_id", userId),
    supabase.from("venue_modules").select("*").eq("venue_id", venue.id),
    fetchAppModuleStateMap(supabase),
    supabase.from("profiles").select("full_name").eq("id", userId).single(),
    supabase
      .from("user_module_access")
      .select("module_key, venue_id, enabled, hidden, role, suspended")
      .eq("user_id", userId),
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
          .eq("user_id", userId)
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
  return {
    permissions: perms,
    admin: isAppAdmin(perms),
    venueModuleRows: (venueModules ?? []) as VenueModuleRow[],
    appStateMap,
    userName: (profile?.full_name as string | null)?.trim() || null,
    hiddenModuleKeys,
    employeeHubLevel,
    badgeCounts: await loadAppBadgeCounts(supabase, userId, venue.id),
  };
}

/**
 * The mobile welcome screen's app list for a user, as their phone shows it.
 * Access comes from the Mobile App Access switches, not web grants.
 */
export async function loadMobileWelcomeModulesForUser(
  supabase: HubClient,
  userId: string,
  venue: Venue,
) {
  const [access, phone] = await Promise.all([
    loadHubAccessForUser(supabase, userId, venue),
    loadPhoneAccess(userId, venue.id),
  ]);
  const hiddenOnPhone = new Set(
    Object.entries(phone.levels)
      .filter(([, level]) => level === "hidden")
      .map(([key]) => key),
  );
  const modules = getModuleOverviewByCategory()
    .flatMap(({ modules }) =>
      buildModuleGridItems(
        modules,
        access.venueModuleRows,
        phone.permissions,
        venue.id,
        access.appStateMap,
      ),
    )
    .filter((mod) => mod.key !== MOBILE_APP_MODULE_KEY)
    .filter((mod) => !hiddenOnPhone.has(mod.key))
    // Apps not switched on for them (live or coming soon) go in "Hidden".
    .map((item) => {
      const level = phone.levels[item.key];
      const granted = level === "viewer" || level === "editor";
      return granted
        ? item
        : { ...item, clickable: false, blockedReason: "access" as const };
    })
    .map((item) =>
      item.clickable && access.badgeCounts.get(item.key)
        ? { ...item, badgeCount: access.badgeCounts.get(item.key) }
        : item,
    )
    .sort((a, b) => hubModuleSortIndex(a.key) - hubModuleSortIndex(b.key));
  const employeeHubLevel: AccessMatrixLevel = phone.canUseApp
    ? (phone.levels[PHONE_HUB_KEY] ?? "none")
    : "none";
  const shortcuts: WelcomeShortcut[] = PHONE_SHORTCUTS.map((shortcut) => ({
    ...shortcut,
    level: phone.shortcuts[shortcut.key] ?? "none",
  })).filter((shortcut) => shortcut.level !== "hidden");
  return {
    modules,
    shortcuts,
    /** Level per shortcut key, venue visibility applied. */
    shortcutLevels: phone.shortcuts,
    userName: access.userName,
    employeeHubLevel,
    /** Phone-only permissions (for Hiring Forms and other phone checks). */
    permissions: phone.permissions,
    canUseApp: phone.canUseApp,
    hubPages: phone.hubPages,
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

  const {
    permissions: perms,
    admin,
    venueModuleRows,
    appStateMap,
    userName,
    hiddenModuleKeys,
    employeeHubLevel,
    badgeCounts,
  } = await loadHubAccessForUser(supabase, user.id, venue as Venue);
  const isGlobal = Boolean((venue as Venue).is_global);

  const toGridItems = (modules: ModuleOverviewItem[], asSettings = false) =>
    buildModuleGridItems(
      modules,
      venueModuleRows,
      perms,
      venue.id,
      appStateMap,
      asSettings,
    ).map((item) =>
      !asSettings && item.clickable && badgeCounts.get(item.key)
        ? { ...item, badgeCount: badgeCounts.get(item.key) }
        : item,
    );

  return {
    venue: venue as Venue,
    isGlobal,
    userName,
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
