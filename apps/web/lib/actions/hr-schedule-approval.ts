"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { writeAuditLog } from "@/lib/audit";
import { listUsers } from "@/lib/access/store";
import {
  canAdminLookups,
  canEditSchedules,
  canAccessSchedules,
} from "@/lib/hr/permissions";
import { getHrVenueSetting } from "@/lib/hr/store";
import {
  DEFAULT_HR_SCHEDULE_APPROVAL_SETTINGS,
  HR_MODULE_KEY,
  HR_SETTINGS_KEYS,
  type HrScheduleApprovalSettings,
  type ScheduleApprovalRequest,
} from "@/lib/hr/types";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveActiveVenue } from "@/lib/venue/active-venue";

export type ScheduleApproverCandidate = {
  id: string;
  fullName: string;
  email: string;
};

async function getAuthContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const venue = await resolveActiveVenue(supabase);
  if (!venue) redirect("/select-venue");

  const { data: permissions } = await supabase
    .from("user_permissions")
    .select("*")
    .eq("user_id", user.id);

  return { supabase, user, venue, permissions: permissions ?? [] };
}

function normalizeWeekStart(weekStart: string): string | null {
  const trimmed = weekStart.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  return trimmed;
}

/** Active hub users with schedules edit+ for the venue (approver pool candidates). */
export async function listScheduleApproverCandidates(): Promise<{
  candidates?: ScheduleApproverCandidate[];
  error?: string;
}> {
  const { supabase, venue, permissions } = await getAuthContext();
  if (!canAdminLookups(permissions, venue.id) && !canAccessSchedules(permissions, venue.id)) {
    return { error: "You do not have permission to list approvers." };
  }

  try {
    const users = await listUsers(supabase);
    const candidates = users
      .filter((u) => {
        if (u.status && u.status !== "active") return false;
        const perms = u.permissions.map((p) => ({
          ...p,
          user_id: u.id,
        }));
        return canEditSchedules(perms, venue.id);
      })
      .map((u) => ({
        id: u.id,
        fullName: u.full_name?.trim() || u.email,
        email: u.email,
      }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));

    return { candidates };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Could not load approvers.",
    };
  }
}

export async function getScheduleApprovalSettings(): Promise<HrScheduleApprovalSettings> {
  const { supabase, venue } = await getAuthContext();
  return getHrVenueSetting(
    supabase,
    venue.id,
    HR_SETTINGS_KEYS.scheduleApproval,
    DEFAULT_HR_SCHEDULE_APPROVAL_SETTINGS,
  );
}

export async function saveScheduleApprovalSettings(formData: FormData): Promise<void> {
  const { user, venue, permissions } = await getAuthContext();
  if (!canAdminLookups(permissions, venue.id)) return;

  const raw = String(formData.get("approver_user_ids") ?? "");
  const approverUserIds = [
    ...new Set(
      raw
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ];

  const value: HrScheduleApprovalSettings = { approverUserIds };
  const service = createServiceClient();
  const { error } = await service.from("hr_venue_settings").upsert(
    {
      venue_id: venue.id,
      key: HR_SETTINGS_KEYS.scheduleApproval,
      value,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "venue_id,key" },
  );
  if (error) {
    console.error("[hr] schedule approval settings save failed:", error.message);
    return;
  }

  await writeAuditLog({
    actor_id: user.id,
    action: "update",
    module_key: HR_MODULE_KEY,
    entity: "hr_venue_settings",
    entity_id: HR_SETTINGS_KEYS.scheduleApproval,
    venue_id: venue.id,
    after: value,
  });

  revalidatePath("/hr/settings", "layout");
  revalidatePath("/hr/schedules");
}

export async function getScheduleApprovalForWeek(weekStart: string): Promise<{
  request?: ScheduleApprovalRequest | null;
  error?: string;
}> {
  const { supabase, venue, permissions } = await getAuthContext();
  if (!canAccessSchedules(permissions, venue.id)) {
    return { error: "You do not have access to schedules." };
  }

  const week = normalizeWeekStart(weekStart);
  if (!week) return { error: "Invalid week start." };

  const { data, error } = await supabase
    .from("hr_schedule_approval_requests")
    .select("*")
    .eq("venue_id", venue.id)
    .eq("week_start", week)
    .in("status", ["pending", "approved"])
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    // Table may not exist yet if migration is pending.
    console.error("[hr] getScheduleApprovalForWeek:", error.message);
    return { request: null, error: error.message };
  }

  return { request: (data as ScheduleApprovalRequest | null) ?? null };
}

export async function requestScheduleApproval(params: {
  weekStart: string;
  approverUserIds: string[];
}): Promise<{ request?: ScheduleApprovalRequest; error?: string }> {
  const { user, venue, permissions } = await getAuthContext();
  if (!canEditSchedules(permissions, venue.id)) {
    return { error: "You do not have permission to request approval." };
  }

  const week = normalizeWeekStart(params.weekStart);
  if (!week) return { error: "Invalid week start." };

  const selected = [
    ...new Set(params.approverUserIds.map((id) => id.trim()).filter(Boolean)),
  ];
  if (selected.length === 0) {
    return { error: "Select at least one approver." };
  }

  const settings = await getScheduleApprovalSettings();
  const pool = new Set(settings.approverUserIds);
  if (pool.size === 0) {
    return { error: "No schedule approvers are configured. Set them in HR Settings → Attendance → Schedule Approval." };
  }
  if (selected.some((id) => !pool.has(id))) {
    return { error: "One or more selected users are not configured approvers." };
  }

  const service = createServiceClient();

  // Cancel any existing pending for this week first (unique index allows one pending).
  await service
    .from("hr_schedule_approval_requests")
    .update({
      status: "cancelled",
      updated_at: new Date().toISOString(),
    })
    .eq("venue_id", venue.id)
    .eq("week_start", week)
    .eq("status", "pending");

  // Also block if already approved — send again only after cancel would be intentional;
  // for this pass, require not already approved.
  const { data: existingApproved } = await service
    .from("hr_schedule_approval_requests")
    .select("id")
    .eq("venue_id", venue.id)
    .eq("week_start", week)
    .eq("status", "approved")
    .maybeSingle();

  if (existingApproved) {
    return { error: "This week is already approved." };
  }

  const { data, error } = await service
    .from("hr_schedule_approval_requests")
    .insert({
      venue_id: venue.id,
      week_start: week,
      status: "pending",
      requested_by: user.id,
      approver_user_ids: selected,
    })
    .select("*")
    .single();

  if (error || !data) {
    return { error: error?.message ?? "Could not create approval request." };
  }

  const weekLabel = week;
  const rows = selected.map((approverId) => ({
    user_id: approverId,
    venue_id: venue.id,
    module_key: "hr",
    type: "schedule_approval_requested",
    title: "Schedule approval requested",
    body: `Please revise and approve the schedule for week of ${weekLabel}.`,
    entity: "schedule_week",
    entity_id: week,
    severity: "warning" as const,
    dedupe_key: `schedule-approval:${venue.id}:${week}:${approverId}`,
    read_at: null,
  }));

  const { error: notifyError } = await service.from("notifications").upsert(rows, {
    onConflict: "dedupe_key",
  });
  if (notifyError) {
    console.error("[hr] schedule approval notify failed:", notifyError.message);
  }

  await writeAuditLog({
    actor_id: user.id,
    action: "create",
    module_key: HR_MODULE_KEY,
    entity: "hr_schedule_approval_requests",
    entity_id: data.id,
    venue_id: venue.id,
    after: data,
  });

  revalidatePath("/hr/schedules");
  return { request: data as ScheduleApprovalRequest };
}

export async function approveScheduleWeek(params: {
  weekStart: string;
}): Promise<{ request?: ScheduleApprovalRequest; error?: string }> {
  const { user, venue, permissions } = await getAuthContext();
  if (!canAccessSchedules(permissions, venue.id)) {
    return { error: "You do not have access to schedules." };
  }

  const week = normalizeWeekStart(params.weekStart);
  if (!week) return { error: "Invalid week start." };

  const service = createServiceClient();
  const { data: pending, error: loadError } = await service
    .from("hr_schedule_approval_requests")
    .select("*")
    .eq("venue_id", venue.id)
    .eq("week_start", week)
    .eq("status", "pending")
    .maybeSingle();

  if (loadError) return { error: loadError.message };
  if (!pending) return { error: "No pending approval request for this week." };

  const approvers = (pending.approver_user_ids as string[]) ?? [];
  if (!approvers.includes(user.id)) {
    return { error: "You are not an approver for this request." };
  }

  const now = new Date().toISOString();
  const { data, error } = await service
    .from("hr_schedule_approval_requests")
    .update({
      status: "approved",
      reviewed_by: user.id,
      reviewed_at: now,
      updated_at: now,
    })
    .eq("id", pending.id)
    .select("*")
    .single();

  if (error || !data) {
    return { error: error?.message ?? "Could not approve the schedule." };
  }

  await writeAuditLog({
    actor_id: user.id,
    action: "update",
    module_key: HR_MODULE_KEY,
    entity: "hr_schedule_approval_requests",
    entity_id: data.id,
    venue_id: venue.id,
    before: pending as Record<string, unknown>,
    after: data as Record<string, unknown>,
  });

  revalidatePath("/hr/schedules");
  return { request: data as ScheduleApprovalRequest };
}
