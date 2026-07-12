"use server";

import { revalidatePath } from "next/cache";
import { requireAppAdmin } from "@/lib/access/permissions";
import { writeAuditLog } from "@/lib/audit";
import {
  moduleOverviewRegistry,
  type AppModuleState,
} from "@/lib/modules-registry";
import { createServiceClient } from "@/lib/supabase/service";

const VALID_STATES: AppModuleState[] = [
  "live",
  "coming_soon",
  "visible_locked",
  "hidden",
];

export type AppModuleStateItem = {
  key: string;
  label: string;
  category: string;
  state: AppModuleState;
};

/** Load every hub module with its effective state for the admin panel. */
export async function fetchAppModuleStates(): Promise<AppModuleStateItem[]> {
  await requireAppAdmin();
  const service = createServiceClient();

  const { data } = await service
    .from("app_module_states")
    .select("module_key, state");

  const stateByKey = new Map<string, AppModuleState>();
  for (const row of data ?? []) {
    stateByKey.set(row.module_key, row.state as AppModuleState);
  }

  return moduleOverviewRegistry.map((mod) => ({
    key: mod.key,
    label: mod.label,
    category: mod.category,
    state: stateByKey.get(mod.key) ?? mod.status,
  }));
}

export async function setAppModuleState(
  moduleKey: string,
  state: AppModuleState,
) {
  const { user: actor } = await requireAppAdmin();

  const validModule = moduleOverviewRegistry.some((m) => m.key === moduleKey);
  if (!validModule) {
    return { error: "Invalid app." };
  }
  if (!VALID_STATES.includes(state)) {
    return { error: "Invalid state." };
  }

  const service = createServiceClient();

  const { data: before } = await service
    .from("app_module_states")
    .select("*")
    .eq("module_key", moduleKey)
    .maybeSingle();

  const { error } = await service.from("app_module_states").upsert(
    {
      module_key: moduleKey,
      state,
      updated_at: new Date().toISOString(),
      updated_by: actor.id,
    },
    { onConflict: "module_key" },
  );

  if (error) {
    return { error: error.message };
  }

  await writeAuditLog({
    actor_id: actor.id,
    action: before ? "update" : "create",
    module_key: "app",
    entity: "app_module_states",
    entity_id: moduleKey,
    venue_id: null,
    before: before ?? null,
    after: { module_key: moduleKey, state },
  });

  revalidatePath("/global/settings/apps");
  revalidatePath("/modules");
  revalidatePath("/modules/operational");
  revalidatePath("/modules/revenue");
  revalidatePath("/modules/people");
  revalidatePath("/modules/management");

  return { success: "App state saved." };
}
