import { AttendanceApprovalsTable } from "@/components/hr/attendance-approvals-table";
import { canEditSchedules } from "@/lib/hr/permissions";
import { getHrPageContext } from "@/lib/hr/page-context";
import {
  getAttendanceCoverage,
  listAttendanceDays,
  listDepartments,
  listPublicHolidays,
  listScheduleDayLabels,
  listScheduleDaysByDateRange,
  listShiftTemplates,
  listStaffForVenue,
} from "@/lib/hr/store";
import {
  DEFAULT_SCHEDULE_DAY_LABELS,
  withFallbackScheduleLabelIds,
} from "@/lib/hr/schedules";
import { EMPLOYMENT_STATUS_NAMES } from "@/lib/hr/employment-status";

const VALIDATION_ELIGIBLE_STATUS_NAMES = new Set<string>([
  EMPLOYMENT_STATUS_NAMES.onBoard,
  EMPLOYMENT_STATUS_NAMES.offBoard,
]);

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatScheduleTime(
  startTime: string | null | undefined,
  endTime: string | null | undefined,
): string | null {
  if (!startTime || !endTime) return null;
  return `${startTime} – ${endTime}`;
}

export default async function AttendanceValidationPage() {
  const { supabase, venue, permissions } = await getHrPageContext();
  const canEditRoster = canEditSchedules(permissions, venue.id);

  const [coverage, staff, departments, templates, scheduleLabels] =
    await Promise.all([
      getAttendanceCoverage(supabase, venue.id),
      listStaffForVenue(supabase, venue.id),
      listDepartments(supabase, venue.id),
      listShiftTemplates(supabase, venue.id, { includeInactive: true }),
      listScheduleDayLabels(supabase),
    ]);

  const fromDate = coverage.minWorkDate ?? daysAgoIso(90);
  const toDate = coverage.maxWorkDate ?? todayIso();
  const holidayYear = new Date().getFullYear();

  const [days, roster, publicHolidays] = await Promise.all([
    listAttendanceDays(supabase, venue.id, {
      fromDate,
      toDate,
      limit: 10000,
    }),
    listScheduleDaysByDateRange(supabase, venue.id, { fromDate, toDate }),
    listPublicHolidays(supabase, venue.id, {
      fromDate: `${holidayYear - 1}-01-01`,
      toDate: `${holidayYear + 1}-12-31`,
    }),
  ]);

  const staffByEmp = new Map(
    staff.map((s) => [s.emp_no.trim().toLowerCase(), s]),
  );
  const rosterByKey = new Map(
    roster.map((r) => [`${r.emp_no.trim().toLowerCase()}::${r.work_date}`, r]),
  );
  const templatesById = new Map((templates ?? []).map((t) => [t.id, t]));

  type BuiltRow = {
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
    issue: string | null;
  };

  const rowsByKey = new Map<string, BuiltRow>();

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
      issue,
    });
  }

  // Roster days with no attendance record still appear in validation.
  for (const planned of roster) {
    const empKey = planned.emp_no.trim().toLowerCase();
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
      issue,
    });
  }

  const rows = [...rowsByKey.values()].sort((a, b) =>
    b.workDate.localeCompare(a.workDate),
  );

  const departmentOptions = departments.map((d) => ({
    id: d.id,
    name: d.name,
  }));

  const employees = staff
    .filter((s) =>
      VALIDATION_ELIGIBLE_STATUS_NAMES.has(s.employment_status?.name ?? ""),
    )
    .map((s) => ({
      id: s.id,
      empNo: s.emp_no,
      fullName: s.full_name,
      departmentId: s.department_id,
    }));

  const labelOptions = (
    scheduleLabels ?? withFallbackScheduleLabelIds(DEFAULT_SCHEDULE_DAY_LABELS)
  ).map((label) => ({
    code: label.code,
    abbreviation: label.abbreviation,
    name: label.name,
    bgColor: label.bgColor,
    textColor: label.textColor,
    borderColor: label.borderColor,
  }));

  const publicHolidayByDate: Record<string, string> = {};
  for (const holiday of publicHolidays ?? []) {
    publicHolidayByDate[holiday.holidayDate] = holiday.name;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-serif text-lg text-[#3D421F]">Validation</h2>
        <p className="mt-1 text-sm text-black/55">
          Select a department, employee, and week(s). Stage SH / ABS / PH / AL /
          SL / UPL on any days, then Save to update the schedule roster.
        </p>
      </div>
      <AttendanceApprovalsTable
        rows={rows}
        departments={departmentOptions}
        employees={employees}
        scheduleLabels={labelOptions}
        publicHolidayByDate={publicHolidayByDate}
        canEditRoster={canEditRoster}
      />
    </div>
  );
}
