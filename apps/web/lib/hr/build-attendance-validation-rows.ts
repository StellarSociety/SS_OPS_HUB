import type { SupabaseClient } from "@supabase/supabase-js";
import { currentMonthKey, resolveFetchMonthKeys } from "@/lib/hr/attendance-months";
import { EMPLOYMENT_STATUS_NAMES } from "@/lib/hr/employment-status";
import {
  listAttendanceDays,
  listScheduleDaysByDateRange,
  listShiftTemplates,
  listStaffForVenue,
} from "@/lib/hr/store";

export type AttendanceValidationRow = {
  id: string | null;
  staffId: string | null;
  workDate: string;
  empNo: string;
  fullName: string;
  departmentId: string | null;
  rosterLabel: string | null;
  scheduleTime: string | null;
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

  const [staff, templates, days, roster] = await Promise.all([
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
  ]);

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

  function scheduleTimeFor(
    labelCode: string | null | undefined,
    shiftTemplateId: string | null | undefined,
  ): string | null {
    if (labelCode !== "SHIFT" || !shiftTemplateId) return null;
    const shiftTemplate = templatesById.get(shiftTemplateId);
    return formatScheduleTime(shiftTemplate?.startTime, shiftTemplate?.endTime);
  }

  for (const day of days) {
    const empKey = day.emp_no.trim().toLowerCase();
    if (empFilter && empKey !== empFilter) continue;
    const key = `${empKey}::${day.work_date}`;
    const planned = rosterByKey.get(key);
    const person = staffByEmp.get(empKey);
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
    }

    rowsByKey.set(key, {
      id: day.id,
      staffId: person?.id ?? day.staff_id ?? null,
      workDate: day.work_date,
      empNo: day.emp_no,
      fullName: person?.full_name ?? day.emp_no,
      departmentId: person?.department_id ?? null,
      rosterLabel: planned?.label_code ?? null,
      scheduleTime: scheduleTimeFor(
        planned?.label_code,
        planned?.shift_template_id,
      ),
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
      scheduleTime: scheduleTimeFor(
        planned.label_code,
        planned.shift_template_id,
      ),
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
