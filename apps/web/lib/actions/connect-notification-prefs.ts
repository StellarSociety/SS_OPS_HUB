"use server";

import { getActionAuthContext } from "@/lib/auth/action-context";
import {
  normalizeAlertPrefs,
  type ConnectAlertPrefs,
} from "@/lib/connect/notification-prefs";
import { canAdminConnect } from "@/lib/connect/permissions";
import {
  normalizeVenueSoundDefaults,
  type VenueSoundDefaults,
} from "@/lib/connect/sounds";
import { createServiceClient } from "@/lib/supabase/service";

/** Saves the signed-in person's Connecteam alert choices. */
export async function saveMyConnectAlertPrefs(
  prefs: ConnectAlertPrefs,
): Promise<{ ok: true; prefs: ConnectAlertPrefs } | { ok: false; error: string }> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { ok: false, error: auth.error };
  const clean = normalizeAlertPrefs(prefs);
  const { error } = await createServiceClient()
    .from("connect_notification_prefs")
    .upsert(
      { user_id: auth.user.id, prefs: clean, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
  if (error) {
    return {
      ok: false,
      error: /connect_notification_prefs/.test(error.message)
        ? "Notification settings aren't set up on the database yet."
        : error.message,
    };
  }
  return { ok: true, prefs: clean };
}

/** Admins: default alert sounds for everyone at the venue. */
export async function saveVenueSoundDefaults(
  input: Omit<VenueSoundDefaults, "updatedAt">,
): Promise<{ ok: true; defaults: VenueSoundDefaults } | { ok: false; error: string }> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { ok: false, error: auth.error };
  if (auth.venue.is_global) return { ok: false, error: "Open a venue first." };
  if (!canAdminConnect(auth.permissions, auth.venue.id)) {
    return { ok: false, error: "Only Connecteam admins can set sounds for everyone." };
  }
  const defaults = normalizeVenueSoundDefaults({ ...input, updatedAt: Date.now() });
  if (!defaults) return { ok: false, error: "Pick a sound." };
  const { error } = await createServiceClient()
    .from("connect_venue_settings")
    .upsert(
      {
        venue_id: auth.venue.id,
        sound_defaults: defaults,
        updated_by: auth.user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "venue_id" },
    );
  if (error) {
    return {
      ok: false,
      error: /connect_venue_settings/.test(error.message)
        ? "Venue sound defaults aren't set up on the database yet."
        : error.message,
    };
  }
  return { ok: true, defaults };
}
