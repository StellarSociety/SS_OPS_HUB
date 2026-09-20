import type { SupabaseClient } from "@supabase/supabase-js";
import { isAccessBlockDue } from "@/lib/access/access-block";

export async function syncAccessBlockFromTermination(
  supabase: SupabaseClient,
  staffId: string,
) {
  const { data: staff } = await supabase
    .from("staff")
    .select("termination_date")
    .eq("id", staffId)
    .maybeSingle();
  if (!staff) return;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, status, access_block_from_termination")
    .eq("staff_id", staffId)
    .maybeSingle();
  if (!profile) return;
  if (profile.access_block_from_termination === false) return;

  const until = staff.termination_date
    ? String(staff.termination_date).slice(0, 10)
    : null;

  await supabase
    .from("profiles")
    .update({ access_blocked_until: until })
    .eq("id", profile.id);

  if (until && isAccessBlockDue(until) && profile.status !== "disabled") {
    await persistAccessBlock(supabase, profile.id, true);
  }
}

export async function persistAccessBlock(
  supabase: SupabaseClient,
  userId: string,
  blocked: boolean,
) {
  await supabase
    .from("profiles")
    .update({ status: blocked ? "disabled" : "active" })
    .eq("id", userId);

  try {
    await supabase
      .from("user_module_access")
      .update({ suspended: blocked })
      .eq("user_id", userId);
  } catch {
    // table may not be migrated yet
  }

  try {
    await supabase.auth.admin.updateUserById(userId, {
      ban_duration: blocked ? "876000h" : "none",
    });
  } catch {
    // best-effort — app-level status still blocks login
  }
}

export async function persistDueAccessBlock(
  supabase: SupabaseClient,
  userId: string,
  profile: {
    status?: string | null;
    access_blocked_until?: string | null;
  },
) {
  if (profile.status === "disabled") return;
  if (!isAccessBlockDue(profile.access_blocked_until)) return;
  await persistAccessBlock(supabase, userId, true);
}
