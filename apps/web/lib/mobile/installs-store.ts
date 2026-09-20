import type { SupabaseClient } from "@supabase/supabase-js";
import type { MobileInstallPlatform } from "./installs";

export type MobileAppInstallUpsertInput = {
  deviceId: string;
  venueId: string | null;
  platform: MobileInstallPlatform;
  standalone: boolean;
  appVersion: string;
  swCache: string | null;
  userAgent: string | null;
};

export async function upsertMobileAppInstall(
  supabase: SupabaseClient,
  userId: string,
  input: MobileAppInstallUpsertInput,
): Promise<{ error?: string }> {
  const { data: existing, error: existingError } = await supabase
    .from("mobile_app_installs")
    .select("installed, venue_id")
    .eq("user_id", userId)
    .eq("device_id", input.deviceId)
    .maybeSingle();

  if (existingError) return { error: existingError.message };

  const now = new Date().toISOString();
  const installed = Boolean(existing?.installed) || input.standalone;
  const venueId = input.venueId ?? existing?.venue_id ?? null;

  const { error } = await supabase.from("mobile_app_installs").upsert(
    {
      user_id: userId,
      device_id: input.deviceId,
      venue_id: venueId,
      platform: input.platform,
      standalone: input.standalone,
      installed,
      app_version: input.appVersion,
      sw_cache: input.swCache,
      user_agent: input.userAgent,
      ...(existing ? {} : { first_seen_at: now }),
      last_seen_at: now,
    },
    { onConflict: "user_id,device_id" },
  );
  if (error) return { error: error.message };
  return {};
}

export type MobileAppInstallDbRow = {
  user_id: string;
  device_id: string;
  venue_id: string | null;
  platform: string;
  standalone: boolean;
  installed: boolean;
  app_version: string;
  sw_cache: string | null;
  user_agent: string | null;
  first_seen_at: string;
  last_seen_at: string;
};

export async function listMobileAppInstallsForUsers(
  supabase: SupabaseClient,
  userIds: string[],
): Promise<MobileAppInstallDbRow[]> {
  if (userIds.length === 0) return [];
  const { data, error } = await supabase
    .from("mobile_app_installs")
    .select(
      "user_id, device_id, venue_id, platform, standalone, installed, app_version, sw_cache, user_agent, first_seen_at, last_seen_at",
    )
    .in("user_id", userIds);
  if (error) throw error;
  return (data ?? []) as MobileAppInstallDbRow[];
}
