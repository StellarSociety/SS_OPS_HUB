import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  MobileUsageEvent,
  MobileUsageEventType,
  MobileUsagePlatform,
} from "./usage";
import { isMobileUsageEventType, isMobileUsagePlatform } from "./usage";

export type MobileUsageInsertInput = {
  venueId: string | null;
  eventType: MobileUsageEventType;
  pageKey: string;
  path: string;
  platform: MobileUsagePlatform | null;
};

export async function insertMobileAppUsageEvent(
  supabase: SupabaseClient,
  userId: string,
  input: MobileUsageInsertInput,
): Promise<{ error?: string }> {
  const { error } = await supabase.from("mobile_app_usage_events").insert({
    user_id: userId,
    venue_id: input.venueId,
    event_type: input.eventType,
    page_key: input.pageKey.slice(0, 80),
    path: input.path.slice(0, 240),
    platform: input.platform,
  });
  if (error) return { error: error.message };
  return {};
}

type UsageDbRow = {
  user_id: string;
  event_type: string;
  page_key: string;
  platform: string | null;
  occurred_at: string;
};

export async function listMobileAppUsageEvents(
  supabase: SupabaseClient,
  input: {
    venueId: string;
    start: string;
    endExclusive: string;
  },
): Promise<MobileUsageEvent[]> {
  const { data, error } = await supabase
    .from("mobile_app_usage_events")
    .select("user_id, event_type, page_key, platform, occurred_at")
    .eq("venue_id", input.venueId)
    .gte("occurred_at", input.start)
    .lt("occurred_at", input.endExclusive)
    .order("occurred_at", { ascending: true })
    .limit(20000);
  if (error) throw error;

  return ((data ?? []) as UsageDbRow[])
    .filter((row) => isMobileUsageEventType(row.event_type))
    .map((row) => ({
      userId: row.user_id,
      eventType: row.event_type as MobileUsageEvent["eventType"],
      pageKey: row.page_key,
      platform:
        row.platform && isMobileUsagePlatform(row.platform)
          ? row.platform
          : null,
      occurredAt: row.occurred_at,
    }));
}
