import { AttendanceApprovalsTable } from "@/components/hr/attendance-approvals-table";
import { currentMonthKey } from "@/lib/hr/attendance-months";
import {
  buildAttendanceValidationRows,
  validationEmployeeOptions,
  validationFetchRangeFromMonthKeys,
} from "@/lib/hr/build-attendance-validation-rows";
import { canEditSchedules } from "@/lib/hr/permissions";
import { getHrPageContext } from "@/lib/hr/page-context";
import {
  DEFAULT_SCHEDULE_DAY_LABELS,
  withFallbackScheduleLabelIds,
} from "@/lib/hr/schedules";
import {
  listAttendanceMonths,
  listDepartments,
  listPublicHolidays,
  listScheduleDayLabels,
  listStaffForVenue,
} from "@/lib/hr/store";

export default async function AttendanceValidationPage() {
  const { supabase, venue, permissions } = await getHrPageContext();
  const canEditRoster = canEditSchedules(permissions, venue.id);

  const months = await listAttendanceMonths(supabase, venue.id);
  const range = validationFetchRangeFromMonthKeys(
    months.map((m) => m.month_key),
    currentMonthKey(),
  );
  const fromDate = range.fromDate;
  const toDate = range.toDate;
  const holidayYear = Number(fromDate.slice(0, 4)) || new Date().getFullYear();

  const [staff, departments, scheduleLabels, rows, publicHolidays] =
    await Promise.all([
      listStaffForVenue(supabase, venue.id),
      listDepartments(supabase, venue.id),
      listScheduleDayLabels(supabase),
      buildAttendanceValidationRows(supabase, venue.id, { fromDate, toDate }),
      listPublicHolidays(supabase, venue.id, {
        fromDate: `${holidayYear - 1}-01-01`,
        toDate: `${holidayYear + 1}-12-31`,
      }),
    ]);

  const departmentOptions = departments.map((d) => ({
    id: d.id,
    name: d.name,
  }));

  const employees = validationEmployeeOptions(staff);

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
          Select a department, employee, and week(s). Stage SH / OFF / ABS / PH /
          AL / SL / UPL, Save roster edits, then Approve Attendance so hours can
          feed payroll and leave.
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
