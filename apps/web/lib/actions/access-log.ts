"use server";

import { createClient } from "@/lib/supabase/server";

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
