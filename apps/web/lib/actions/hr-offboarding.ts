"use server";

import { getActionAuthContext } from "@/lib/auth/action-context";
import {
  availableBalance,
  currentLeaveYear,
  groupScheduledLeaveRanges,
  isScheduleLeaveLabel,
  normalizeScheduleLeaveCode,
  overlayBalanceUsageFromSchedule,
  type ScheduledLeaveLabelStyle,
  type ScheduledLeaveRange,
} from "@/lib/hr/leave";
import {
  defaultAutoAdjustments,
  normalizeChecklist,
  normalizeNoticeEmailRecords,
  type OffboardingAutoAdjustments,
  type OffboardingLeaveEntry,
  type OffboardingLeaveHandling,
  type OffboardingNoticeEmailAction,
  type OffboardingNoticeEmailDelivery,
  type OffboardingProcess,
  type OffboardingProcessStatus,
  type OffboardingSettlementPreview,
  type OffboardingTerminationKind,
} from "@/lib/hr/offboarding-process";
import { canEditStaff, canViewStaff } from "@/lib/hr/permissions";
import { parseBoardingEmailAction } from "@/lib/hr/types";
import {
  DEFAULT_SCHEDULE_DAY_LABELS,
  withFallbackScheduleLabelIds,
  type ScheduleDayLabel,
} from "@/lib/hr/schedules";
import { listScheduleDayLabels, listStaffScheduleDays } from "@/lib/hr/store";
import {
  DEFAULT_HR_LEAVE_POLICY_SETTINGS,
  HR_MODULE_KEY,
  type HrLeaveBalance,
} from "@/lib/hr/types";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveActiveVenue } from "@/lib/venue/active-venue";

const PROCESS_SELECT =
  "id, venue_id, staff_id, employment_status_id, emp_no, full_name, department_name, position_name, employment_status_name, joining_date, termination_kind, notification_date, termination_date, notice_email_action, hub_access_disable_date, al_balance, ph_balance, leave_handling, leave_entries, checklist, auto_adjustments, settlement, status, started_at, archived_at, notes, created_at, updated_at";

type ProcessRow = {
  id: string;
  venue_id: string;
  staff_id: string;
  employment_status_id: string | null;
  emp_no: string;
  full_name: string;
  department_name: string | null;
  position_name: string | null;
  employment_status_name: string | null;
  joining_date: string | null;
  termination_kind: string;
  notification_date: string;
  termination_date: string;
  notice_email_action: string | null;
  hub_access_disable_date: string | null;
  al_balance: number | string;
  ph_balance: number | string;
  leave_handling: string;
  leave_entries: unknown;
  checklist: unknown;
  auto_adjustments: unknown;
  settlement: unknown;
  status: string;
  started_at: string;
  archived_at: string | null;
  notes: string;
};

function asDateOnly(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  return value.slice(0, 10);
}

function asDateOnlyOrNull(value: unknown): string | null {
  const d = asDateOnly(value);
  return d || null;
}

function parseLeaveHandling(value: unknown): OffboardingLeaveHandling {
  return value === "use_on_last_days" ? "use_on_last_days" : "pay_off";
}

function parseTerminationKind(value: unknown): OffboardingTerminationKind {
  if (
    value === "resignation" ||
    value === "termination_with_notice" ||
    value === "immediate_termination"
  ) {
    return value;
  }
  return "resignation";
}

function parseStatus(value: unknown): OffboardingProcessStatus {
  if (
    value === "draft" ||
    value === "in_progress" ||
    value === "settlement_pending" ||
    value === "completed" ||
    value === "cancelled"
  ) {
    return value;
  }
  return "in_progress";
}

function parseNoticeEmailAction(
  value: unknown,
): OffboardingNoticeEmailAction | null {
  if (value === "resignation_confirm" || value === "termination_notice") {
    return value;
  }
  return null;
}

function parseLeaveEntries(raw: unknown): OffboardingLeaveEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row, index) => {
    const r = (row ?? {}) as Record<string, unknown>;
    return {
      id: typeof r.id === "string" && r.id ? r.id : `leave-${index}`,
      leaveType: typeof r.leaveType === "string" ? r.leaveType : "AL",
      startDate: asDateOnly(r.startDate),
      endDate: asDateOnly(r.endDate),
      approvalMode:
        r.approvalMode === "direct_approve" ? "direct_approve" : "draft",
    };
  });
}

function parseAutoAdjustments(
  raw: unknown,
  kind: OffboardingTerminationKind,
): OffboardingAutoAdjustments {
  const defaults = defaultAutoAdjustments(kind);
  if (!raw || typeof raw !== "object") return defaults;
  const r = raw as Record<string, unknown>;
  return {
    salaryToLastDay:
      typeof r.salaryToLastDay === "boolean"
        ? r.salaryToLastDay
        : defaults.salaryToLastDay,
    annualLeavePayout:
      typeof r.annualLeavePayout === "boolean"
        ? r.annualLeavePayout
        : defaults.annualLeavePayout,
    eosGratuity:
      typeof r.eosGratuity === "boolean" ? r.eosGratuity : defaults.eosGratuity,
    publicHolidayBalance:
      typeof r.publicHolidayBalance === "boolean"
        ? r.publicHolidayBalance
        : defaults.publicHolidayBalance,
    noticePay:
      typeof r.noticePay === "boolean" ? r.noticePay : defaults.noticePay,
  };
}

function parseSettlement(raw: unknown): OffboardingSettlementPreview {
  const empty: OffboardingSettlementPreview = {
    dailyRate: null,
    alDays: 0,
    phDays: 0,
    alPayout: null,
    phPayout: null,
    eosGratuity: null,
    noticePayDays: 0,
    noticePay: null,
    estimatedTotal: null,
  };
  if (!raw || typeof raw !== "object") return empty;
  const r = raw as Record<string, unknown>;
  const numOrNull = (v: unknown) => {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const num = (v: unknown) => numOrNull(v) ?? 0;
  return {
    dailyRate: numOrNull(r.dailyRate),
    alDays: num(r.alDays),
    phDays: num(r.phDays),
    alPayout: numOrNull(r.alPayout),
    phPayout: numOrNull(r.phPayout),
    eosGratuity: numOrNull(r.eosGratuity),
    noticePayDays: num(r.noticePayDays),
    noticePay: numOrNull(r.noticePay),
    estimatedTotal: numOrNull(r.estimatedTotal),
  };
}

async function staffPhotoById(
  supabase: Awaited<ReturnType<typeof createClient>>,
  staffIds: string[],
): Promise<Map<string, string | null>> {
  const ids = [...new Set(staffIds.filter(Boolean))];
  const map = new Map<string, string | null>();
  if (ids.length === 0) return map;
  const { data } = await supabase
    .from("staff")
    .select("id, photo_url")
    .in("id", ids);
  for (const row of data ?? []) {
    map.set(String(row.id), (row.photo_url as string | null) ?? null);
  }
  return map;
}

function rowToProcess(
  row: ProcessRow,
  noticeEmailRecords: OffboardingNoticeEmailDelivery[] = [],
  photoUrl: string | null = null,
): OffboardingProcess {
  const kind = parseTerminationKind(row.termination_kind);
  return {
    id: row.id,
    staffId: row.staff_id,
    empNo: row.emp_no ?? "",
    fullName: row.full_name ?? "",
    photoUrl,
    departmentName: row.department_name,
    positionName: row.position_name,
    employmentStatusId: row.employment_status_id,
    employmentStatusName: row.employment_status_name,
    joiningDate: asDateOnlyOrNull(row.joining_date),
    terminationKind: kind,
    notificationDate: asDateOnly(row.notification_date),
    terminationDate: asDateOnly(row.termination_date),
    noticeEmailAction: parseNoticeEmailAction(row.notice_email_action),
    noticeEmailRecords: normalizeNoticeEmailRecords({
      noticeEmailRecords,
    }),
    hubAccessDisableDate: asDateOnlyOrNull(row.hub_access_disable_date),
    alBalance: toNumber(row.al_balance),
    phBalance: toNumber(row.ph_balance),
    leaveHandling: parseLeaveHandling(row.leave_handling),
    leaveEntries: parseLeaveEntries(row.leave_entries),
    checklist: normalizeChecklist(
      Array.isArray(row.checklist)
        ? (row.checklist as Parameters<typeof normalizeChecklist>[0])
        : null,
    ),
    autoAdjustments: parseAutoAdjustments(row.auto_adjustments, kind),
    settlement: parseSettlement(row.settlement),
    status: parseStatus(row.status),
    startedAt: row.started_at,
    archivedAt: row.archived_at ? String(row.archived_at) : null,
    notes: row.notes ?? "",
  };
}

function processToRow(
  process: OffboardingProcess,
  venueId: string,
  userId: string,
  isInsert: boolean,
) {
  const now = new Date().toISOString();
  return {
    id: process.id,
    venue_id: venueId,
    staff_id: process.staffId,
    employment_status_id: process.employmentStatusId || null,
    emp_no: process.empNo,
    full_name: process.fullName,
    department_name: process.departmentName,
    position_name: process.positionName,
    employment_status_name: process.employmentStatusName,
    joining_date: process.joiningDate || null,
    termination_kind: process.terminationKind,
    notification_date: process.notificationDate,
    termination_date: process.terminationDate,
    notice_email_action: parseNoticeEmailAction(process.noticeEmailAction),
    hub_access_disable_date: process.hubAccessDisableDate || null,
    al_balance: process.alBalance,
    ph_balance: process.phBalance,
    leave_handling: process.leaveHandling,
    leave_entries: process.leaveEntries,
    checklist: process.checklist,
    auto_adjustments: process.autoAdjustments,
    settlement: process.settlement,
    status: process.status,
    started_at: process.startedAt || now,
    archived_at: process.archivedAt || null,
    notes: process.notes ?? "",
    updated_by: userId,
    updated_at: now,
    ...(isInsert ? { created_by: userId, created_at: now } : {}),
  };
}

async function loadNoticeEmailsForProcess(input: {
  venueId: string;
  staffId: string;
  processId: string;
}): Promise<OffboardingNoticeEmailDelivery[]> {
  // Flush due schedules before reading so short delays don't wait on daily cron.
  const { processDueScheduledBoardingEmails } = await import(
    "@/lib/hr/process-scheduled-boarding-emails"
  );
  await processDueScheduledBoardingEmails({ limit: 25 });

  const service = createServiceClient();
  const { data, error } = await service
    .from("hr_boarding_emails")
    .select(
      "id, action, status, to_email, from_email, subject, message, template_id, template_name, provider, recorded_at, sent_at, scheduled_at, process_id",
    )
    .eq("venue_id", input.venueId)
    .eq("staff_id", input.staffId)
    .order("recorded_at", { ascending: true });

  if (error || !data) return [];

  return data
    .filter(
      (row) =>
        row.process_id === input.processId || row.process_id == null,
    )
    .map((row) => ({
      id: String(row.id),
      action: parseBoardingEmailAction(String(row.action ?? "")),
      status:
        row.status === "draft"
          ? ("draft" as const)
          : row.status === "scheduled"
            ? ("scheduled" as const)
            : ("sent" as const),
      sentAt: String(row.sent_at ?? row.recorded_at ?? ""),
      scheduledAt: row.scheduled_at ? String(row.scheduled_at) : null,
      to: String(row.to_email ?? ""),
      fromEmail: row.from_email ? String(row.from_email) : null,
      subject: String(row.subject ?? ""),
      message: String(row.message ?? ""),
      templateId: String(row.template_id ?? ""),
      templateName: String(row.template_name ?? ""),
      provider: String(row.provider ?? "draft"),
    }));
}

export async function listOffboardingProcesses(): Promise<{
  error?: string;
  processes: OffboardingProcess[];
}> {
  const ctx = await getActionAuthContext();
  if ("error" in ctx) return { error: ctx.error, processes: [] };
  if (!canViewStaff(ctx.permissions, ctx.venue.id)) {
    return {
      error: "You do not have permission to view offboarding.",
      processes: [],
    };
  }

  const { data, error } = await ctx.supabase
    .from("hr_offboarding_processes")
    .select(PROCESS_SELECT)
    .eq("venue_id", ctx.venue.id)
    .order("started_at", { ascending: false });

  if (error) return { error: error.message, processes: [] };

  const rows = (data ?? []) as ProcessRow[];
  const photos = await staffPhotoById(
    ctx.supabase,
    rows.map((row) => row.staff_id),
  );

  return {
    processes: rows.map((row) =>
      rowToProcess(row, [], photos.get(row.staff_id) ?? null),
    ),
  };
}

export async function getOffboardingProcess(processId: string): Promise<{
  error?: string;
  process: OffboardingProcess | null;
}> {
  const ctx = await getActionAuthContext();
  if ("error" in ctx) return { error: ctx.error, process: null };
  if (!canViewStaff(ctx.permissions, ctx.venue.id)) {
    return {
      error: "You do not have permission to view offboarding.",
      process: null,
    };
  }

  const { data, error } = await ctx.supabase
    .from("hr_offboarding_processes")
    .select(PROCESS_SELECT)
    .eq("venue_id", ctx.venue.id)
    .eq("id", processId)
    .maybeSingle();

  if (error) return { error: error.message, process: null };
  if (!data) return { process: null };

  const row = data as ProcessRow;
  const [noticeEmailRecords, photos] = await Promise.all([
    loadNoticeEmailsForProcess({
      venueId: ctx.venue.id,
      staffId: row.staff_id,
      processId: row.id,
    }),
    staffPhotoById(ctx.supabase, [row.staff_id]),
  ]);

  return {
    process: rowToProcess(
      row,
      noticeEmailRecords,
      photos.get(row.staff_id) ?? null,
    ),
  };
}

export async function upsertOffboardingProcessAction(
  process: OffboardingProcess,
): Promise<{ error?: string; process?: OffboardingProcess }> {
  const ctx = await getActionAuthContext();
  if ("error" in ctx) return { error: ctx.error };
  if (!canEditStaff(ctx.permissions, ctx.venue.id)) {
    return { error: "You do not have permission to edit offboarding." };
  }

  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!process.staffId?.trim()) {
    return { error: "Staff is required." };
  }
  const processId = uuidRe.test(process.id)
    ? process.id
    : crypto.randomUUID();
  const processWithId = { ...process, id: processId };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(processWithId.notificationDate)) {
    return { error: "Notification date is invalid." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(processWithId.terminationDate)) {
    return { error: "Termination date is invalid." };
  }

  const service = createServiceClient();
  const { data: existing } = await service
    .from("hr_offboarding_processes")
    .select("id, staff_id, status")
    .eq("venue_id", ctx.venue.id)
    .eq("id", processId)
    .maybeSingle();

  const isInsert = !existing;
  const payload = processToRow(
    processWithId,
    ctx.venue.id,
    ctx.user.id,
    isInsert,
  );

  const { data, error } = isInsert
    ? await service
        .from("hr_offboarding_processes")
        .insert(payload)
        .select(PROCESS_SELECT)
        .single()
    : await service
        .from("hr_offboarding_processes")
        .update(payload)
        .eq("id", processId)
        .eq("venue_id", ctx.venue.id)
        .select(PROCESS_SELECT)
        .single();

  if (error) {
    if (error.code === "23505") {
      return {
        error:
          "An active offboarding process already exists for this staff member.",
      };
    }
    return { error: error.message };
  }

  const { writeAuditLog } = await import("@/lib/audit");
  const { revalidatePath } = await import("next/cache");

  await writeAuditLog({
    actor_id: ctx.user.id,
    action: isInsert ? "create" : "update",
    module_key: HR_MODULE_KEY,
    entity: "hr_offboarding_processes",
    entity_id: processId,
    venue_id: ctx.venue.id,
    before: existing,
    after: {
      staff_id: processWithId.staffId,
      status: processWithId.status,
      termination_kind: processWithId.terminationKind,
      termination_date: processWithId.terminationDate,
    },
  });

  revalidatePath("/hr/offboarding");
  revalidatePath(`/hr/offboarding/${processId}`);
  revalidatePath("/hr/staff");

  const noticeEmailRecords = await loadNoticeEmailsForProcess({
    venueId: ctx.venue.id,
    staffId: processWithId.staffId,
    processId,
  });

  return {
    process: rowToProcess(
      data as ProcessRow,
      noticeEmailRecords,
      processWithId.photoUrl ?? null,
    ),
  };
}

export async function archiveOffboardingProcess(
  processId: string,
): Promise<{ error?: string; success?: true }> {
  return setOffboardingProcessArchived(processId, true);
}

export async function unarchiveOffboardingProcess(
  processId: string,
): Promise<{ error?: string; success?: true }> {
  return setOffboardingProcessArchived(processId, false);
}

async function setOffboardingProcessArchived(
  processId: string,
  archive: boolean,
): Promise<{ error?: string; success?: true }> {
  const ctx = await getActionAuthContext();
  if ("error" in ctx) return { error: ctx.error };
  if (!canEditStaff(ctx.permissions, ctx.venue.id)) {
    return { error: "You do not have permission to edit offboarding." };
  }

  const service = createServiceClient();
  const { data: existing, error: loadError } = await service
    .from("hr_offboarding_processes")
    .select("id, staff_id, status, archived_at")
    .eq("venue_id", ctx.venue.id)
    .eq("id", processId)
    .maybeSingle();

  if (loadError) return { error: loadError.message };
  if (!existing) return { error: "Offboarding process not found." };

  const archivedAt = archive ? new Date().toISOString() : null;

  if (!archive && existing.archived_at) {
    // Restoring must not collide with another active process for the same staff.
    const status = String(existing.status ?? "");
    if (status !== "completed" && status !== "cancelled") {
      const { data: conflict } = await service
        .from("hr_offboarding_processes")
        .select("id")
        .eq("venue_id", ctx.venue.id)
        .eq("staff_id", existing.staff_id)
        .neq("id", processId)
        .not("status", "in", "(completed,cancelled)")
        .is("archived_at", null)
        .maybeSingle();
      if (conflict) {
        return {
          error:
            "Another active offboarding process already exists for this staff member. Archive or complete it first.",
        };
      }
    }
  }

  const { error } = await service
    .from("hr_offboarding_processes")
    .update({
      archived_at: archivedAt,
      updated_by: ctx.user.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", processId)
    .eq("venue_id", ctx.venue.id);

  if (error) return { error: error.message };

  const { writeAuditLog } = await import("@/lib/audit");
  const { revalidatePath } = await import("next/cache");

  await writeAuditLog({
    actor_id: ctx.user.id,
    action: "update",
    module_key: HR_MODULE_KEY,
    entity: "hr_offboarding_processes",
    entity_id: processId,
    venue_id: ctx.venue.id,
    before: { archived_at: existing.archived_at },
    after: { archived_at: archivedAt },
  });

  revalidatePath("/hr/offboarding");
  revalidatePath(`/hr/offboarding/${processId}`);
  revalidatePath("/hr/staff");

  return { success: true };
}

export async function deleteOffboardingProcess(
  processId: string,
): Promise<{ error?: string; success?: true }> {
  const ctx = await getActionAuthContext();
  if ("error" in ctx) return { error: ctx.error };
  if (!canEditStaff(ctx.permissions, ctx.venue.id)) {
    return { error: "You do not have permission to delete offboarding." };
  }

  const service = createServiceClient();
  const { data: existing, error: loadError } = await service
    .from("hr_offboarding_processes")
    .select("id, staff_id, full_name, status, archived_at")
    .eq("venue_id", ctx.venue.id)
    .eq("id", processId)
    .maybeSingle();

  if (loadError) return { error: loadError.message };
  if (!existing) return { error: "Offboarding process not found." };

  // Remove linked notice emails and unlinked orphans for this staff.
  // Emails belonging to a different process are left alone.
  const { error: emailError } = await service
    .from("hr_boarding_emails")
    .delete()
    .eq("venue_id", ctx.venue.id)
    .eq("staff_id", existing.staff_id)
    .or(`process_id.eq.${processId},process_id.is.null`);

  if (emailError) return { error: emailError.message };

  const { error } = await service
    .from("hr_offboarding_processes")
    .delete()
    .eq("id", processId)
    .eq("venue_id", ctx.venue.id);

  if (error) return { error: error.message };

  const { writeAuditLog } = await import("@/lib/audit");
  const { revalidatePath } = await import("next/cache");

  await writeAuditLog({
    actor_id: ctx.user.id,
    action: "delete",
    module_key: HR_MODULE_KEY,
    entity: "hr_offboarding_processes",
    entity_id: processId,
    venue_id: ctx.venue.id,
    before: existing,
    after: { deleted: true, emails_deleted: true },
  });

  revalidatePath("/hr/offboarding");
  revalidatePath(`/hr/offboarding/${processId}`);
  revalidatePath("/hr/staff");
  revalidatePath(`/hr/${existing.staff_id}`);

  return { success: true };
}

function toNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeBalance(row: Record<string, unknown>): HrLeaveBalance {
  return {
    id: String(row.id),
    venue_id: String(row.venue_id),
    staff_id: String(row.staff_id),
    leave_year: toNumber(row.leave_year),
    leave_type_code: String(row.leave_type_code),
    entitled: toNumber(row.entitled),
    accrued: toNumber(row.accrued),
    used: toNumber(row.used),
    scheduled: toNumber(row.scheduled),
    pending: toNumber(row.pending),
    carried_forward: toNumber(row.carried_forward),
    expired: toNumber(row.expired),
    adjusted: toNumber(row.adjusted),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

function workingPool(row: HrLeaveBalance | undefined): number {
  if (!row) return 0;
  const working =
    row.accrued > 0 || row.entitled === 0 ? row.accrued : row.entitled;
  return Math.round((working + row.carried_forward + row.adjusted) * 1000) / 1000;
}

/**
 * Lean leave snapshot for offboarding dialogs.
 * Skips ensure-all-staff balances, adjustments, leave-request matching,
 * and attendance approval overlay used by the full leave detail page.
 */
export async function getOffboardingLeaveSnapshot(input: {
  staffId: string;
  leaveYear?: number;
}): Promise<{
  error?: string;
  year: number;
  alBalance: number;
  phBalance: number;
  alAvail: number;
  alUsed: number;
  alScheduled: number;
  phAvail: number;
  phUsed: number;
  scheduledLeaves: ScheduledLeaveRange[];
  scheduleLabels: ScheduledLeaveLabelStyle[];
}> {
  const year = input.leaveYear ?? currentLeaveYear();
  const empty = {
    year,
    alBalance: 0,
    phBalance: 0,
    alAvail: 0,
    alUsed: 0,
    alScheduled: 0,
    phAvail: 0,
    phUsed: 0,
    scheduledLeaves: [] as ScheduledLeaveRange[],
    scheduleLabels: [] as ScheduledLeaveLabelStyle[],
  };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ...empty, error: "Not signed in." };

  const venue = await resolveActiveVenue(supabase);
  if (!venue) return { ...empty, error: "No active venue selected." };

  const { data: permissions } = await supabase
    .from("user_permissions")
    .select("*")
    .eq("user_id", user.id);

  if (!canViewStaff(permissions ?? [], venue.id)) {
    return { ...empty, error: "You do not have permission to view leave." };
  }

  const service = createServiceClient();
  const fromDate = `${year}-01-01`;
  const toDate = `${year}-12-31`;

  const [balancesResult, scheduleDays, labelsFromDb, staffResult] =
    await Promise.all([
      supabase
        .from("hr_leave_balances")
        .select(
          "id, venue_id, staff_id, leave_year, leave_type_code, entitled, accrued, used, scheduled, pending, carried_forward, expired, adjusted, created_at, updated_at",
        )
        .eq("venue_id", venue.id)
        .eq("staff_id", input.staffId)
        .eq("leave_year", year)
        .in("leave_type_code", ["AL", "PH-REPL"]),
      listStaffScheduleDays(service, venue.id, {
        staffIds: [input.staffId],
        fromDate,
        toDate,
        labelCodes: ["AL", "LP", "PH-REPL", "PHRL", "UPL", "SL", "ABS"],
      }),
      listScheduleDayLabels(supabase),
      supabase
        .from("staff")
        .select("termination_date")
        .eq("id", input.staffId)
        .eq("home_venue_id", venue.id)
        .maybeSingle(),
    ]);

  if (balancesResult.error) {
    return { ...empty, error: balancesResult.error.message };
  }

  const terminationDate = staffResult.data?.termination_date
    ? String(staffResult.data.termination_date).slice(0, 10)
    : null;

  const employmentScheduleDays = scheduleDays.filter((d) => {
    const date = String(d.work_date).slice(0, 10);
    if (!terminationDate || !/^\d{4}-\d{2}-\d{2}$/.test(terminationDate)) {
      return true;
    }
    return date <= terminationDate;
  });

  const employmentScheduleRefs = employmentScheduleDays.map((d) => ({
    label_code: d.label_code,
    work_date: String(d.work_date).slice(0, 10),
  }));

  const balances = (balancesResult.data ?? []).map((r) =>
    normalizeBalance(r as Record<string, unknown>),
  );

  const overlaid = overlayBalanceUsageFromSchedule({
    balances,
    scheduleDays: employmentScheduleRefs,
    policy: DEFAULT_HR_LEAVE_POLICY_SETTINGS,
    leaveYear: year,
    staffId: input.staffId,
    venueId: venue.id,
    terminationDate,
  });

  const al = overlaid.find((b) => b.leave_type_code === "AL");
  const ph = overlaid.find((b) => b.leave_type_code === "PH-REPL");

  const labelSource: ScheduleDayLabel[] =
    labelsFromDb && labelsFromDb.length > 0
      ? withFallbackScheduleLabelIds(labelsFromDb)
      : withFallbackScheduleLabelIds(DEFAULT_SCHEDULE_DAY_LABELS);

  const scheduleLabels: ScheduledLeaveLabelStyle[] = labelSource.map((l) => ({
    code: l.code,
    abbreviation: l.abbreviation,
    name: l.name,
    bgColor: l.bgColor,
    textColor: l.textColor,
    borderColor: l.borderColor,
  }));

  const leaveDays = employmentScheduleDays
    .filter(
      (d) =>
        isScheduleLeaveLabel(d.label_code) || d.label_code === "ABS",
    )
    .map((d) => ({
      workDate: String(d.work_date).slice(0, 10),
      labelCode: normalizeScheduleLeaveCode(d.label_code),
    }));

  const scheduledLeaves = groupScheduledLeaveRanges(leaveDays).map((range) => ({
    ...range,
    approvalStatus: "scheduled" as const,
  }));

  return {
    year,
    alBalance: al ? availableBalance(al) : 0,
    phBalance: ph ? availableBalance(ph) : 0,
    alAvail: workingPool(al),
    alUsed: al?.used ?? 0,
    alScheduled: al?.scheduled ?? 0,
    phAvail: workingPool(ph),
    phUsed: ph?.used ?? 0,
    scheduledLeaves,
    scheduleLabels,
  };
}

/** Persist termination + employment status onto the staff directory row. */
export async function syncStaffOffboardingDirectoryFields(input: {
  staffId: string;
  terminationDate: string;
  terminationType: "resignation" | "termination_with_notice" | "termination";
  employmentStatusId: string;
}): Promise<{ error?: string; success?: true }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const venue = await resolveActiveVenue(supabase);
  if (!venue) return { error: "No active venue selected." };

  const { data: permissions } = await supabase
    .from("user_permissions")
    .select("*")
    .eq("user_id", user.id);

  const { canEditOwnStaff } = await import("@/lib/hr/permissions");
  const { writeAuditLog } = await import("@/lib/audit");
  const { revalidatePath } = await import("next/cache");
  const { HR_MODULE_KEY } = await import("@/lib/hr/types");

  const { data: before } = await supabase
    .from("staff")
    .select("id, created_by, termination_date, termination_type, employment_status_id")
    .eq("id", input.staffId)
    .eq("home_venue_id", venue.id)
    .maybeSingle();

  if (!before) return { error: "Staff member not found." };

  if (
    !canEditOwnStaff(
      permissions ?? [],
      venue.id,
      before.created_by as string | null,
      user.id,
    )
  ) {
    return { error: "You do not have permission to edit this staff record." };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.terminationDate)) {
    return { error: "Termination date is invalid." };
  }
  if (!input.employmentStatusId.trim()) {
    return { error: "Employment status is required." };
  }

  const updates = {
    termination_date: input.terminationDate,
    termination_type: input.terminationType,
    employment_status_id: input.employmentStatusId,
  };

  const service = createServiceClient();
  const { error } = await service
    .from("staff")
    .update(updates)
    .eq("id", input.staffId)
    .eq("home_venue_id", venue.id);

  if (error) return { error: error.message };

  const { archiveUniformStaffIfEmploymentOut } = await import(
    "@/lib/hr/uniform-store"
  );
  const archived = await archiveUniformStaffIfEmploymentOut(service, {
    venueId: venue.id,
    staffId: input.staffId,
    employmentStatusId: input.employmentStatusId,
    archivedBy: user.id,
  });

  await writeAuditLog({
    actor_id: user.id,
    action: "update",
    module_key: HR_MODULE_KEY,
    entity: "staff",
    entity_id: input.staffId,
    venue_id: venue.id,
    before,
    after: updates,
  });

  revalidatePath(`/hr/${input.staffId}`);
  revalidatePath("/hr");
  revalidatePath("/hr/staff");
  revalidatePath("/hr/offboarding");
  if (archived) {
    revalidatePath("/hr/assets/uniform/employees");
  }

  return { success: true };
}
