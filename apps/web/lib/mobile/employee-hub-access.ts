import type { SupabaseClient } from "@supabase/supabase-js";
import {
  employeeHubLevelFromState,
  type AccessMatrixLevel,
} from "@/lib/access/matrix";
import { defaultModuleConfig } from "@/lib/access/roles";
import { MOBILE_APP_MODULE_KEY } from "@/lib/mobile/types";
import { MOBILE_EMPLOYEE_HUB_MODULE_KEY } from "@/lib/modules-catalog";

function pickRow<T extends { module_key: string; venue_id: string | null }>(
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

export async function loadEmployeeHubLevel(
  supabase: SupabaseClient,
  userId: string,
  venueId: string,
): Promise<AccessMatrixLevel> {
  const full = await supabase
    .from("user_module_access")
    .select("module_key, venue_id, enabled, hidden, role, suspended")
    .eq("user_id", userId)
    .in("module_key", [MOBILE_APP_MODULE_KEY, MOBILE_EMPLOYEE_HUB_MODULE_KEY]);

  const rows = full.error
    ? ((
        await supabase
          .from("user_module_access")
          .select("module_key, venue_id, enabled, role, suspended")
          .eq("user_id", userId)
          .in("module_key", [MOBILE_APP_MODULE_KEY, MOBILE_EMPLOYEE_HUB_MODULE_KEY])
      ).data ?? [])
    : (full.data ?? []);

  const toConfig = (moduleKey: string) => {
    const row = pickRow(rows, moduleKey, venueId);
    const base = defaultModuleConfig(moduleKey, row?.venue_id ?? null);
    if (!row) return base;
    return {
      ...base,
      enabled: row.enabled,
      hidden: Boolean("hidden" in row ? row.hidden : false),
      suspended: row.suspended,
      role:
        row.role === "editor" || row.role === "app_admin" || row.role === "viewer"
          ? row.role
          : "viewer",
      venueId: row.venue_id,
    };
  };

  return employeeHubLevelFromState([
    toConfig(MOBILE_APP_MODULE_KEY),
    toConfig(MOBILE_EMPLOYEE_HUB_MODULE_KEY),
  ]);
}

export function employeeHubIsOpen(level: AccessMatrixLevel): boolean {
  return level === "viewer" || level === "editor";
}
