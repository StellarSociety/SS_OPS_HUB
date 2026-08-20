"use server";

import { listAccessEvents } from "@/lib/access/store";
import { isAppAdmin } from "@/lib/role-permissions";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { AccessEventRow } from "@/lib/access/types";

/**
 * Records a lightweight access event for the current user. Called from the
 * client when the user enters a live module (throttled client-side). Fails
 * silently — logging must never block navigation.
 */
export async function recordModuleAccess(moduleKey: string, path: string) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from("access_events").insert({
      user_id: user.id,
      module_key: moduleKey,
      path,
      event_type: "module_access",
    });
  } catch {
    // ignore — table may not be migrated yet, or transient failure
  }
}

/**
 * Heartbeat for the current user's open online session. Continues the session
 * if they were seen recently, otherwise closes it as idle and starts a new one.
 */
export async function pingOnlineSession() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.rpc("ping_online_session");
  } catch {
    // ignore — table/RPC may not be migrated yet
  }
}

/** Own logs, or another user's logs when the caller is an app admin. */
export async function loadUserAccessLogs(userId: string): Promise<{
  events?: AccessEventRow[];
  error?: string;
}> {
  const id = userId.trim();
  if (!id) return { error: "Invalid user." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  if (user.id !== id) {
    const { data: permissions } = await supabase
      .from("user_permissions")
      .select("*")
      .eq("user_id", user.id);
    if (!isAppAdmin(permissions ?? [])) {
      return { error: "You do not have permission to view these logs." };
    }
  }

  const events = await listAccessEvents(createServiceClient(), id, 50);
  return { events };
}
