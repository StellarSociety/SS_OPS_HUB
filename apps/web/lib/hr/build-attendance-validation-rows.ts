import type { SupabaseClient } from "@supabase/supabase-js";
import { currentMonthKey, resolveFetchMonthKeys } from "@/lib/hr/attendance-months";
import { EMPLOYMENT_STATUS_NAMES } from "@/lib/hr/employment-status";
import {
  DEFAULT_SCHEDULE_VARIANCE_MINUTES,
  measureShiftPunchVariance,
} from "@/lib/hr/schedule-variance";
import {
  getHrVenueSetting,
  listAttendanceDays,
  listScheduleDaysByDateRange,
  listShiftTemplates,
  listStaffForVenue,
} from "@/lib/hr/store";
import {
  DEFAULT_HR_ATTENDANCE_IMPORT_RULES,
  HR_SETTINGS_KEYS,
  type HrAttendanceImportRules,
} from "@/lib/hr/types";

export type AttendanceValidationRow = {
  id: string | null;
  staffId: string | null;
  workDate: string;
  empNo: string;
  fullName: string;
  departmentId: string | null;
  rosterLabel: string | null;
  scheduleTime: string | null;
  scheduleStartTime: string | null;
  scheduleEndTime: string | null;
  clockIn: string | null;
  clockOut: string | null;
  totalHours: number | null;
  attendanceStatus: string | null;
  approvalStatus: "pending" | "approved" | "rejected" | "flagged" | null;
  issue: string | null;
};

const VALIDATION_ELIGIBLE_STATUS_NAMES = new Set<string>([
  EMPLOYMENT_STATUS_NAMES.onBoard,
  EMPLOYMENT_STATUS_NAMES.offBoard,
]);

function formatScheduleTime(
  startTime: string | null | undefined,
  endTime: string | null | undefined,
): string | null {
  if (!startTime || !endTime) return null;
  return `${startTime} – ${endTime}`;
}

export function validationFetchRangeFromMonthKeys(
  indexedMonthKeysNewestFirst: string[],
  currentKey: string = currentMonthKey(),
): { fromDate: string; toDate: string } {
  const indexed = resolveFetchMonthKeys([], indexedMonthKeysNewestFirst);
  const keys = [...new Set([...indexed, currentKey])].sort();

  if (keys.length === 0) {
    const [y, m] = currentKey.split("-").map(Number);
    const fromDate = `${currentKey}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const toDate = `${currentKey}-${String(lastDay).padStart(2, "0")}`;
    return { fromDate, toDate };
  }

  const first = keys[0]!;
  const last = keys[keys.length - 1]!;
  const [ly, lm] = last.split("-").map(Number);
  const fromDate = `${first}-01`;
  const lastDay = new Date(ly, lm, 0).getDate();
  const toDate = `${last}-${String(lastDay).padStart(2, "0")}`;
  return { fromDate, toDate };
}

export async function buildAttendanceValidationRows(
  supabase: SupabaseClient,
  venueId: string,
  opts: { fromDate: string; toDate: string; empNo?: string | null },
): Promise<AttendanceValidationRow[]> {
  const empFilter = opts.empNo?.trim().toLowerCase() ?? null;

  const [staff, templates, days, roster, importRules] = await Promise.all([
    listStaffForVenue(supabase, venueId),
    listShiftTemplates(supabase, venueId, { includeInactive: true }),
    listAttendanceDays(supabase, venueId, {
      fromDate: opts.fromDate,
      toDate: opts.toDate,
      limit: 5000,
    }),
    listScheduleDaysByDateRange(supabase, venueId, {
      fromDate: opts.fromDate,
      toDate: opts.toDate,
    }),
    getHrVenueSetting<HrAttendanceImportRules>(
      supabase,
      venueId,
      HR_SETTINGS_KEYS.attendanceImportRules,
      DEFAULT_HR_ATTENDANCE_IMPORT_RULES,
    ),
  ]);

  const timezone = importRules.timezone || DEFAULT_HR_ATTENDANCE_IMPORT_RULES.timezone;
  const varianceMinutes =
    Number.isFinite(importRules.scheduleVarianceMinutes)
      ? Math.max(0, importRules.scheduleVarianceMinutes)
      : DEFAULT_SCHEDULE_VARIANCE_MINUTES;

  const staffByEmp = new Map(
    staff.map((s) => [s.emp_no.trim().toLowerCase(), s]),
  );
  const rosterFiltered = empFilter
    ? roster.filter((r) => r.emp_no.trim().toLowerCase() === empFilter)
    : roster;
  const rosterByKey = new Map(
    rosterFiltered.map((r) => [
      `${r.emp_no.trim().toLowerCase()}::${r.work_date}`,
      r,
    ]),
  );
  const templatesById = new Map((templates ?? []).map((t) => [t.id, t]));

  const rowsByKey = new Map<string, AttendanceValidationRow>();

  function scheduleTimesFor(
    labelCode: string | null | undefined,
    shiftTemplateId: string | null | undefined,
  ): {
    scheduleTime: string | null;
    scheduleStartTime: string | null;
    scheduleEndTime: string | null;
  } {
    if (labelCode !== "SHIFT" || !shiftTemplateId) {
      return {
        scheduleTime: null,
        scheduleStartTime: null,
        scheduleEndTime: null,
      };
    }
    const shiftTemplate = templatesById.get(shiftTemplateId);
    const start = shiftTemplate?.startTime ?? null;
    const end = shiftTemplate?.endTime ?? null;
    return {
      scheduleTime: formatScheduleTime(start, end),
      scheduleStartTime: start,
      scheduleEndTime: end,
    };
  }

  function shiftVarianceIssue(
    workDate: string,
    scheduleStart: string | null,
    scheduleEnd: string | null,
    clockIn: string | null,
    clockOut: string | null,
  ): string | null {
    if (!scheduleStart || !scheduleEnd || !clockIn || !clockOut) return null;
    const { maxDiffMinutes } = measureShiftPunchVariance({
      workDate,
      scheduleStart,
      scheduleEnd,
      clockIn,
      clockOut,
      timezone,
    });
    if (maxDiffMinutes == null || maxDiffMinutes <= varianceMinutes) return null;
    return `Clock times differ from schedule by ${maxDiffMinutes} min (limit ${varianceMinutes})`;
  }

  for (const day of days) {
    const empKey = day.emp_no.trim().toLowerCase();
    if (empFilter && empKey !== empFilter) continue;
    const key = `${empKey}::${day.work_date}`;
    const planned = rosterByKey.get(key);
    const person = staffByEmp.get(empKey);
    const schedule = scheduleTimesFor(
      planned?.label_code,
      planned?.shift_template_id,
    );
    let issue: string | null = null;

    if (planned?.label_code === "SHIFT" && day.status !== "complete") {
      issue = "Scheduled shift with incomplete attendance";
    } else if (
      planned &&
      planned.label_code !== "SHIFT" &&
      (day.clock_in || day.clock_out)
    ) {
      issue = `Punches on roster day “${planned.label_code}”`;
    } else if (!planned && (day.clock_in || day.clock_out)) {
      issue = "Attendance with no roster day";
    } else if (day.status === "missing_clock_out") {
      issue = "Missing clock out";
    } else if (day.status === "missing_clock_in") {
      issue = "Missing clock in";
    } else if (planned?.label_code === "SHIFT") {
      issue = shiftVarianceIssue(
        day.work_date,
        schedule.scheduleStartTime,
        schedule.scheduleEndTime,
        day.clock_in,
        day.clock_out,
      );
    }

    rowsByKey.set(key, {
      id: day.id,
      staffId: person?.id ?? day.staff_id ?? null,
      workDate: day.work_date,
      empNo: day.emp_no,
      fullName: person?.full_name ?? day.emp_no,
      departmentId: person?.department_id ?? null,
      rosterLabel: planned?.label_code ?? null,
      scheduleTime: schedule.scheduleTime,
      scheduleStartTime: schedule.scheduleStartTime,
      scheduleEndTime: schedule.scheduleEndTime,
      clockIn: day.clock_in,
      clockOut: day.clock_out,
      totalHours: day.total_hours,
      attendanceStatus: day.status,
      approvalStatus: day.approval_status,
      issue,
    });
  }

  for (const planned of rosterFiltered) {
    const empKey = planned.emp_no.trim().toLowerCase();
    if (empFilter && empKey !== empFilter) continue;
    const key = `${empKey}::${planned.work_date}`;
    if (rowsByKey.has(key)) continue;

    const person = staffByEmp.get(empKey);
    const schedule = scheduleTimesFor(
      planned.label_code,
      planned.shift_template_id,
    );
    const issue =
      planned.label_code === "SHIFT"
        ? "Scheduled shift with no attendance"
        : null;

    rowsByKey.set(key, {
      id: null,
      staffId: person?.id ?? planned.staff_id ?? null,
      workDate: planned.work_date,
      empNo: planned.emp_no,
      fullName: person?.full_name ?? planned.emp_no,
      departmentId: person?.department_id ?? null,
      rosterLabel: planned.label_code,
      scheduleTime: schedule.scheduleTime,
      scheduleStartTime: schedule.scheduleStartTime,
      scheduleEndTime: schedule.scheduleEndTime,
      clockIn: null,
      clockOut: null,
      totalHours: null,
      attendanceStatus: null,
      approvalStatus: null,
      issue,
    });
  }

  return [...rowsByKey.values()].sort((a, b) =>
    b.workDate.localeCompare(a.workDate),
  );
}

export function validationEmployeeOptions(
  staff: Awaited<ReturnType<typeof listStaffForVenue>>,
) {
  return staff
    .filter((s) =>
      VALIDATION_ELIGIBLE_STATUS_NAMES.has(s.employment_status?.name ?? ""),
    )
    .map((s) => ({
      id: s.id,
      empNo: s.emp_no,
      fullName: s.full_name,
      departmentId: s.department_id,
    }));
}
