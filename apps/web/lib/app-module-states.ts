import "server-only";

import { redirect } from "next/navigation";
import {
  getOverviewModuleByKey,
  type AppModuleState,
  type ModuleStatus,
} from "@/lib/modules-registry";
import { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Load every stored app state as a map. Falls back to an empty map (registry
 * defaults are used) if the table does not exist yet.
 */
export async function fetchAppModuleStateMap(
  supabase: SupabaseServerClient,
): Promise<Map<string, AppModuleState>> {
  const map = new Map<string, AppModuleState>();
  const { data, error } = await supabase
    .from("app_module_states")
    .select("module_key, state");

  if (error || !data) return map;

  for (const row of data) {
    map.set(row.module_key, row.state as AppModuleState);
  }
  return map;
}

/** Effective state: stored override wins, otherwise the registry default. */
export function resolveModuleState(
  defaultStatus: ModuleStatus,
  override: AppModuleState | undefined,
): AppModuleState {
  return override ?? defaultStatus;
}

/** Read the effective state for a single module. */
export async function getAppModuleState(
  moduleKey: string,
): Promise<AppModuleState> {
  const fallback: ModuleStatus =
    getOverviewModuleByKey(moduleKey)?.status ?? "live";

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("app_module_states")
    .select("state")
    .eq("module_key", moduleKey)
    .maybeSingle();

  if (error || !data) return fallback;
  return (data.state as AppModuleState) ?? fallback;
}

/**
 * Route guard: block the access path for any module that is not `live`.
 * Redirects back to the Apps Hub for coming_soon / visible_locked / hidden.
 */
export async function assertModuleAccessible(moduleKey: string): Promise<void> {
  const state = await getAppModuleState(moduleKey);
  if (state !== "live") {
    redirect("/modules");
  }
}
