import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationRecipient } from "./types";

const ACCESS_RANK: Record<string, number> = {
  submit: 1,
  view: 2,
  edit: 3,
  admin: 4,
};

function hasMinLevel(level: string, minLevel: string): boolean {
  return (ACCESS_RANK[level] ?? 0) >= (ACCESS_RANK[minLevel] ?? 0);
}

/**
 * Users with hr/staff view+ at the venue, plus global (venue_id null) grants and app admins.
 */
export async function resolveHrStaffRecipients(
  supabase: SupabaseClient,
  venueId: string,
): Promise<NotificationRecipient[]> {
  const { data: permissions, error: permError } = await supabase
    .from("user_permissions")
    .select("user_id, venue_id, module_key, feature_key, access_level")
    .eq("module_key", "hr")
    .eq("feature_key", "staff");

  if (permError) throw permError;

  const eligibleUserIds = new Set<string>();

  for (const p of permissions ?? []) {
    if (!hasMinLevel(p.access_level, "view")) continue;
    if (p.venue_id === null || p.venue_id === venueId) {
      eligibleUserIds.add(p.user_id);
    }
  }

  const { data: appAdmins, error: adminError } = await supabase
    .from("user_permissions")
    .select("user_id")
    .eq("module_key", "app")
    .in("feature_key", ["global", "admin", "settings"])
    .eq("access_level", "admin");

  if (adminError) throw adminError;

  for (const row of appAdmins ?? []) {
    eligibleUserIds.add(row.user_id);
  }

  if (eligibleUserIds.size === 0) return [];

  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id, email, full_name, status")
    .in("id", [...eligibleUserIds])
    .eq("status", "active");

  if (profileError) throw profileError;

  return (profiles ?? []).map((p) => ({
    userId: p.id,
    email: p.email,
    fullName: p.full_name,
  }));
}
