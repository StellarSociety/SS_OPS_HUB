"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { writeAuditLog } from "@/lib/audit";
import {
  allocateSickLeaveScheduleDays,
  availableBalance,
  BALANCE_TRACKED_CODES,
  buildEmployeeLeaveSummary,
  canCarryForwardLeaveCode,
  carryForwardAmount,
  computeOpeningCarryForward,
  countInclusiveDays,
  countPhReplacementCredits,
  currentLeaveYear,
  dateRangesOverlap,
  eachIsoDateInRange,
  groupScheduledLeaveRanges,
  isScheduleLeaveLabel,
  listPhReplacementCreditDates,
  mergeLeavePolicy,
  normalizeLeaveCalendarStatus,
  normalizeScheduleLeaveCode,
  overlayBalanceUsageFromSchedule,
  PH_WORKED_LABEL_CODES,
  policyCodeToScheduleLeaveCode,
  scheduleLeaveCodesFromPolicyOrder,
  scheduleLeaveDisplayName,
  seedEntitlementForType,
  splitAnnualLeaveScheduleDays,
  type EmployeeLeaveSummary,
  type LeaveCalendarEvent,
  type LeaveUsageDayEntry,
  type LeaveUsageKind,
  type PhReplacementCreditEntry,
  type ScheduledLeaveLabelStyle,
  type ScheduledLeaveRange,
} from "@/lib/hr/leave";
import {
  canAdminLookups,
  canEditSchedules,
  canEditStaff,
  canViewStaff,
} from "@/lib/hr/permissions";
import {
  DEFAULT_SCHEDULE_DAY_LABELS,
  isWorkDateAfterTermination,
  postTerminationBlockMessage,
  withFallbackScheduleLabelIds,
  type ScheduleDayLabel,
} from "@/lib/hr/schedules";
import {
  getHrVenueSetting,
  listAttendanceDaysForStaff,
  listPublicHolidays,
  listScheduleDayLabels,
  listScheduleDaysByDateRange,
  listStaffForVenue,
  listStaffScheduleDays,
} from "@/lib/hr/store";
import { ATTENDANCE_APPROVED_STATUS } from "@/lib/hr/attendance-approval";
import { upsertAttendanceDayApprovals } from "@/lib/hr/attendance-day-approvals";
import {
  DEFAULT_HR_LEAVE_POLICY_SETTINGS,
  HR_MODULE_KEY,
  HR_SETTINGS_KEYS,
  type HrLeaveBalance,
  type HrLeaveBalanceAdjustment,
  type HrLeavePaidStatus,
  type HrLeavePolicySettings,
  type HrLeaveTypeConfig,
} from "@/lib/hr/types";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveActiveVenue } from "@/lib/venue/active-venue";

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

function toNumber(v: unknown): number {
  const n = Number(v ?? 0);
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

export async function getLeavePolicySettings(): Promise<HrLeavePolicySettings> {
  const { supabase, venue } = await getAuthContext();
  const stored = await getHrVenueSetting<Partial<HrLeavePolicySettings>>(
    supabase,
    venue.id,
    HR_SETTINGS_KEYS.leavePolicy,
    {},
  );
  return mergeLeavePolicy(stored);
}

export async function saveHrLeavePolicySettings(
  formData: FormData,
): Promise<void> {
  const { user, venue, permissions } = await getAuthContext();

  if (!canAdminLookups(permissions, venue.id)) {
    return;
  }

  const leaveTypesJson = String(formData.get("leave_types_json") ?? "");
  let leaveTypes: HrLeaveTypeConfig[] =
    DEFAULT_HR_LEAVE_POLICY_SETTINGS.leaveTypes;
  try {
    const parsed = JSON.parse(leaveTypesJson) as HrLeaveTypeConfig[];
    if (Array.isArray(parsed) && parsed.length > 0) {
      leaveTypes = parsed.map((t) => ({
        code: String(t.code ?? "").trim(),
        name: String(t.name ?? "").trim(),
        displayLabel: String(t.displayLabel ?? t.code ?? "").trim(),
        paidStatus: (t.paidStatus ?? "paid") as HrLeavePaidStatus,
        balanceRequired: Boolean(t.balanceRequired),
        active: Boolean(t.active),
      }));
    }
  } catch {
    // keep defaults
  }

  const bool = (key: string) => {
    const v = formData.get(key);
    return v === "on" || v === "true" || v === "1";
  };

  const num = (key: string, fallback: number) => {
    const parsed = Number(formData.get(key));
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const d = DEFAULT_HR_LEAVE_POLICY_SETTINGS;
  const value: HrLeavePolicySettings = {
    yearModel: "calendar",
    leaveTypes,
    annual: {
      zeroEntitlementMonths: num(
        "annual_zero_entitlement_months",
        d.annual.zeroEntitlementMonths,
      ),
      daysPerMonthBeforeYear: num(
        "annual_days_per_month_before_year",
        d.annual.daysPerMonthBeforeYear,
      ),
      annualDaysAfterYear: num(
        "annual_days_after_year",
        d.annual.annualDaysAfterYear,
      ),
      monthlyAccrualAfterYear: num(
        "annual_monthly_accrual_after_year",
        d.annual.monthlyAccrualAfterYear,
      ),
      partialMonthMethod:
        String(formData.get("annual_partial_month_method") ?? "") === "pro_rata"
          ? "pro_rata"
          : "full_months",
      calendarDayCalculation: bool("annual_calendar_day_calculation"),
      carryForwardMaxDays: num(
        "annual_carry_forward_max_days",
        d.annual.carryForwardMaxDays,
      ),
      allowNegativeBalance: bool("annual_allow_negative_balance"),
      allowHrOverride: bool("annual_allow_hr_override"),
    },
    sick: {
      unpaidDuringProbation: bool("sick_unpaid_during_probation"),
      fullPayDays: num("sick_full_pay_days", d.sick.fullPayDays),
      halfPayDays: num("sick_half_pay_days", d.sick.halfPayDays),
      unpaidDays: num("sick_unpaid_days", d.sick.unpaidDays),
      yearlyMaximumDays: num(
        "sick_yearly_maximum_days",
        d.sick.yearlyMaximumDays,
      ),
      requireMedicalCertificate: bool("sick_require_medical_certificate"),
    },
    other: {
      parentalWorkingDays: num(
        "other_parental_working_days",
        d.other.parentalWorkingDays,
      ),
      bereavementSpouseDays: num(
        "other_bereavement_spouse_days",
        d.other.bereavementSpouseDays,
      ),
      bereavementCloseFamilyDays: num(
        "other_bereavement_close_family_days",
        d.other.bereavementCloseFamilyDays,
      ),
      studyLeaveWorkingDays: num(
        "other_study_leave_working_days",
        d.other.studyLeaveWorkingDays,
      ),
      studyLeaveMinServiceYears: num(
        "other_study_leave_min_service_years",
        d.other.studyLeaveMinServiceYears,
      ),
      hajjLeaveDays: num("other_hajj_leave_days", d.other.hajjLeaveDays),
      hajjOncePerEmployment: bool("other_hajj_once_per_employment"),
      maternityFullPayDays: num(
        "other_maternity_full_pay_days",
        d.other.maternityFullPayDays,
      ),
      maternityHalfPayDays: num(
        "other_maternity_half_pay_days",
        d.other.maternityHalfPayDays,
      ),
      maternityUnpaidExtraDays: num(
        "other_maternity_unpaid_extra_days",
        d.other.maternityUnpaidExtraDays,
      ),
    },
    approvals: {
      employeeSubmits: bool("approvals_employee_submits"),
      managerReviews: bool("approvals_manager_reviews"),
      hrReviewsWhenRequired: bool("approvals_hr_reviews_when_required"),
      allowHrOverride: bool("approvals_allow_hr_override"),
      allowRosterCreatedLeave: bool("approvals_allow_roster_created_leave"),
      allowBackdatedRequests: bool("approvals_allow_backdated_requests"),
      requireSupportingDocument: bool(
        "approvals_require_supporting_document",
      ),
      notifyOnSubmit: bool("approvals_notify_on_submit"),
      notifyOnDecision: bool("approvals_notify_on_decision"),
    },
  };

  const service = createServiceClient();
  const { error } = await service.from("hr_venue_settings").upsert(
    {
      venue_id: venue.id,
      key: HR_SETTINGS_KEYS.leavePolicy,
      value,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "venue_id,key" },
  );
  if (error) {
    console.error("[hr] leave_policy save failed:", error.message);
    return;
  }

  await writeAuditLog({
    actor_id: user.id,
    action: "update",
    module_key: HR_MODULE_KEY,
    entity: "hr_venue_settings",
    entity_id: HR_SETTINGS_KEYS.leavePolicy,
    venue_id: venue.id,
    after: value,
  });

  // Refresh entitled/accrued so method / pro-rata changes apply immediately.
  await ensureLeaveBalancesForYear(currentLeaveYear());

  revalidatePath("/hr/settings", "layout");
  revalidatePath("/hr/attendance/leave", "layout");
}

function isOnProbation(status: string | null | undefined): boolean {
  return status === "Pending";
}

/**
 * Ensure balance rows exist for all active staff for the given calendar year.
 * Does not overwrite used/scheduled/pending/adjusted/carried_forward on existing rows;
 * refreshes entitled/accrued from policy when those usage fields are all zero.
 * PH-REPL entitled/accrued always sync from roster × public holidays
 * (worked on PH → credit; not worked → no credit).
 */
export async function ensureLeaveBalancesForYear(
  leaveYear?: number,
): Promise<{ error?: string; created: number; updated: number }> {
  const { supabase, venue, permissions } = await getAuthContext();

  if (!canEditStaff(permissions, venue.id) && !canAdminLookups(permissions, venue.id)) {
    return { error: "You do not have permission to manage leave balances.", created: 0, updated: 0 };
  }

  const year = leaveYear ?? currentLeaveYear();
  const policy = await getLeavePolicySettings();
  const staff = await listStaffForVenue(supabase, venue.id);
  const service = createServiceClient();

  const holidays = await listPublicHolidays(supabase, venue.id, { year });
  const holidayDates = (holidays ?? []).map((h) => h.holidayDate.slice(0, 10));
  const holidaySet = new Set(holidayDates);

  const phCreditsByStaff = new Map<string, number>();
  if (holidayDates.length > 0 && staff.length > 0) {
    const scheduleDays = await listStaffScheduleDays(supabase, venue.id, {
      staffIds: staff.map((s) => s.id),
      fromDate: `${year}-01-01`,
      toDate: `${year}-12-31`,
    });
    const daysByStaff = new Map<
      string,
      Array<{ work_date: string; label_code: string }>
    >();
    for (const day of scheduleDays) {
      if (!holidaySet.has(String(day.work_date).slice(0, 10))) continue;
      const list = daysByStaff.get(day.staff_id) ?? [];
      list.push({
        work_date: day.work_date,
        label_code: day.label_code,
      });
      daysByStaff.set(day.staff_id, list);
    }
    for (const member of staff) {
      phCreditsByStaff.set(
        member.id,
        countPhReplacementCredits({
          holidayDates: holidaySet,
          scheduleDays: daysByStaff.get(member.id) ?? [],
        }),
      );
    }
  }

  const { data: existing, error: existingError } = await service
    .from("hr_leave_balances")
    .select("*")
    .eq("venue_id", venue.id)
    .eq("leave_year", year);

  if (existingError) {
    return { error: existingError.message, created: 0, updated: 0 };
  }

  const { data: priorRows, error: priorError } = await service
    .from("hr_leave_balances")
    .select("*")
    .eq("venue_id", venue.id)
    .eq("leave_year", year - 1)
    .in("leave_type_code", ["AL", "PH-REPL"]);

  if (priorError) {
    return { error: priorError.message, created: 0, updated: 0 };
  }

  const byKey = new Map<string, HrLeaveBalance>();
  for (const row of existing ?? []) {
    const bal = normalizeBalance(row as Record<string, unknown>);
    byKey.set(`${bal.staff_id}:${bal.leave_type_code}`, bal);
  }

  const priorByKey = new Map<string, HrLeaveBalance>();
  for (const row of priorRows ?? []) {
    const bal = normalizeBalance(row as Record<string, unknown>);
    priorByKey.set(`${bal.staff_id}:${bal.leave_type_code}`, bal);
  }

  // Balances whose carried_forward was manually set — do not auto-overwrite.
  const carriedOverrideIds = new Set<string>();
  const existingCarryIds = [...byKey.values()]
    .filter((b) => canCarryForwardLeaveCode(b.leave_type_code))
    .map((b) => b.id);
  if (existingCarryIds.length > 0) {
    const { data: carryAdj } = await service
      .from("hr_leave_balance_adjustments")
      .select("balance_id")
      .eq("venue_id", venue.id)
      .eq("field", "carried_forward")
      .in("balance_id", existingCarryIds);
    for (const row of carryAdj ?? []) {
      carriedOverrideIds.add(String((row as { balance_id: string }).balance_id));
    }
  }

  const now = new Date().toISOString();
  let created = 0;
  let updated = 0;
  const inserts: Record<string, unknown>[] = [];
  const updates: {
    id: string;
    entitled: number;
    accrued: number;
    carried_forward?: number;
  }[] = [];

  for (const member of staff) {
    const onProbation = isOnProbation(member.probation_status);
    const phCredits = phCreditsByStaff.get(member.id) ?? 0;
    for (const code of BALANCE_TRACKED_CODES) {
      const seed = seedEntitlementForType(
        code,
        member.joining_date,
        year,
        policy,
        {
          onProbation,
          phReplacementCredits: phCredits,
          terminationDate: member.termination_date,
        },
      );
      const openingCarry = canCarryForwardLeaveCode(code)
        ? computeOpeningCarryForward({
            code,
            joiningDate: member.joining_date,
            leaveYear: year,
            policy,
            priorBalance: priorByKey.get(`${member.id}:${code}`) ?? null,
            terminationDate: member.termination_date,
          })
        : 0;
      const key = `${member.id}:${code}`;
      const current = byKey.get(key);
      if (!current) {
        inserts.push({
          venue_id: venue.id,
          staff_id: member.id,
          leave_year: year,
          leave_type_code: code,
          entitled: seed.entitled,
          accrued: seed.accrued,
          used: 0,
          scheduled: 0,
          pending: 0,
          carried_forward: openingCarry,
          expired: 0,
          adjusted: 0,
          updated_at: now,
        });
        created += 1;
        continue;
      }

      const isPhRepl = code === "PH-REPL";
      const isAl = code === "AL";
      const usageQuiet =
        current.used === 0 &&
        current.scheduled === 0 &&
        current.pending === 0 &&
        current.adjusted === 0 &&
        current.expired === 0;

      // AL / PH-REPL always resync entitled/accrued (carry must not freeze them).
      // Other types only refresh when unused.
      const shouldRefreshEntitlement =
        isPhRepl || isAl || usageQuiet;

      const next: {
        id: string;
        entitled: number;
        accrued: number;
        carried_forward?: number;
      } = {
        id: current.id,
        entitled: seed.entitled,
        accrued: seed.accrued,
      };

      // Auto-seed carried over once when still zero and HR has not overridden it.
      if (
        canCarryForwardLeaveCode(code) &&
        current.carried_forward === 0 &&
        openingCarry > 0 &&
        !carriedOverrideIds.has(current.id)
      ) {
        next.carried_forward = openingCarry;
      }

      const entitlementChanged =
        current.entitled !== next.entitled || current.accrued !== next.accrued;
      const carryChanged =
        next.carried_forward != null &&
        next.carried_forward !== current.carried_forward;

      if ((shouldRefreshEntitlement && entitlementChanged) || carryChanged) {
        if (!shouldRefreshEntitlement) {
          next.entitled = current.entitled;
          next.accrued = current.accrued;
        }
        updates.push(next);
        updated += 1;
      }
    }
  }

  if (inserts.length > 0) {
    const { error } = await service.from("hr_leave_balances").insert(inserts);
    if (error) return { error: error.message, created: 0, updated: 0 };
  }

  for (const u of updates) {
    const patch: Record<string, unknown> = {
      entitled: u.entitled,
      accrued: u.accrued,
      updated_at: now,
    };
    if (u.carried_forward != null) {
      patch.carried_forward = u.carried_forward;
    }
    const { error } = await service
      .from("hr_leave_balances")
      .update(patch)
      .eq("id", u.id);
    if (error) return { error: error.message, created, updated: 0 };
  }

  return { created, updated };
}

/**
 * Resync only PH-REPL entitled/accrued from roster × public holidays.
 * Call after roster edits or public-holiday settings changes so credits stay
 * automatic when an employee has SHIFT on a configured PH day.
 */
export async function syncPhReplacementBalancesForYear(
  leaveYear?: number,
): Promise<{ error?: string; updated: number; created: number }> {
  const { supabase, venue, permissions } = await getAuthContext();

  if (
    !canEditSchedules(permissions, venue.id) &&
    !canEditStaff(permissions, venue.id) &&
    !canAdminLookups(permissions, venue.id)
  ) {
    return {
      error: "You do not have permission to sync leave balances.",
      updated: 0,
      created: 0,
    };
  }

  const year = leaveYear ?? currentLeaveYear();
  const staff = await listStaffForVenue(supabase, venue.id);
  const service = createServiceClient();

  const holidays = await listPublicHolidays(supabase, venue.id, { year });
  const holidayDates = (holidays ?? []).map((h) => h.holidayDate.slice(0, 10));
  const holidaySet = new Set(holidayDates);

  const phCreditsByStaff = new Map<string, number>();
  if (holidayDates.length > 0 && staff.length > 0) {
    const scheduleDays = await listStaffScheduleDays(supabase, venue.id, {
      staffIds: staff.map((s) => s.id),
      fromDate: `${year}-01-01`,
      toDate: `${year}-12-31`,
    });
    const daysByStaff = new Map<
      string,
      Array<{ work_date: string; label_code: string }>
    >();
    for (const day of scheduleDays) {
      if (!holidaySet.has(String(day.work_date).slice(0, 10))) continue;
      const list = daysByStaff.get(day.staff_id) ?? [];
      list.push({
        work_date: day.work_date,
        label_code: day.label_code,
      });
      daysByStaff.set(day.staff_id, list);
    }
    for (const member of staff) {
      phCreditsByStaff.set(
        member.id,
        countPhReplacementCredits({
          holidayDates: holidaySet,
          scheduleDays: daysByStaff.get(member.id) ?? [],
        }),
      );
    }
  }

  const { data: existing, error: existingError } = await service
    .from("hr_leave_balances")
    .select("*")
    .eq("venue_id", venue.id)
    .eq("leave_year", year)
    .eq("leave_type_code", "PH-REPL");

  if (existingError) {
    return { error: existingError.message, updated: 0, created: 0 };
  }

  const byStaff = new Map<string, HrLeaveBalance>();
  for (const row of existing ?? []) {
    const bal = normalizeBalance(row as Record<string, unknown>);
    byStaff.set(bal.staff_id, bal);
  }

  const now = new Date().toISOString();
  let created = 0;
  let updated = 0;
  const inserts: Record<string, unknown>[] = [];

  for (const member of staff) {
    const credits = phCreditsByStaff.get(member.id) ?? 0;
    const current = byStaff.get(member.id);
    if (!current) {
      inserts.push({
        venue_id: venue.id,
        staff_id: member.id,
        leave_year: year,
        leave_type_code: "PH-REPL",
        entitled: credits,
        accrued: credits,
        used: 0,
        scheduled: 0,
        pending: 0,
        carried_forward: 0,
        expired: 0,
        adjusted: 0,
        updated_at: now,
      });
      created += 1;
      continue;
    }
    if (current.entitled !== credits || current.accrued !== credits) {
      const { error } = await service
        .from("hr_leave_balances")
        .update({
          entitled: credits,
          accrued: credits,
          updated_at: now,
        })
        .eq("id", current.id);
      if (error) return { error: error.message, updated, created };
      updated += 1;
    }
  }

  if (inserts.length > 0) {
    const { error } = await service.from("hr_leave_balances").insert(inserts);
    if (error) return { error: error.message, updated, created: 0 };
  }

  return { updated, created };
}

export async function listLeaveBalanceSummaries(
  leaveYear?: number,
): Promise<{
  error?: string;
  year: number;
  policy: HrLeavePolicySettings;
  summaries: EmployeeLeaveSummary[];
}> {
  const { supabase, venue, permissions } = await getAuthContext();

  if (!canViewStaff(permissions, venue.id)) {
    return {
      error: "You do not have permission to view leave balances.",
      year: leaveYear ?? currentLeaveYear(),
      policy: DEFAULT_HR_LEAVE_POLICY_SETTINGS,
      summaries: [],
    };
  }

  const year = leaveYear ?? currentLeaveYear();
  const policy = await getLeavePolicySettings();

  // Ensure rows exist so the table is useful on first visit.
  if (canEditStaff(permissions, venue.id) || canAdminLookups(permissions, venue.id)) {
    await ensureLeaveBalancesForYear(year);
  }

  const staff = await listStaffForVenue(supabase, venue.id);
  const { data, error } = await supabase
    .from("hr_leave_balances")
    .select("*")
    .eq("venue_id", venue.id)
    .eq("leave_year", year);

  if (error) {
    return {
      error: error.message,
      year,
      policy,
      summaries: [],
    };
  }

  const balances = (data ?? []).map((r) =>
    normalizeBalance(r as Record<string, unknown>),
  );
  const byStaff = new Map<string, HrLeaveBalance[]>();
  for (const bal of balances) {
    const list = byStaff.get(bal.staff_id) ?? [];
    list.push(bal);
    byStaff.set(bal.staff_id, list);
  }

  const scheduleDaysByStaff = new Map<
    string,
    Array<{ label_code: string; work_date: string }>
  >();
  if (staff.length > 0) {
    const scheduleDays = await listStaffScheduleDays(supabase, venue.id, {
      staffIds: staff.map((s) => s.id),
      fromDate: `${year}-01-01`,
      toDate: `${year}-12-31`,
    });
    const tracked = new Set(["UPL", "ABS", "PH-REPL", "AL", "LP", "SL"]);
    for (const day of scheduleDays) {
      if (!tracked.has(day.label_code)) continue;
      const list = scheduleDaysByStaff.get(day.staff_id) ?? [];
      list.push({
        label_code: day.label_code,
        work_date: String(day.work_date).slice(0, 10),
      });
      scheduleDaysByStaff.set(day.staff_id, list);
    }
  }

  const summaries = staff.map((member) =>
    buildEmployeeLeaveSummary(member, byStaff.get(member.id) ?? [], policy, {
      scheduleDays: scheduleDaysByStaff.get(member.id) ?? [],
    }),
  );

  return { year, policy, summaries };
}

export async function getEmployeeLeaveBalances(input: {
  staffId: string;
  leaveYear?: number;
}): Promise<{
  error?: string;
  year: number;
  policy: HrLeavePolicySettings;
  staff: {
    id: string;
    emp_no: string;
    full_name: string;
    joining_date: string | null;
    termination_date: string | null;
    probation_status: string | null;
    photo_url: string | null;
    department: { name: string } | null;
  } | null;
  balances: HrLeaveBalance[];
  adjustments: HrLeaveBalanceAdjustment[];
  scheduledLeaves: ScheduledLeaveRange[];
  scheduleLabels: ScheduledLeaveLabelStyle[];
}> {
  const { supabase, venue, permissions } = await getAuthContext();
  const year = input.leaveYear ?? currentLeaveYear();
  const policy = await getLeavePolicySettings();

  if (!canViewStaff(permissions, venue.id)) {
    return {
      error: "You do not have permission to view leave balances.",
      year,
      policy,
      staff: null,
      balances: [],
      adjustments: [],
      scheduledLeaves: [],
      scheduleLabels: [],
    };
  }

  if (canEditStaff(permissions, venue.id) || canAdminLookups(permissions, venue.id)) {
    await ensureLeaveBalancesForYear(year);
  }

  const { data: staffRow, error: staffError } = await supabase
    .from("staff")
    .select(
      "id, emp_no, full_name, joining_date, termination_date, probation_status, photo_url, department:departments(name)",
    )
    .eq("id", input.staffId)
    .eq("home_venue_id", venue.id)
    .maybeSingle();

  if (staffError || !staffRow) {
    return {
      error: staffError?.message ?? "Employee not found.",
      year,
      policy,
      staff: null,
      balances: [],
      adjustments: [],
      scheduledLeaves: [],
      scheduleLabels: [],
    };
  }

  const { data, error } = await supabase
    .from("hr_leave_balances")
    .select("*")
    .eq("venue_id", venue.id)
    .eq("staff_id", input.staffId)
    .eq("leave_year", year)
    .order("leave_type_code");

  if (error) {
    return {
      error: error.message,
      year,
      policy,
      staff: null,
      balances: [],
      adjustments: [],
      scheduledLeaves: [],
      scheduleLabels: [],
    };
  }

  const balances = (data ?? []).map((r) =>
    normalizeBalance(r as Record<string, unknown>),
  );
  const balanceIds = balances.map((b) => b.id);

  let adjustments: HrLeaveBalanceAdjustment[] = [];
  if (balanceIds.length > 0) {
    const { data: adj } = await supabase
      .from("hr_leave_balance_adjustments")
      .select("*")
      .in("balance_id", balanceIds)
      .order("created_at", { ascending: false })
      .limit(50);
    adjustments = (adj ?? []).map((a) => ({
      id: String(a.id),
      venue_id: String(a.venue_id),
      balance_id: String(a.balance_id),
      field: String(a.field),
      previous_value: toNumber(a.previous_value),
      new_value: toNumber(a.new_value),
      reason: String(a.reason),
      author_id: a.author_id ? String(a.author_id) : null,
      created_at: String(a.created_at),
    }));
  }

  const [scheduleDays, labelsFromDb] = await Promise.all([
    listStaffScheduleDays(supabase, venue.id, {
      staffIds: [input.staffId],
      fromDate: `${year}-01-01`,
      toDate: `${year}-12-31`,
    }),
    listScheduleDayLabels(supabase),
  ]);

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

  const terminationDate = staffRow.termination_date
    ? String(staffRow.termination_date).slice(0, 10)
    : null;

  // Post-termination roster days are invalid — exclude from leave list + balances.
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

  const leaveDays = employmentScheduleDays
    .filter(
      (d) =>
        isScheduleLeaveLabel(d.label_code) || d.label_code === "ABS",
    )
    .map((d) => ({
      workDate: String(d.work_date).slice(0, 10),
      labelCode: normalizeScheduleLeaveCode(d.label_code),
    }));

  const scheduledLeaves = groupScheduledLeaveRanges(leaveDays);

  // Attach approval status from matching leave requests (roster-only → "scheduled"),
  // then override to "approved" when Validation / attendance days are approved.
  const service = createServiceClient();
  const [leaveTypes, requestsResult, attendanceDays] = await Promise.all([
    listActiveLeaveTypes(service),
    service
      .from("hr_leave_requests")
      .select("id, leave_type_id, start_date, end_date, status")
      .eq("venue_id", venue.id)
      .eq("employee_id", input.staffId)
      .lte("start_date", `${year}-12-31`)
      .gte("end_date", `${year}-01-01`)
      .not("status", "eq", "cancelled"),
    listAttendanceDaysForStaff(supabase, venue.id, {
      staffIds: [input.staffId],
      empNos: [String(staffRow.emp_no)],
      fromDate: `${year}-01-01`,
      toDate: `${year}-12-31`,
    }),
  ]);

  const attendanceApprovedByDate = new Map<string, boolean>();
  for (const day of attendanceDays) {
    const workDate = String(day.work_date).slice(0, 10);
    attendanceApprovedByDate.set(
      workDate,
      day.approval_status === ATTENDANCE_APPROVED_STATUS,
    );
  }

  const typeById = new Map(leaveTypes.map((t) => [t.id, t] as const));
  const matchedRequestIds = new Set<string>();
  type RequestMatch = {
    id: string;
    leave_type_id: string;
    start_date: string;
    end_date: string;
    status: string;
  };
  const requests = (requestsResult.data ?? []) as RequestMatch[];
  if (requestsResult.error) {
    console.error(
      "[leave] employee scheduled leave requests:",
      requestsResult.error.message,
    );
  }

  for (const range of scheduledLeaves) {
    const match = requests.find((req) => {
      if (matchedRequestIds.has(req.id)) return false;
      const type = typeById.get(req.leave_type_id);
      const code = type ? scheduleCodeForType(type) : "";
      if (code !== range.labelCode) return false;
      return dateRangesOverlap(
        req.start_date.slice(0, 10),
        req.end_date.slice(0, 10),
        range.fromDate,
        range.toDate,
      );
    });
    if (match) {
      matchedRequestIds.add(match.id);
      range.approvalStatus = normalizeLeaveCalendarStatus(match.status);
      range.requestId = match.id;
    } else {
      range.approvalStatus = "scheduled";
      range.requestId = null;
    }

    const rangeDates = eachIsoDateInRange(range.fromDate, range.toDate);
    const allAttendanceApproved =
      rangeDates.length > 0 &&
      rangeDates.every((date) => attendanceApprovedByDate.get(date) === true);
    if (allAttendanceApproved) {
      range.approvalStatus = "approved";
    }
  }

  // Live used / scheduled from roster; pending from requests not yet on the roster.
  const balancesWithRoster = overlayBalanceUsageFromSchedule({
    balances,
    scheduleDays: employmentScheduleRefs,
    policy,
    leaveYear: year,
    staffId: input.staffId,
    venueId: venue.id,
    terminationDate,
    pendingRequests: requests.map((req) => {
      const type = typeById.get(req.leave_type_id);
      return {
        scheduleCode: type ? scheduleCodeForType(type) : "",
        startDate: req.start_date.slice(0, 10),
        endDate: req.end_date.slice(0, 10),
        status: req.status,
      };
    }),
  });

  const dept = staffRow.department as { name: string } | { name: string }[] | null;
  const department =
    Array.isArray(dept) ? dept[0] ?? null : dept;

  return {
    year,
    policy,
    staff: {
      id: String(staffRow.id),
      emp_no: String(staffRow.emp_no),
      full_name: String(staffRow.full_name),
      joining_date: staffRow.joining_date
        ? String(staffRow.joining_date)
        : null,
      termination_date: staffRow.termination_date
        ? String(staffRow.termination_date)
        : null,
      probation_status: staffRow.probation_status
        ? String(staffRow.probation_status)
        : null,
      photo_url: staffRow.photo_url ? String(staffRow.photo_url) : null,
      department,
    },
    balances: balancesWithRoster,
    adjustments,
    scheduledLeaves,
    scheduleLabels,
  };
}

/**
 * Carry remaining AL / PH-REPL from `fromYear` into `fromYear + 1` as carried_forward,
 * capped by policy.carryForwardMaxDays.
 */
export async function carryForwardLeaveBalances(input: {
  fromYear: number;
  reason: string;
}): Promise<{ error?: string; carried: number; skipped: number }> {
  const { user, venue, permissions } = await getAuthContext();

  if (!canEditStaff(permissions, venue.id) && !canAdminLookups(permissions, venue.id)) {
    return { error: "You do not have permission to carry forward balances.", carried: 0, skipped: 0 };
  }

  const reason = input.reason.trim();
  if (!reason) {
    return { error: "A reason is required for carry-forward.", carried: 0, skipped: 0 };
  }

  const fromYear = input.fromYear;
  const toYear = fromYear + 1;
  const policy = await getLeavePolicySettings();

  if (policy.annual.carryForwardMaxDays <= 0) {
    return {
      error:
        "Carry-forward is disabled (max days is 0). Raise the limit in Leave Policy settings first.",
      carried: 0,
      skipped: 0,
    };
  }

  await ensureLeaveBalancesForYear(fromYear);
  await ensureLeaveBalancesForYear(toYear);

  const service = createServiceClient();
  const carryCodes = ["AL", "PH-REPL"] as const;

  const { data: fromRows, error: fromError } = await service
    .from("hr_leave_balances")
    .select("*")
    .eq("venue_id", venue.id)
    .eq("leave_year", fromYear)
    .in("leave_type_code", [...carryCodes]);

  if (fromError) {
    return { error: fromError.message, carried: 0, skipped: 0 };
  }

  const { data: toRows, error: toError } = await service
    .from("hr_leave_balances")
    .select("*")
    .eq("venue_id", venue.id)
    .eq("leave_year", toYear)
    .in("leave_type_code", [...carryCodes]);

  if (toError) {
    return { error: toError.message, carried: 0, skipped: 0 };
  }

  const toByKey = new Map<string, HrLeaveBalance>();
  for (const row of toRows ?? []) {
    const bal = normalizeBalance(row as Record<string, unknown>);
    toByKey.set(`${bal.staff_id}:${bal.leave_type_code}`, bal);
  }

  let carried = 0;
  let skipped = 0;
  const now = new Date().toISOString();

  for (const row of fromRows ?? []) {
    const fromBal = normalizeBalance(row as Record<string, unknown>);
    const available = availableBalance(fromBal);
    const amount = carryForwardAmount(available, policy.annual);
    if (amount <= 0) {
      skipped += 1;
      continue;
    }

    const toBal = toByKey.get(`${fromBal.staff_id}:${fromBal.leave_type_code}`);
    if (!toBal) {
      skipped += 1;
      continue;
    }

    const previous = toBal.carried_forward;
    const next = previous + amount;

    const { error: updError } = await service
      .from("hr_leave_balances")
      .update({ carried_forward: next, updated_at: now })
      .eq("id", toBal.id);
    if (updError) {
      return { error: updError.message, carried, skipped };
    }

    await service.from("hr_leave_balance_adjustments").insert({
      venue_id: venue.id,
      balance_id: toBal.id,
      field: "carried_forward",
      previous_value: previous,
      new_value: next,
      reason: `Carry forward ${fromBal.leave_type_code} from ${fromYear}: ${reason}`,
      author_id: user.id,
    });

    // Mark expired remainder on source year (available − carried).
    const expiredAdd = Math.max(0, available - amount);
    if (expiredAdd > 0) {
      const prevExpired = fromBal.expired;
      const nextExpired = prevExpired + expiredAdd;
      await service
        .from("hr_leave_balances")
        .update({ expired: nextExpired, updated_at: now })
        .eq("id", fromBal.id);
      await service.from("hr_leave_balance_adjustments").insert({
        venue_id: venue.id,
        balance_id: fromBal.id,
        field: "expired",
        previous_value: prevExpired,
        new_value: nextExpired,
        reason: `Expired after carry forward to ${toYear}: ${reason}`,
        author_id: user.id,
      });
    }

    carried += 1;
  }

  await writeAuditLog({
    actor_id: user.id,
    action: "update",
    module_key: HR_MODULE_KEY,
    entity: "hr_leave_balances",
    entity_id: `carry_forward_${fromYear}_${toYear}`,
    venue_id: venue.id,
    after: { fromYear, toYear, carried, skipped, reason, codes: carryCodes },
  });

  revalidatePath("/hr/attendance/leave", "layout");
  return { carried, skipped };
}

export async function adjustLeaveBalance(input: {
  balanceId: string;
  delta: number;
  reason: string;
  /** Defaults to adjusted. Use carried_forward for AL / PH-REPL opening overrides. */
  field?: "adjusted" | "carried_forward";
}): Promise<{ error?: string }> {
  const { user, venue, permissions } = await getAuthContext();

  if (!canEditStaff(permissions, venue.id) && !canAdminLookups(permissions, venue.id)) {
    return { error: "You do not have permission to adjust leave balances." };
  }

  const reason = input.reason.trim();
  if (!reason) return { error: "A reason is required for adjustments." };
  if (!Number.isFinite(input.delta) || input.delta === 0) {
    return { error: "Adjustment delta must be a non-zero number." };
  }

  const field = input.field ?? "adjusted";
  if (field !== "adjusted" && field !== "carried_forward") {
    return { error: "Invalid adjustment field." };
  }

  const service = createServiceClient();
  const { data: row, error } = await service
    .from("hr_leave_balances")
    .select("*")
    .eq("id", input.balanceId)
    .eq("venue_id", venue.id)
    .maybeSingle();

  if (error || !row) {
    return { error: error?.message ?? "Balance not found." };
  }

  const bal = normalizeBalance(row as Record<string, unknown>);
  if (field === "carried_forward" && !canCarryForwardLeaveCode(bal.leave_type_code)) {
    return {
      error: "Only AL and Public Holiday (PH-REPL) can carry days between years.",
    };
  }

  const previous = field === "carried_forward" ? bal.carried_forward : bal.adjusted;
  const next = previous + input.delta;
  if (field === "carried_forward" && next < 0) {
    return { error: "Carried over days cannot go below zero." };
  }

  const now = new Date().toISOString();

  const { error: updError } = await service
    .from("hr_leave_balances")
    .update({ [field]: next, updated_at: now })
    .eq("id", bal.id);

  if (updError) return { error: updError.message };

  await service.from("hr_leave_balance_adjustments").insert({
    venue_id: venue.id,
    balance_id: bal.id,
    field,
    previous_value: previous,
    new_value: next,
    reason,
    author_id: user.id,
  });

  await writeAuditLog({
    actor_id: user.id,
    action: "update",
    module_key: HR_MODULE_KEY,
    entity: "hr_leave_balances",
    entity_id: bal.id,
    venue_id: venue.id,
    after: { field, previous, next, reason },
  });

  revalidatePath("/hr/attendance/leave", "layout");
  return {};
}

/** Dates the employee earned PH-REPL by working on a public holiday. */
export async function getStaffPhReplacementCredits(input: {
  staffId: string;
  leaveYear?: number;
}): Promise<{
  error?: string;
  year: number;
  staffName: string | null;
  empNo: string | null;
  credits: PhReplacementCreditEntry[];
}> {
  const { supabase, venue, permissions } = await getAuthContext();
  const year = input.leaveYear ?? currentLeaveYear();

  if (!canViewStaff(permissions, venue.id)) {
    return {
      error: "You do not have permission to view leave balances.",
      year,
      staffName: null,
      empNo: null,
      credits: [],
    };
  }

  const { data: staffRow, error: staffError } = await supabase
    .from("staff")
    .select("id, emp_no, full_name")
    .eq("id", input.staffId)
    .eq("home_venue_id", venue.id)
    .maybeSingle();

  if (staffError || !staffRow) {
    return {
      error: staffError?.message ?? "Employee not found.",
      year,
      staffName: null,
      empNo: null,
      credits: [],
    };
  }

  const holidays = await listPublicHolidays(supabase, venue.id, { year });
  const holidayList = holidays ?? [];
  const holidayDates = holidayList.map((h) => h.holidayDate.slice(0, 10));
  const nameByDate = new Map(
    holidayList.map((h) => [h.holidayDate.slice(0, 10), h.name] as const),
  );

  const scheduleDays = await listStaffScheduleDays(supabase, venue.id, {
    staffIds: [input.staffId],
    fromDate: `${year}-01-01`,
    toDate: `${year}-12-31`,
  });

  const dayRows = scheduleDays.map((d) => ({
    work_date: String(d.work_date).slice(0, 10),
    label_code: d.label_code,
  }));

  const creditedDates = listPhReplacementCreditDates({
    holidayDates,
    scheduleDays: dayRows,
  });
  const creditedSet = new Set(creditedDates);

  const labelByDate = new Map<string, string>();
  for (const day of dayRows) {
    if (!creditedSet.has(day.work_date)) continue;
    if (!PH_WORKED_LABEL_CODES.has(day.label_code)) continue;
    labelByDate.set(day.work_date, day.label_code);
  }

  const credits: PhReplacementCreditEntry[] = creditedDates.map((date) => ({
    date,
    holidayName: nameByDate.get(date) ?? null,
    labelCode: labelByDate.get(date) ?? "SHIFT",
  }));

  return {
    year,
    staffName: String(staffRow.full_name),
    empNo: String(staffRow.emp_no),
    credits,
  };
}

/** Roster dates that make up a leave-balances usage cell. */
export async function getStaffLeaveUsageDays(input: {
  staffId: string;
  leaveYear?: number;
  kind: LeaveUsageKind;
}): Promise<{
  error?: string;
  year: number;
  kind: LeaveUsageKind;
  title: string;
  description: string;
  staffName: string | null;
  empNo: string | null;
  days: LeaveUsageDayEntry[];
}> {
  const { supabase, venue, permissions } = await getAuthContext();
  const year = input.leaveYear ?? currentLeaveYear();
  const titles: Record<LeaveUsageKind, { title: string; description: string }> =
    {
      "ph-used": {
        title: "PH-REPL used",
        description:
          "Replacement days taken from the roster (PH-REPL) in this leave year.",
      },
      "al-used": {
        title: "Annual leave used",
        description: "Annual leave days already taken (roster AL before today).",
      },
      "al-scheduled": {
        title: "Annual leave scheduled",
        description:
          "Annual leave days still ahead on the roster (AL from today onward).",
      },
      "sick-fp": {
        title: "Sick leave — full pay",
        description:
          "Roster sick days allocated to the full-pay stage (policy order).",
      },
      "sick-hp": {
        title: "Sick leave — half pay",
        description:
          "Roster sick days allocated to the half-pay stage (policy order).",
      },
      "sick-up": {
        title: "Sick leave — unpaid",
        description:
          "Roster sick days allocated to the unpaid stage (policy order).",
      },
      "upl-used": {
        title: "Unpaid leave (UPL)",
        description: "Roster unpaid leave (UPL) days in this leave year.",
      },
      "abs-used": {
        title: "Unauthorised absence (ABS)",
        description:
          "Roster unauthorised absence (ABS) days in this leave year.",
      },
    };
  const meta = titles[input.kind];

  if (!canViewStaff(permissions, venue.id)) {
    return {
      error: "You do not have permission to view leave balances.",
      year,
      kind: input.kind,
      title: meta.title,
      description: meta.description,
      staffName: null,
      empNo: null,
      days: [],
    };
  }

  const { data: staffRow, error: staffError } = await supabase
    .from("staff")
    .select("id, emp_no, full_name")
    .eq("id", input.staffId)
    .eq("home_venue_id", venue.id)
    .maybeSingle();

  if (staffError || !staffRow) {
    return {
      error: staffError?.message ?? "Employee not found.",
      year,
      kind: input.kind,
      title: meta.title,
      description: meta.description,
      staffName: null,
      empNo: null,
      days: [],
    };
  }

  const policy = await getLeavePolicySettings();
  const scheduleDays = await listStaffScheduleDays(supabase, venue.id, {
    staffIds: [input.staffId],
    fromDate: `${year}-01-01`,
    toDate: `${year}-12-31`,
  });
  const refs = scheduleDays.map((d) => ({
    label_code: d.label_code,
    work_date: String(d.work_date).slice(0, 10),
  }));

  let dates: string[] = [];
  let labelCode = "";
  let detailFor = (_date: string): string | null => null;
  let daysOverride: LeaveUsageDayEntry[] | null = null;

  if (input.kind === "ph-used") {
    labelCode = "PH-REPL";
    dates = refs
      .filter((d) => d.label_code === "PH-REPL")
      .map((d) => d.work_date!)
      .sort();
  } else if (input.kind === "al-used" || input.kind === "al-scheduled") {
    labelCode = "AL";
    const split = splitAnnualLeaveScheduleDays(refs);
    dates =
      input.kind === "al-used" ? split.usedDates : split.scheduledDates;
  } else if (input.kind === "upl-used" || input.kind === "abs-used") {
    const code = input.kind === "upl-used" ? "UPL" : "ABS";
    daysOverride = refs
      .filter((d) => d.label_code === code)
      .map((d) => ({
        date: d.work_date!,
        labelCode: code,
        detail:
          code === "ABS" ? "Unauthorised absence" : "Unpaid leave",
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  } else {
    labelCode = "SL";
    const alloc = allocateSickLeaveScheduleDays(refs, policy.sick);
    dates =
      input.kind === "sick-fp"
        ? alloc.fpDates
        : input.kind === "sick-hp"
          ? alloc.hpDates
          : alloc.upDates;
    detailFor = () =>
      input.kind === "sick-fp"
        ? "Full pay"
        : input.kind === "sick-hp"
          ? "Half pay"
          : "Unpaid";
  }

  const days: LeaveUsageDayEntry[] =
    daysOverride ??
    dates.map((date) => ({
      date,
      labelCode,
      detail: detailFor(date),
    }));

  return {
    year,
    kind: input.kind,
    title: meta.title,
    description: meta.description,
    staffName: String(staffRow.full_name),
    empNo: String(staffRow.emp_no),
    days,
  };
}

// ---------------------------------------------------------------------------
// Leave calendar (month view)
// ---------------------------------------------------------------------------

type LeaveTypeRow = {
  id: string;
  code: string;
  name: string;
  schedule_code: string | null;
  colour: string | null;
  is_active: boolean;
};

function monthBounds(year: number, month: number): { fromDate: string; toDate: string } {
  const fromDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const toDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { fromDate, toDate };
}

function expandMonthWindow(fromDate: string, toDate: string) {
  // Pull a few days on either side so multi-day leave spanning months still groups.
  return {
    fromDate: addCalendarDaysForLeave(fromDate, -14),
    toDate: addCalendarDaysForLeave(toDate, 14),
  };
}

/**
 * Prefer a single status for a roster span covered by several request rows
 * (e.g. Validation approved day-by-day → one UPL bar, many 1-day requests).
 */
function aggregateOverlappingRequestStatus(
  rawStatuses: Array<string | null | undefined>,
): ReturnType<typeof normalizeLeaveCalendarStatus> {
  const statuses = rawStatuses.map((s) => normalizeLeaveCalendarStatus(s));
  if (statuses.includes("rejected")) return "rejected";
  if (statuses.includes("pending")) return "pending";
  if (statuses.length > 0 && statuses.every((s) => s === "approved")) {
    return "approved";
  }
  if (statuses.includes("approved")) return "pending";
  if (statuses.includes("cancelled")) return "cancelled";
  return "scheduled";
}

/** Longest span first so a multi-day request wins over 1-day fragments. */
function pickPrimaryOverlappingRequest<
  T extends { start_date: string; end_date: string; id: string },
>(rows: T[]): T | null {
  if (rows.length === 0) return null;
  return [...rows].sort((a, b) => {
    const aDays = countInclusiveDays(
      a.start_date.slice(0, 10),
      a.end_date.slice(0, 10),
    );
    const bDays = countInclusiveDays(
      b.start_date.slice(0, 10),
      b.end_date.slice(0, 10),
    );
    if (aDays !== bDays) return bDays - aDays;
    if (a.start_date !== b.start_date) {
      return a.start_date.localeCompare(b.start_date);
    }
    return a.id.localeCompare(b.id);
  })[0]!;
}

/**
 * Collapse consecutive same-person / same-type request-only chips into one
 * bar so day-by-day leave requests still join on the calendar.
 */
function mergeAdjacentRequestOnlyEvents(
  events: LeaveCalendarEvent[],
): LeaveCalendarEvent[] {
  const scheduleBacked = events.filter((e) => e.source !== "request");
  const requestOnly = events
    .filter((e) => e.source === "request")
    .sort((a, b) => {
      if (a.staffId !== b.staffId) return a.staffId.localeCompare(b.staffId);
      if (a.labelCode !== b.labelCode) {
        return a.labelCode.localeCompare(b.labelCode);
      }
      if (a.status !== b.status) return a.status.localeCompare(b.status);
      return a.fromDate.localeCompare(b.fromDate);
    });

  const merged: LeaveCalendarEvent[] = [];
  for (const event of requestOnly) {
    const last = merged[merged.length - 1];
    if (
      last &&
      last.staffId === event.staffId &&
      last.labelCode === event.labelCode &&
      last.status === event.status &&
      addCalendarDaysForLeave(last.toDate, 1) === event.fromDate
    ) {
      last.toDate = event.toDate;
      last.days = countInclusiveDays(last.fromDate, last.toDate);
      continue;
    }
    merged.push({ ...event });
  }

  return [...scheduleBacked, ...merged];
}

function addCalendarDaysForLeave(isoDate: string, delta: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!m) return isoDate;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function listActiveLeaveTypes(
  service: ReturnType<typeof createServiceClient>,
): Promise<LeaveTypeRow[]> {
  const { data, error } = await service
    .from("hr_leave_types")
    .select("id, code, name, schedule_code, colour, is_active")
    .is("deleted_at", null)
    .order("display_order");
  if (error) {
    console.error("[leave] listActiveLeaveTypes:", error.message);
    return [];
  }
  return (data ?? []) as LeaveTypeRow[];
}

function scheduleCodeForType(type: LeaveTypeRow): string {
  const raw = (type.schedule_code || type.code || "").toUpperCase();
  return (
    policyCodeToScheduleLeaveCode(raw) ??
    normalizeScheduleLeaveCode(raw)
  );
}

/** Resolve hr_leave_types row for a roster leave label (handles PHRL ↔ PH-REPL). */
function findLeaveTypeForScheduleLabel(
  leaveTypes: LeaveTypeRow[],
  labelCode: string,
): LeaveTypeRow | undefined {
  const want = normalizeScheduleLeaveCode(labelCode);
  return (
    leaveTypes.find((t) => scheduleCodeForType(t) === want) ??
    leaveTypes.find((t) => normalizeScheduleLeaveCode(t.code) === want) ??
    leaveTypes.find((t) => t.code.toUpperCase() === labelCode.toUpperCase())
  );
}

async function nextLeaveRequestNumber(
  service: ReturnType<typeof createServiceClient>,
  venueId: string,
  year: number,
): Promise<string> {
  const prefix = `LV-${year}-`;
  const { data } = await service
    .from("hr_leave_requests")
    .select("request_number")
    .eq("venue_id", venueId)
    .like("request_number", `${prefix}%`)
    .order("request_number", { ascending: false })
    .limit(1);
  const latest = data?.[0]?.request_number as string | undefined;
  const n = latest ? Number(latest.slice(prefix.length)) : 0;
  const next = Number.isFinite(n) ? n + 1 : 1;
  return `${prefix}${String(next).padStart(5, "0")}`;
}

async function syncLeaveRangeToSchedule(params: {
  service: ReturnType<typeof createServiceClient>;
  venueId: string;
  userId: string;
  staffId: string;
  empNo: string;
  departmentId: string | null;
  labelCode: string;
  fromDate: string;
  toDate: string;
  previousFrom?: string | null;
  previousTo?: string | null;
  previousLabel?: string | null;
}): Promise<{ error?: string }> {
  const {
    service,
    venueId,
    userId,
    staffId,
    empNo,
    departmentId,
    labelCode,
    fromDate,
    toDate,
    previousFrom,
    previousTo,
    previousLabel,
  } = params;

  const now = new Date().toISOString();
  const nextDates = new Set(eachIsoDateInRange(fromDate, toDate));
  const changes: {
    work_date: string;
    label_code: string | null;
  }[] = [];

  if (previousFrom && previousTo) {
    for (const date of eachIsoDateInRange(previousFrom, previousTo)) {
      if (nextDates.has(date)) continue;
      // Clear days that left the range (only if they still look like the old leave).
      changes.push({ work_date: date, label_code: null });
    }
  }

  for (const date of nextDates) {
    changes.push({ work_date: date, label_code: labelCode });
  }

  const toClear = changes.filter((c) => c.label_code === null).map((c) => c.work_date);
  if (toClear.length > 0) {
    // Prefer clearing only matching leave codes so we do not wipe unrelated edits.
    const clearCode = previousLabel
      ? normalizeScheduleLeaveCode(previousLabel)
      : null;
    let q = service
      .from("hr_schedule_days")
      .delete()
      .eq("venue_id", venueId)
      .eq("staff_id", staffId)
      .in("work_date", toClear);
    if (clearCode) {
      q = q.or(`label_code.eq.${clearCode},label_code.eq.LP`);
    }
    const { error } = await q;
    if (error) {
      console.error("[leave] clear schedule range:", error.message);
      return { error: "Could not update the schedule for the old leave dates." };
    }
  }

  const upserts = changes
    .filter((c) => c.label_code != null)
    .map((c) => ({
      venue_id: venueId,
      staff_id: staffId,
      emp_no: empNo,
      work_date: c.work_date,
      label_code: c.label_code!,
      shift_template_id: null,
      department_id: departmentId,
      source: "manual" as const,
      updated_by: userId,
      updated_at: now,
    }));

  if (upserts.length > 0) {
    const { error } = await service
      .from("hr_schedule_days")
      .upsert(upserts, { onConflict: "staff_id,work_date" });
    if (error) {
      console.error("[leave] upsert schedule range:", error.message);
      return { error: "Could not write leave days onto the schedule." };
    }
  }

  return {};
}

export async function getLeaveCalendarMonth(input: {
  year: number;
  month: number;
}): Promise<{
  error?: string;
  year: number;
  month: number;
  events: LeaveCalendarEvent[];
  labels: ScheduledLeaveLabelStyle[];
  leaveTypes: Array<{
    code: string;
    name: string;
    leaveTypeId: string | null;
    bgColor: string;
    textColor: string;
    borderColor: string;
  }>;
  departments: Array<{ id: string; name: string }>;
  canManage: boolean;
}> {
  const { supabase, venue, permissions } = await getAuthContext();
  const year = input.year;
  const month = input.month;

  if (!canViewStaff(permissions, venue.id)) {
    return {
      error: "You do not have permission to view the leave calendar.",
      year,
      month,
      events: [],
      labels: [],
      leaveTypes: [],
      departments: [],
      canManage: false,
    };
  }

  const canManage =
    canEditStaff(permissions, venue.id) ||
    canAdminLookups(permissions, venue.id) ||
    canEditSchedules(permissions, venue.id);

  const { fromDate, toDate } = monthBounds(year, month);
  const window = expandMonthWindow(fromDate, toDate);

  const service = createServiceClient();
  const [staff, scheduleDays, labelsFromDb, leaveTypes, requestsResult, departments] =
    await Promise.all([
      listStaffForVenue(supabase, venue.id),
      listScheduleDaysByDateRange(supabase, venue.id, window),
      listScheduleDayLabels(supabase),
      listActiveLeaveTypes(service),
      service
        .from("hr_leave_requests")
        .select(
          "id, employee_id, leave_type_id, start_date, end_date, calendar_days, status, reason, employee_notes, hr_notes, source, schedule_status",
        )
        .eq("venue_id", venue.id)
        .lte("start_date", window.toDate)
        .gte("end_date", window.fromDate)
        .not("status", "eq", "cancelled"),
      supabase
        .from("departments")
        .select("id, name")
        .eq("venue_id", venue.id)
        .order("sort_order"),
    ]);

  const labels = withFallbackScheduleLabelIds(
    labelsFromDb && labelsFromDb.length > 0
      ? labelsFromDb
      : DEFAULT_SCHEDULE_DAY_LABELS,
  );
  const labelByCode = new Map(
    labels.map((l) => [normalizeScheduleLeaveCode(l.code), l] as const),
  );

  const typeById = new Map(leaveTypes.map((t) => [t.id, t] as const));
  const typeByScheduleCode = new Map<string, LeaveTypeRow>();
  for (const t of leaveTypes) {
    const code = scheduleCodeForType(t);
    if (code) typeByScheduleCode.set(code, t);
  }

  const staffById = new Map(staff.map((s) => [s.id, s] as const));

  // Group schedule leave per staff.
  const leaveDaysByStaff = new Map<
    string,
    Array<{ workDate: string; labelCode: string }>
  >();
  for (const day of scheduleDays) {
    if (!isScheduleLeaveLabel(day.label_code)) continue;
    const list = leaveDaysByStaff.get(day.staff_id) ?? [];
    list.push({
      workDate: String(day.work_date).slice(0, 10),
      labelCode: normalizeScheduleLeaveCode(day.label_code),
    });
    leaveDaysByStaff.set(day.staff_id, list);
  }

  const scheduleRanges: Array<{
    staffId: string;
    labelCode: string;
    fromDate: string;
    toDate: string;
    days: number;
  }> = [];
  for (const [staffId, days] of leaveDaysByStaff) {
    for (const range of groupScheduledLeaveRanges(days)) {
      if (!dateRangesOverlap(range.fromDate, range.toDate, fromDate, toDate)) {
        continue;
      }
      scheduleRanges.push({ staffId, ...range });
    }
  }

  type RequestRow = {
    id: string;
    employee_id: string;
    leave_type_id: string;
    start_date: string;
    end_date: string;
    calendar_days: number | null;
    status: string;
    reason: string | null;
    employee_notes: string | null;
    hr_notes: string | null;
    source: string | null;
    schedule_status: string | null;
  };

  const requests = (requestsResult.data ?? []) as RequestRow[];
  if (requestsResult.error) {
    console.error("[leave] calendar requests:", requestsResult.error.message);
  }

  const matchedRequestIds = new Set<string>();
  const events: LeaveCalendarEvent[] = [];

  for (const range of scheduleRanges) {
    const member = staffById.get(range.staffId);
    if (!member) continue;

    // Collect every overlapping request — day-by-day Validation mirrors leave
    // many 1-day rows under one continuous roster span. Matching only the first
    // left the rest as duplicate unjoined chips on the calendar.
    const overlapping = requests.filter((req) => {
      if (matchedRequestIds.has(req.id)) return false;
      if (req.employee_id !== range.staffId) return false;
      const type = typeById.get(req.leave_type_id);
      const code = type ? scheduleCodeForType(type) : "";
      if (code !== range.labelCode) return false;
      return dateRangesOverlap(
        req.start_date.slice(0, 10),
        req.end_date.slice(0, 10),
        range.fromDate,
        range.toDate,
      );
    });

    for (const req of overlapping) matchedRequestIds.add(req.id);
    const match = pickPrimaryOverlappingRequest(overlapping);

    const notes =
      match?.hr_notes?.trim() ||
      match?.reason?.trim() ||
      match?.employee_notes?.trim() ||
      null;

    events.push({
      id: match
        ? match.id
        : `schedule:${range.staffId}:${range.fromDate}:${range.toDate}:${range.labelCode}`,
      requestId: match?.id ?? null,
      staffId: range.staffId,
      empNo: member.emp_no,
      fullName: member.full_name,
      departmentId: member.department_id,
      departmentName: member.department?.name ?? null,
      labelCode: range.labelCode,
      leaveTypeId: match?.leave_type_id ?? typeByScheduleCode.get(range.labelCode)?.id ?? null,
      fromDate: range.fromDate,
      toDate: range.toDate,
      days: range.days,
      status:
        overlapping.length > 0
          ? aggregateOverlappingRequestStatus(overlapping.map((r) => r.status))
          : "scheduled",
      rawStatus: match?.status ?? null,
      notes,
      onSchedule: true,
      source: match ? "both" : "schedule",
    });
  }

  // Requests in the month that are not yet (or no longer) on the roster.
  for (const req of requests) {
    if (matchedRequestIds.has(req.id)) continue;
    const member = staffById.get(req.employee_id);
    if (!member) continue;
    const type = typeById.get(req.leave_type_id);
    const labelCode = type
      ? scheduleCodeForType(type)
      : "AL";
    const start = req.start_date.slice(0, 10);
    const end = req.end_date.slice(0, 10);
    if (!dateRangesOverlap(start, end, fromDate, toDate)) continue;

    events.push({
      id: req.id,
      requestId: req.id,
      staffId: req.employee_id,
      empNo: member.emp_no,
      fullName: member.full_name,
      departmentId: member.department_id,
      departmentName: member.department?.name ?? null,
      labelCode,
      leaveTypeId: req.leave_type_id,
      fromDate: start,
      toDate: end,
      days: Number(req.calendar_days) || countInclusiveDays(start, end),
      status: normalizeLeaveCalendarStatus(req.status),
      rawStatus: req.status,
      notes:
        req.hr_notes?.trim() ||
        req.reason?.trim() ||
        req.employee_notes?.trim() ||
        null,
      onSchedule: req.schedule_status === "synced",
      source: "request",
    });
  }

  const mergedEvents = mergeAdjacentRequestOnlyEvents(events);
  mergedEvents.sort((a, b) =>
    a.fromDate === b.fromDate
      ? a.fullName.localeCompare(b.fullName)
      : a.fromDate.localeCompare(b.fromDate),
  );

  const policy = await getLeavePolicySettings();
  const leaveTypeOptions = scheduleLeaveCodesFromPolicyOrder(
    policy.leaveTypes,
  ).map((code) => {
    const label = labelByCode.get(code);
    const type = typeByScheduleCode.get(code);
    return {
      code,
      name: type?.name ?? label?.name ?? scheduleLeaveDisplayName(code),
      leaveTypeId: type?.id ?? null,
      bgColor: label?.bgColor ?? type?.colour ?? "#e5e5e5",
      textColor: label?.textColor ?? "#404040",
      borderColor: label?.borderColor ?? "#d4d4d4",
    };
  });

  return {
    year,
    month,
    events: mergedEvents,
    labels: labels
      .filter((l) => isScheduleLeaveLabel(l.code))
      .map((l) => ({
        code: normalizeScheduleLeaveCode(l.code),
        abbreviation: l.abbreviation,
        name: l.name,
        bgColor: l.bgColor,
        textColor: l.textColor,
        borderColor: l.borderColor,
      })),
    leaveTypes: leaveTypeOptions,
    departments: (departments.data ?? []).map((d) => ({
      id: d.id as string,
      name: d.name as string,
    })),
    canManage,
  };
}

export async function saveLeaveCalendarEntry(input: {
  requestId?: string | null;
  staffId: string;
  labelCode: string;
  fromDate: string;
  toDate: string;
  notes?: string | null;
  previousFromDate?: string | null;
  previousToDate?: string | null;
  previousLabelCode?: string | null;
  syncSchedule?: boolean;
}): Promise<{ error?: string; requestId?: string }> {
  const { user, venue, permissions } = await getAuthContext();

  if (
    !canEditStaff(permissions, venue.id) &&
    !canAdminLookups(permissions, venue.id) &&
    !canEditSchedules(permissions, venue.id)
  ) {
    return { error: "You do not have permission to edit leave." };
  }

  const labelCode = normalizeScheduleLeaveCode(input.labelCode.trim().toUpperCase());
  if (!isScheduleLeaveLabel(labelCode) && labelCode !== "LP") {
    return { error: "Unknown leave type." };
  }
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(input.fromDate) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(input.toDate)
  ) {
    return { error: "Invalid dates." };
  }
  if (input.toDate < input.fromDate) {
    return { error: "End date must be on or after the start date." };
  }

  const service = createServiceClient();
  const { data: staffRow, error: staffError } = await service
    .from("staff")
    .select("id, emp_no, department_id, full_name, termination_date")
    .eq("id", input.staffId)
    .eq("home_venue_id", venue.id)
    .maybeSingle();

  if (staffError || !staffRow) {
    return { error: staffError?.message ?? "Employee not found." };
  }

  const terminationDate =
    (staffRow.termination_date as string | null | undefined) ?? null;
  if (
    isWorkDateAfterTermination(input.fromDate, terminationDate) ||
    isWorkDateAfterTermination(input.toDate, terminationDate)
  ) {
    return {
      error: postTerminationBlockMessage({
        terminationDate: terminationDate!,
        fullName: (staffRow.full_name as string | null) ?? null,
        empNo: (staffRow.emp_no as string | null) ?? null,
        kind: "leave",
      }),
    };
  }

  const leaveTypes = await listActiveLeaveTypes(service);
  const leaveType = findLeaveTypeForScheduleLabel(leaveTypes, labelCode);
  if (!leaveType) {
    return { error: `No leave type configured for ${labelCode}.` };
  }

  const days = countInclusiveDays(input.fromDate, input.toDate);
  const notes = input.notes?.trim() || null;
  const now = new Date().toISOString();
  const syncSchedule = input.syncSchedule !== false;

  if (syncSchedule) {
    const synced = await syncLeaveRangeToSchedule({
      service,
      venueId: venue.id,
      userId: user.id,
      staffId: input.staffId,
      empNo: String(staffRow.emp_no),
      departmentId: (staffRow.department_id as string | null) ?? null,
      labelCode,
      fromDate: input.fromDate,
      toDate: input.toDate,
      previousFrom: input.previousFromDate,
      previousTo: input.previousToDate,
      previousLabel: input.previousLabelCode,
    });
    if (synced.error) return synced;
  }

  let requestId = input.requestId ?? null;

  if (requestId) {
    const { error } = await service
      .from("hr_leave_requests")
      .update({
        leave_type_id: leaveType.id,
        start_date: input.fromDate,
        end_date: input.toDate,
        calendar_days: days,
        scheduled_working_days: days,
        deductible_days: days,
        reason: notes,
        hr_notes: notes,
        schedule_status: syncSchedule ? "synced" : "not_synced",
        updated_by: user.id,
        updated_at: now,
      })
      .eq("id", requestId)
      .eq("venue_id", venue.id);
    if (error) {
      console.error("[leave] update request:", error.message);
      return { error: error.message };
    }
  } else {
    const requestNumber = await nextLeaveRequestNumber(
      service,
      venue.id,
      Number(input.fromDate.slice(0, 4)),
    );
    const { data: inserted, error } = await service
      .from("hr_leave_requests")
      .insert({
        venue_id: venue.id,
        request_number: requestNumber,
        employee_id: input.staffId,
        leave_type_id: leaveType.id,
        start_date: input.fromDate,
        end_date: input.toDate,
        start_day_duration: "full",
        end_day_duration: "full",
        calendar_days: days,
        scheduled_working_days: days,
        deductible_days: days,
        paid_days: 0,
        half_paid_days: 0,
        unpaid_days: 0,
        status: "recorded",
        source: "schedule",
        reason: notes ?? "Recorded from leave calendar",
        hr_notes: notes,
        schedule_status: syncSchedule ? "synced" : "not_synced",
        created_by: user.id,
        updated_by: user.id,
      })
      .select("id")
      .maybeSingle();
    if (error) {
      console.error("[leave] create request:", error.message);
      return { error: error.message };
    }
    requestId = inserted?.id as string;
  }

  await writeAuditLog({
    actor_id: user.id,
    action: input.requestId ? "update" : "create",
    module_key: HR_MODULE_KEY,
    entity: "hr_leave_requests",
    entity_id: requestId ?? input.staffId,
    venue_id: venue.id,
    before: input.requestId
      ? {
          fromDate: input.previousFromDate ?? null,
          toDate: input.previousToDate ?? null,
          labelCode: input.previousLabelCode ?? null,
        }
      : null,
    after: {
      staffId: input.staffId,
      labelCode,
      fromDate: input.fromDate,
      toDate: input.toDate,
      days,
      ...(input.requestId ? {} : { status: "recorded" as const }),
    },
  });

  revalidatePath("/hr/attendance/leave/calendar");
  revalidatePath("/hr/attendance/leave/requests");
  revalidatePath("/hr/attendance/leave/balances");

  return { requestId: requestId ?? undefined };
}

/**
 * When Validation approves attendance days, mirror leave-label ranges onto
 * leave requests / balances so Leave ↔ Validation stay in sync.
 * ABS / OFF / PH are attendance-only (no leave request).
 */
export async function mirrorAttendanceApprovalsToLeave(input: {
  staffId: string;
  empNo: string;
  workDates: string[];
}): Promise<{ error?: string }> {
  const workDates = [
    ...new Set(
      input.workDates
        .map((d) => d.slice(0, 10))
        .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)),
    ),
  ].sort();
  if (workDates.length === 0) return {};

  const { user, venue, permissions } = await getAuthContext();
  if (
    !canEditStaff(permissions, venue.id) &&
    !canEditSchedules(permissions, venue.id) &&
    !canAdminLookups(permissions, venue.id)
  ) {
    return { error: "You do not have permission to approve leave." };
  }

  const fromDate = workDates[0]!;
  const toDate = workDates[workDates.length - 1]!;
  const approvedSet = new Set(workDates);
  const service = createServiceClient();

  const scheduleDays = await listStaffScheduleDays(service, venue.id, {
    staffIds: [input.staffId],
    fromDate,
    toDate,
  });

  const leaveDays = scheduleDays
    .filter((d) => {
      const date = String(d.work_date).slice(0, 10);
      if (!approvedSet.has(date)) return false;
      return isScheduleLeaveLabel(d.label_code);
    })
    .map((d) => ({
      workDate: String(d.work_date).slice(0, 10),
      labelCode: normalizeScheduleLeaveCode(d.label_code),
    }));

  const ranges = groupScheduledLeaveRanges(leaveDays);
  for (const range of ranges) {
    const rangeDates = eachIsoDateInRange(range.fromDate, range.toDate);
    if (
      rangeDates.length === 0 ||
      !rangeDates.every((date) => approvedSet.has(date))
    ) {
      continue;
    }

    const mirrored = await approveLeaveCalendarEntry({
      staffId: input.staffId,
      labelCode: range.labelCode,
      fromDate: range.fromDate,
      toDate: range.toDate,
      previousFromDate: range.fromDate,
      previousToDate: range.toDate,
      previousLabelCode: range.labelCode,
      /** Attendance already approved by Validation — skip re-upsert. */
      skipAttendanceSync: true,
      /** Roster already has these labels — do not rewrite schedule. */
      syncSchedule: false,
    });
    if (mirrored.error) {
      console.error(
        "[leave] mirror validation approval:",
        mirrored.error,
        range,
      );
    }
  }

  void user;
  void input.empNo;
  return {};
}

export async function approveLeaveCalendarEntry(input: {
  requestId?: string | null;
  staffId: string;
  labelCode: string;
  fromDate: string;
  toDate: string;
  notes?: string | null;
  previousFromDate?: string | null;
  previousToDate?: string | null;
  previousLabelCode?: string | null;
  /** When false, do not rewrite schedule days (Validation already set them). */
  syncSchedule?: boolean;
  /** When true, skip creating/updating attendance day approvals. */
  skipAttendanceSync?: boolean;
}): Promise<{ error?: string; requestId?: string }> {
  const labelCode = normalizeScheduleLeaveCode(
    input.labelCode.trim().toUpperCase(),
  );

  // ABS is payroll disposition only — no leave request / balance ledger.
  if (labelCode === "ABS") {
    return approveAbsRangeAttendance({
      staffId: input.staffId,
      fromDate: input.fromDate,
      toDate: input.toDate,
      notes: input.notes,
    });
  }

  const saved = await saveLeaveCalendarEntry({
    requestId: input.requestId,
    staffId: input.staffId,
    labelCode: input.labelCode,
    fromDate: input.fromDate,
    toDate: input.toDate,
    notes: input.notes,
    previousFromDate: input.previousFromDate,
    previousToDate: input.previousToDate,
    previousLabelCode: input.previousLabelCode,
    syncSchedule: input.syncSchedule !== false,
  });
  if (saved.error) return saved;

  const { user, venue, permissions } = await getAuthContext();
  if (
    !canEditStaff(permissions, venue.id) &&
    !canAdminLookups(permissions, venue.id)
  ) {
    return { error: "You do not have permission to approve leave." };
  }

  const service = createServiceClient();
  const requestId = saved.requestId;
  if (!requestId) return { error: "Could not resolve leave request." };

  const now = new Date().toISOString();
  const { data: existingRequest, error: existingError } = await service
    .from("hr_leave_requests")
    .select("id, status")
    .eq("id", requestId)
    .eq("venue_id", venue.id)
    .maybeSingle();
  if (existingError) {
    return { error: existingError.message };
  }

  const alreadyApproved = existingRequest?.status === "approved";

  if (!alreadyApproved) {
    const { error } = await service
      .from("hr_leave_requests")
      .update({
        status: "approved",
        approved_at: now,
        schedule_status: "synced",
        hr_notes: input.notes?.trim() || null,
        updated_by: user.id,
        updated_at: now,
      })
      .eq("id", requestId)
      .eq("venue_id", venue.id);

    if (error) {
      console.error("[leave] approve request:", error.message);
      return { error: error.message };
    }

    // Reflect approved days on the balance ledger when a tracked type matches.
    const balanceCode =
      normalizeScheduleLeaveCode(input.labelCode) === "AL"
        ? "AL"
        : normalizeScheduleLeaveCode(input.labelCode) === "SL"
          ? "SL-FP"
          : normalizeScheduleLeaveCode(input.labelCode);
    const leaveYear = Number(input.fromDate.slice(0, 4));
    const days = countInclusiveDays(input.fromDate, input.toDate);

    if ((BALANCE_TRACKED_CODES as readonly string[]).includes(balanceCode)) {
      await ensureLeaveBalancesForYear(leaveYear);
      const { data: bal } = await service
        .from("hr_leave_balances")
        .select("*")
        .eq("venue_id", venue.id)
        .eq("staff_id", input.staffId)
        .eq("leave_year", leaveYear)
        .eq("leave_type_code", balanceCode)
        .maybeSingle();

      if (bal) {
        const prevUsed = toNumber(bal.used);
        const prevScheduled = toNumber(bal.scheduled);
        const nextUsed = prevUsed + days;
        const nextScheduled = Math.max(0, prevScheduled - days);
        await service
          .from("hr_leave_balances")
          .update({
            used: nextUsed,
            scheduled: nextScheduled,
            updated_at: now,
          })
          .eq("id", bal.id);
        await service.from("hr_leave_balance_adjustments").insert([
          {
            venue_id: venue.id,
            balance_id: bal.id,
            field: "used",
            previous_value: prevUsed,
            new_value: nextUsed,
            reason: `Leave approved (${input.fromDate} → ${input.toDate})`,
            author_id: user.id,
          },
        ]);
      }
    }

    await writeAuditLog({
      actor_id: user.id,
      action: "approve",
      module_key: HR_MODULE_KEY,
      entity: "hr_leave_requests",
      entity_id: requestId,
      venue_id: venue.id,
      after: {
        status: "approved",
        staffId: input.staffId,
        labelCode: input.labelCode,
        fromDate: input.fromDate,
        toDate: input.toDate,
      },
    });
  }

  if (!input.skipAttendanceSync) {
    const { data: staffRow } = await service
      .from("staff")
      .select("emp_no")
      .eq("id", input.staffId)
      .eq("home_venue_id", venue.id)
      .maybeSingle();
    const empNo = staffRow ? String(staffRow.emp_no) : null;
    if (empNo) {
      const attendance = await upsertAttendanceDayApprovals(service, {
        venueId: venue.id,
        userId: user.id,
        days: eachIsoDateInRange(input.fromDate, input.toDate).map(
          (workDate) => ({
            staffId: input.staffId,
            empNo,
            workDate,
          }),
        ),
        approvalStatus: ATTENDANCE_APPROVED_STATUS,
        notes: input.notes?.trim() || null,
      });
      if (attendance.error) {
        return { error: attendance.error };
      }
    }
  }

  revalidatePath("/hr/attendance/leave/calendar");
  revalidatePath("/hr/attendance/leave/requests");
  revalidatePath("/hr/attendance/leave/balances");
  revalidatePath("/hr/attendance", "layout");

  return { requestId };
}

async function approveAbsRangeAttendance(input: {
  staffId: string;
  fromDate: string;
  toDate: string;
  notes?: string | null;
}): Promise<{ error?: string; requestId?: string }> {
  const { user, venue, permissions } = await getAuthContext();
  if (
    !canEditStaff(permissions, venue.id) &&
    !canAdminLookups(permissions, venue.id) &&
    !canEditSchedules(permissions, venue.id)
  ) {
    return { error: "You do not have permission to approve absence." };
  }

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(input.fromDate) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(input.toDate) ||
    input.toDate < input.fromDate
  ) {
    return { error: "Invalid dates." };
  }

  const service = createServiceClient();
  const { data: staffRow, error: staffError } = await service
    .from("staff")
    .select("id, emp_no, full_name, termination_date")
    .eq("id", input.staffId)
    .eq("home_venue_id", venue.id)
    .maybeSingle();
  if (staffError || !staffRow) {
    return { error: staffError?.message ?? "Employee not found." };
  }

  const terminationDate =
    (staffRow.termination_date as string | null | undefined) ?? null;
  if (
    isWorkDateAfterTermination(input.fromDate, terminationDate) ||
    isWorkDateAfterTermination(input.toDate, terminationDate)
  ) {
    return {
      error: postTerminationBlockMessage({
        terminationDate: terminationDate!,
        fullName: (staffRow.full_name as string | null) ?? null,
        empNo: (staffRow.emp_no as string | null) ?? null,
        kind: "leave",
      }),
    };
  }

  const attendance = await upsertAttendanceDayApprovals(service, {
    venueId: venue.id,
    userId: user.id,
    days: eachIsoDateInRange(input.fromDate, input.toDate).map((workDate) => ({
      staffId: input.staffId,
      empNo: String(staffRow.emp_no),
      workDate,
    })),
    approvalStatus: ATTENDANCE_APPROVED_STATUS,
    notes: input.notes?.trim() || null,
  });
  if (attendance.error) {
    return { error: attendance.error };
  }

  await writeAuditLog({
    actor_id: user.id,
    action: "approve",
    module_key: HR_MODULE_KEY,
    entity: "hr_attendance_days",
    entity_id: input.staffId,
    venue_id: venue.id,
    after: {
      status: "approved",
      labelCode: "ABS",
      staffId: input.staffId,
      fromDate: input.fromDate,
      toDate: input.toDate,
      attendanceIds: attendance.rows.map((r) => r.id),
    },
  });

  revalidatePath("/hr/attendance/leave/calendar");
  revalidatePath("/hr/attendance/leave/requests");
  revalidatePath("/hr/attendance/leave/balances");
  revalidatePath("/hr/attendance", "layout");

  return {};
}

export async function rejectLeaveCalendarEntry(input: {
  requestId?: string | null;
  staffId: string;
  fromDate: string;
  toDate: string;
  labelCode: string;
  notes?: string | null;
  clearSchedule?: boolean;
}): Promise<{ error?: string }> {
  const { user, venue, permissions } = await getAuthContext();
  if (
    !canEditStaff(permissions, venue.id) &&
    !canAdminLookups(permissions, venue.id)
  ) {
    return { error: "You do not have permission to reject leave." };
  }

  const service = createServiceClient();
  const now = new Date().toISOString();
  let requestId = input.requestId ?? null;

  if (requestId) {
    const { error } = await service
      .from("hr_leave_requests")
      .update({
        status: "rejected",
        rejected_at: now,
        hr_notes: input.notes?.trim() || null,
        updated_by: user.id,
        updated_at: now,
      })
      .eq("id", requestId)
      .eq("venue_id", venue.id);
    if (error) return { error: error.message };
  }

  if (input.clearSchedule !== false) {
    const { data: staffRow } = await service
      .from("staff")
      .select("emp_no, department_id")
      .eq("id", input.staffId)
      .eq("home_venue_id", venue.id)
      .maybeSingle();
    if (staffRow) {
      const clearCode = normalizeScheduleLeaveCode(input.labelCode);
      const dates = eachIsoDateInRange(input.fromDate, input.toDate);
      if (dates.length > 0) {
        await service
          .from("hr_schedule_days")
          .delete()
          .eq("venue_id", venue.id)
          .eq("staff_id", input.staffId)
          .in("work_date", dates)
          .or(`label_code.eq.${clearCode},label_code.eq.LP`);

        const offDays = dates.map((work_date) => ({
          venue_id: venue.id,
          staff_id: input.staffId,
          emp_no: String(staffRow.emp_no),
          work_date,
          label_code: "OFF",
          shift_template_id: null,
          department_id: (staffRow.department_id as string | null) ?? null,
          source: "manual" as const,
          updated_by: user.id,
          updated_at: now,
        }));
        await service
          .from("hr_schedule_days")
          .upsert(offDays, { onConflict: "staff_id,work_date" });
      }
    }
  }

  await writeAuditLog({
    actor_id: user.id,
    action: "reject",
    module_key: HR_MODULE_KEY,
    entity: "hr_leave_requests",
    entity_id: requestId ?? input.staffId,
    venue_id: venue.id,
    after: {
      status: "rejected",
      staffId: input.staffId,
      labelCode: input.labelCode,
      fromDate: input.fromDate,
      toDate: input.toDate,
    },
  });

  revalidatePath("/hr/attendance/leave/calendar");
  revalidatePath("/hr/attendance/leave/requests");
  return {};
}
