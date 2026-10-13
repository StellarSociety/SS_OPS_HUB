import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeVenueSoundDefaults, type VenueSoundDefaults } from "./sounds";

/** The venue's default alert sounds, or null when none are set (or the table is missing). */
export async function loadVenueSoundDefaults(
  service: SupabaseClient,
  venueId: string,
): Promise<VenueSoundDefaults | null> {
  const { data, error } = await service
    .from("connect_venue_settings")
    .select("sound_defaults")
    .eq("venue_id", venueId)
    .maybeSingle();
  if (error || !data) return null;
  return normalizeVenueSoundDefaults(data.sound_defaults);
}
