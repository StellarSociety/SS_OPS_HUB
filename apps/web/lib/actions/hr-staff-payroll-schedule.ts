"use server";

import { getActionAuthContext } from "@/lib/auth/action-context";
import { isDayClearedForPayroll } from "@/lib/hr/attendance-approval";
import { mergeLeavePolicy } from "@/lib/hr/leave";
import {
  canAccessPayroll,
  canAccessSchedules,
  canAccessStaff,
  canSubmitStaff,
  canViewStaff,
} from "@/lib/hr/permissions";
import {
  DEFAULT_HR_PAYROLL_SETTINGS,
  eachIsoDate,
  isTerminatedBeforePayrollMonth,
  maxIsoDate,
  mergePayrollSettings,
  payrollEmployeeWindowEnd,
  payrollMonthContainingDate,
  resolvePayrollPeriod,
  type HrPayrollSettings,
  type PayrollDayFraction,
} from "@/lib/hr/payroll";
import { payFractionForLabel } from "@/lib/hr/payroll/pay-fraction";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveActiveVenue } from "@/lib/venue/active-venue";
import {
  DEFAULT_HR_ATTENDANCE_IMPORT_RULES,
  HR_SETTINGS_KEYS,
  type HrAttendanceImportRules,
  type HrLeavePolicySettings,
} from "@/lib/hr/types";

export type StaffPayrollScheduleInput = {
  staffId: string;
  empNo?: string;
  fullName?: string;
  joiningDate?: string | null;
  terminationDate?: string | null;
  /** Named payroll month (YYYY-MM or YYYY-MM-01). Defaults to month containing today. */
  payrollMonth?: string | null;
};

export type StaffPayrollScheduleResult =
  | {
      ok: true;
      empNo: string;
      fullName: string;
      payrollMonth: string;
      periodStart: string;
      periodEnd: string;
      dayFractions: PayrollDayFraction[];
      paidDays: number;
    }
  | { ok: false; error: string };

function todayIsoLocal(asOf: Date = new Date()): string {
  const y = asOf.getFullYear();
  const m = String(asOf.getMonth() + 1).padStart(2, "0");
  const d = String(asOf.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizePayrollMonthInput(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length >= 10) return trimmed.slice(0, 10);
  if (/^\d{4}-\d{2}$/.test(trimmed)) return `${trimmed}-01`;
  return trimmed;
}

/**
 * Fast auth for schedule reads: session + active venue only.
 * Skips the permissions table round-trip (staff entry is already gated).
 */
async function getScheduleAuth(): Promise<
  | { ok: true; venueId: string; userId: string }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const [userRes, venue] = await Promise.all([
    supabase.auth.getUser(),
    resolveActiveVenue(supabase),
  ]);
  const user = userRes.data.user;
  if (!user) {
    return { ok: false, error: "Not signed in. Sign in again and retry." };
  }
  if (!venue || venue.is_global) {
    return {
      ok: false,
      error:
        "No active venue for this request. Open HR from a venue URL (e.g. /venue/orilla/hr/staff).",
    };
  }
  return { ok: true, venueId: venue.id, userId: user.id };
}

function dayFractionsFromSnapshot(
  snapshot: unknown,
  paidDaysFallback: number,
): { dayFractions: PayrollDayFraction[]; paidDays: number } | null {
  const snap = asRecord(snapshot);
  const dayFractions = Array.isArray(snap?.dayFractions)
    ? (snap.dayFractions as PayrollDayFraction[])
    : null;
  if (!dayFractions || dayFractions.length === 0) return null;
  const effective =
    snap?.effectivePaidDays != null
      ? Number(snap.effectivePaidDays)
      : paidDaysFallback;
  return {
    dayFractions,
    paidDays: Number.isFinite(effective) ? effective : 0,
  };
}

function latestWorkDate(
  dayFractions: PayrollDayFraction[],
  fallback: string,
): string {
  let end = fallback.slice(0, 10);
  for (const day of dayFractions) {
    const key = String(day.workDate ?? "").slice(0, 10);
    if (key > end) end = key;
  }
  return end;
}

function snapshotHasNoUnclearedDays(
  dayFractions: PayrollDayFraction[],
): boolean {
  return dayFractions.every((day) => day.approved);
}

/**
 * Staff Entry → Schedule shortcut.
 *
 * Hot path (target &lt;400ms after auth): one run lookup + one employee snapshot
 * when every day is already cleared. Live rebuild when no snapshot exists or
 * any day is still uncleared (avoids hiding later Validation approvals).
 */
export async function getStaffCurrentPayrollSchedule(
  input: StaffPayrollScheduleInput | string,
): Promise<StaffPayrollScheduleResult> {
  const started = Date.now();
  const marks: Record<string, number> = {};
  const mark = (label: string) => {
    marks[label] = Date.now() - started;
  };

  try {
    const opts: StaffPayrollScheduleInput =
      typeof input === "string" ? { staffId: input } : input;

    const staffId = opts.staffId.trim();
    if (!staffId) return { ok: false, error: "Staff member is required." };

    const auth = await getScheduleAuth();
    mark("auth");
    if (!auth.ok) return { ok: false, error: auth.error };

    const service = createServiceClient();
    const today = todayIsoLocal();
    const requestedMonthRaw = opts.payrollMonth?.trim() || "";

    // Resolve month without a settings round-trip whenever possible.
    // Venue period settings almost always match defaults (25→24).
    const targetMonth = requestedMonthRaw
      ? resolvePayrollPeriod(
          normalizePayrollMonthInput(requestedMonthRaw),
          DEFAULT_HR_PAYROLL_SETTINGS,
        ).payrollMonth
      : payrollMonthContainingDate(today, DEFAULT_HR_PAYROLL_SETTINGS);

    const hintEmpNo = opts.empNo?.trim() || "";
    const hintName = opts.fullName?.trim() || "";

    // ── Hot path: payroll-run snapshot (2 indexed lookups, no settings) ──
    const { data: run, error: runErr } = await service
      .from("hr_payroll_runs")
      .select("id, period_start, period_end, payroll_month")
      .eq("venue_id", auth.venueId)
      .eq("payroll_month", targetMonth)
      .maybeSingle();
    mark("run");

    if (runErr) {
      console.error("[staff-payroll-schedule] run:", runErr.message);
    }

    if (run?.id) {
      const { data: runEmp, error: empErr } = await service
        .from("hr_payroll_run_employees")
        .select("emp_no, full_name, paid_days, snapshot")
        .eq("run_id", run.id)
        .eq("staff_id", staffId)
        .maybeSingle();
      mark("emp");

      if (empErr) {
        console.error("[staff-payroll-schedule] emp:", empErr.message);
      }

      const parsed = dayFractionsFromSnapshot(
        runEmp?.snapshot,
        Number(runEmp?.paid_days ?? 0),
      );
      const snap = asRecord(runEmp?.snapshot);
      const snapTermination =
        typeof snap?.terminationDate === "string"
          ? snap.terminationDate.slice(0, 10)
          : opts.terminationDate
            ? String(opts.terminationDate).slice(0, 10)
            : null;
      const snapshotPeriod = {
        payrollMonth: String(run.payroll_month).slice(0, 10),
      };
      // Month-end leavers settled in the prior calendar month must not reuse
      // a stale next-month snapshot (e.g. 31 Jul still showing on August).
      if (
        snapTermination &&
        isTerminatedBeforePayrollMonth(snapTermination, snapshotPeriod)
      ) {
        // Fall through to live rebuild / empty window.
      } else if (parsed && snapshotHasNoUnclearedDays(parsed.dayFractions)) {
        console.info(
          `[staff-payroll-schedule] snapshot ${Date.now() - started}ms`,
          marks,
        );
        return {
          ok: true,
          empNo: String(runEmp?.emp_no || hintEmpNo),
          fullName: String(runEmp?.full_name || hintName),
          payrollMonth: String(run.payroll_month).slice(0, 10),
          periodStart: String(run.period_start).slice(0, 10),
          periodEnd: latestWorkDate(
            parsed.dayFractions,
            String(run.period_end).slice(0, 10),
          ),
          dayFractions: parsed.dayFractions,
          paidDays: parsed.paidDays,
        };
      }
    }

    // ── Cold path: live roster (settings + schedule + attendance) ──
    // Full permission check only when we must rebuild (heavier).
    const fullAuth = await getActionAuthContext();
    mark("fullAuth");
    if ("error" in fullAuth) return { ok: false, error: fullAuth.error };
    const { venue, permissions } = fullAuth;
    const canView =
      canViewStaff(permissions, venue.id) ||
      canSubmitStaff(permissions, venue.id) ||
      canAccessStaff(permissions, venue.id) ||
      canAccessSchedules(permissions, venue.id) ||
      canAccessPayroll(permissions, venue.id);
    if (!canView) {
      return { ok: false, error: "No permission to view employee schedule." };
    }

    let joining =
      opts.joiningDate != null && opts.joiningDate !== ""
        ? String(opts.joiningDate).slice(0, 10)
        : null;
    let termination =
      opts.terminationDate != null && opts.terminationDate !== ""
        ? String(opts.terminationDate).slice(0, 10)
        : null;
    let empNo = hintEmpNo;
    let fullName = hintName;

    const needStaffRow =
      !hintEmpNo ||
      !hintName ||
      opts.joiningDate === undefined ||
      opts.terminationDate === undefined;

    const settingsKeys = [
      HR_SETTINGS_KEYS.payroll,
      HR_SETTINGS_KEYS.leavePolicy,
      HR_SETTINGS_KEYS.attendanceImportRules,
    ];

    const [settingsRes, staffRes] = await Promise.all([
      service
        .from("hr_venue_settings")
        .select("key, value")
        .eq("venue_id", venue.id)
        .in("key", settingsKeys),
      needStaffRow
        ? service
            .from("staff")
            .select("emp_no, full_name, joining_date, termination_date")
            .eq("id", staffId)
            .eq("home_venue_id", venue.id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    mark("settings");

    const settingsByKey = new Map<string, unknown>();
    for (const row of settingsRes.data ?? []) {
      settingsByKey.set(String(row.key), row.value);
    }

    const settings = mergePayrollSettings(
      asRecord(
        settingsByKey.get(HR_SETTINGS_KEYS.payroll),
      ) as Partial<HrPayrollSettings> | null,
    );
    const leavePolicy = mergeLeavePolicy(
      asRecord(
        settingsByKey.get(HR_SETTINGS_KEYS.leavePolicy),
      ) as Partial<HrLeavePolicySettings> | null,
    );
    const importRules = {
      ...DEFAULT_HR_ATTENDANCE_IMPORT_RULES,
      ...(asRecord(
        settingsByKey.get(HR_SETTINGS_KEYS.attendanceImportRules),
      ) as Partial<HrAttendanceImportRules> | null),
    };
    const timezone =
      importRules.timezone || DEFAULT_HR_ATTENDANCE_IMPORT_RULES.timezone;
    const varianceMinutes =
      importRules.scheduleVarianceMinutes ??
      DEFAULT_HR_ATTENDANCE_IMPORT_RULES.scheduleVarianceMinutes;

    if (needStaffRow) {
      if (staffRes.error || !staffRes.data) {
        return { ok: false, error: "Employee not found for this venue." };
      }
      empNo = empNo || String(staffRes.data.emp_no ?? "");
      fullName = fullName || String(staffRes.data.full_name ?? "");
      if (opts.joiningDate === undefined) {
        joining = staffRes.data.joining_date
          ? String(staffRes.data.joining_date).slice(0, 10)
          : null;
      }
      if (opts.terminationDate === undefined) {
        termination = staffRes.data.termination_date
          ? String(staffRes.data.termination_date).slice(0, 10)
          : null;
      }
    }

    // Re-resolve period with real venue settings (may differ from defaults).
    const payrollMonth = requestedMonthRaw
      ? resolvePayrollPeriod(
          normalizePayrollMonthInput(requestedMonthRaw),
          settings,
        ).payrollMonth
      : payrollMonthContainingDate(today, settings);
    const period = resolvePayrollPeriod(payrollMonth, settings);

    // If defaults pointed at the wrong month, try that run's snapshot once.
    if (period.payrollMonth !== targetMonth) {
      const { data: altRun } = await service
        .from("hr_payroll_runs")
        .select("id, period_start, period_end, payroll_month")
        .eq("venue_id", venue.id)
        .eq("payroll_month", period.payrollMonth)
        .maybeSingle();
      if (altRun?.id) {
        const { data: altEmp } = await service
          .from("hr_payroll_run_employees")
          .select("emp_no, full_name, paid_days, snapshot")
          .eq("run_id", altRun.id)
          .eq("staff_id", staffId)
          .maybeSingle();
        const parsed = dayFractionsFromSnapshot(
          altEmp?.snapshot,
          Number(altEmp?.paid_days ?? 0),
        );
        if (
          parsed &&
          snapshotHasNoUnclearedDays(parsed.dayFractions) &&
          !isTerminatedBeforePayrollMonth(termination, period)
        ) {
          console.info(
            `[staff-payroll-schedule] snapshot-alt ${Date.now() - started}ms`,
            marks,
          );
          return {
            ok: true,
            empNo: String(altEmp?.emp_no || empNo),
            fullName: String(altEmp?.full_name || fullName),
            payrollMonth: String(altRun.payroll_month).slice(0, 10),
            periodStart: String(altRun.period_start).slice(0, 10),
            periodEnd: latestWorkDate(
              parsed.dayFractions,
              String(altRun.period_end).slice(0, 10),
            ),
            dayFractions: parsed.dayFractions,
            paidDays: parsed.paidDays,
          };
        }
      }
    }

    const emptyOk = (): StaffPayrollScheduleResult => ({
      ok: true,
      empNo,
      fullName,
      payrollMonth: period.payrollMonth,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      dayFractions: [],
      paidDays: 0,
    });

    if (joining && joining > period.periodEnd) return emptyOk();
    if (isTerminatedBeforePayrollMonth(termination, period)) return emptyOk();

    const windowStart = joining
      ? maxIsoDate(period.periodStart, joining)
      : period.periodStart;
    const windowEnd = payrollEmployeeWindowEnd(termination, period);

    if (windowStart > windowEnd) return emptyOk();

    const [scheduleRes, attendanceRes, templatesRes] = await Promise.all([
      service
        .from("hr_schedule_days")
        .select("work_date, label_code, shift_template_id")
        .eq("venue_id", venue.id)
        .eq("staff_id", staffId)
        .gte("work_date", windowStart)
        .lte("work_date", windowEnd),
      service
        .from("hr_attendance_days")
        .select("id, work_date, approval_status, clock_in, clock_out")
        .eq("venue_id", venue.id)
        .eq("staff_id", staffId)
        .gte("work_date", windowStart)
        .lte("work_date", windowEnd),
      service
        .from("hr_shift_templates")
        .select("id, start_time, end_time")
        .eq("venue_id", venue.id),
    ]);
    mark("live");

    const scheduleByDate = new Map<
      string,
      { label: string; shiftTemplateId: string | null }
    >();
    for (const day of scheduleRes.data ?? []) {
      scheduleByDate.set(String(day.work_date).slice(0, 10), {
        label: String(day.label_code ?? ""),
        shiftTemplateId: (day.shift_template_id as string | null) ?? null,
      });
    }

    const attendanceByDate = new Map<
      string,
      {
        id: string;
        approval_status: string;
        clock_in: string | null;
        clock_out: string | null;
      }
    >();
    for (const day of attendanceRes.data ?? []) {
      attendanceByDate.set(String(day.work_date).slice(0, 10), {
        id: String(day.id),
        approval_status: String(day.approval_status ?? ""),
        clock_in: (day.clock_in as string | null) ?? null,
        clock_out: (day.clock_out as string | null) ?? null,
      });
    }

    const shiftTemplateMap = new Map<
      string,
      { startTime: string; endTime: string }
    >();
    for (const t of templatesRes.data ?? []) {
      shiftTemplateMap.set(String(t.id), {
        startTime: String(t.start_time).slice(0, 5),
        endTime: String(t.end_time).slice(0, 5),
      });
    }

    const dayFractions: PayrollDayFraction[] = [];
    let paidDays = 0;

    for (const workDate of eachIsoDate(windowStart, windowEnd)) {
      const schedule = scheduleByDate.get(workDate) ?? null;
      const label = schedule?.label || null;
      const attendance = attendanceByDate.get(workDate) ?? null;
      const template = schedule?.shiftTemplateId
        ? shiftTemplateMap.get(schedule.shiftTemplateId)
        : undefined;

      if (!label) {
        dayFractions.push({
          workDate,
          labelCode: "—",
          approved: false,
          payFraction: 0,
          unpaidFraction: 1,
          isLeave: false,
          paidStatus: "unknown",
        });
        continue;
      }

      const cleared = isDayClearedForPayroll({
        rosterLabel: label,
        approvalStatus: attendance?.approval_status ?? null,
        workDate,
        attendanceId: attendance?.id ?? null,
        scheduleStart: template?.startTime ?? null,
        scheduleEnd: template?.endTime ?? null,
        clockIn: attendance?.clock_in ?? null,
        clockOut: attendance?.clock_out ?? null,
        timezone,
        varianceMinutes,
      });

      const frac = payFractionForLabel(label, leavePolicy);
      dayFractions.push({
        workDate,
        labelCode: label,
        approved: cleared,
        payFraction: cleared ? frac.payFraction : 0,
        unpaidFraction: cleared ? frac.unpaidFraction : 1,
        isLeave: frac.isLeave,
        paidStatus: cleared ? frac.paidStatus : "unknown",
      });

      if (cleared) paidDays += frac.payFraction;
    }

    console.info(
      `[staff-payroll-schedule] live ${Date.now() - started}ms days=${dayFractions.length}`,
      marks,
    );

    return {
      ok: true,
      empNo,
      fullName,
      payrollMonth: period.payrollMonth,
      periodStart: period.periodStart,
      periodEnd: windowEnd,
      dayFractions,
      paidDays,
    };
  } catch (err) {
    console.error("[staff-payroll-schedule] failed:", err);
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Could not load schedule for this employee.",
    };
  }
}
