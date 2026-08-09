import { AttendanceInsightsPanel } from "@/components/hr/attendance-insights-panel";
import {
  rangeForMonthKeys,
  resolveFetchMonthKeys,
} from "@/lib/hr/attendance-months";
import { isOutEmploymentStatus } from "@/lib/hr/employment-status";
import { getHrPageContext } from "@/lib/hr/page-context";
import {
  mergePayrollSettings,
  type HrPayrollSettings,
} from "@/lib/hr/payroll";
import {
  getHrVenueSetting,
  listAttendanceDays,
  listAttendanceMonths,
  listScheduleDaysByDateRange,
  listStaffForVenue,
} from "@/lib/hr/store";
import { HR_SETTINGS_KEYS } from "@/lib/hr/types";

export default async function AttendanceInsightsPage() {
  const { supabase, venue } = await getHrPageContext();

  const [staff, months, payrollRaw] = await Promise.all([
    listStaffForVenue(supabase, venue.id),
    listAttendanceMonths(supabase, venue.id),
    getHrVenueSetting<Partial<HrPayrollSettings>>(
      supabase,
      venue.id,
      HR_SETTINGS_KEYS.payroll,
      {},
    ),
  ]);

  const payrollSettings = mergePayrollSettings(payrollRaw);
  const fetchMonthKeys = resolveFetchMonthKeys(
    [],
    months.map((m) => m.month_key),
  );
  const range = rangeForMonthKeys(fetchMonthKeys);

  const [days, scheduleDays] = await Promise.all([
    listAttendanceDays(supabase, venue.id, {
      fromDate: range.fromDate,
      toDate: range.toDate,
      limit: 5000,
    }),
    listScheduleDaysByDateRange(supabase, venue.id, {
      fromDate: range.fromDate,
      toDate: range.toDate,
    }),
  ]);

  const staffByEmp: Record<
    string,
    {
      id: string;
      emp_no: string;
      full_name: string;
      photo_url: string | null;
      department_id: string | null;
      department_name: string | null;
      position_name: string | null;
      employment_status: string | null;
      working_status: string | null;
      nationality_name: string | null;
      dob: string | null;
      joining_date: string | null;
      termination_date: string | null;
    }
  > = {};
  const outEmpNos = new Set<string>();
  const includedStaffIds = new Set<string>();
  for (const s of staff) {
    const key = s.emp_no.trim().toLowerCase();
    if (isOutEmploymentStatus(s.employment_status?.name)) {
      outEmpNos.add(key);
      continue;
    }
    includedStaffIds.add(s.id);
    staffByEmp[key] = {
      id: s.id,
      emp_no: s.emp_no,
      full_name: s.full_name,
      photo_url: s.photo_url?.trim() || null,
      department_id: s.department_id,
      department_name: s.department?.name ?? null,
      position_name: s.position?.name ?? null,
      employment_status: s.employment_status?.name ?? null,
      working_status: s.working_status?.name ?? null,
      nationality_name: s.nationality?.name ?? null,
      dob: s.dob ?? null,
      joining_date: s.joining_date ?? null,
      termination_date: s.termination_date,
    };
  }

  const visibleDays = days.filter(
    (day) => !outEmpNos.has(day.emp_no.trim().toLowerCase()),
  );

  const scheduleDaysByStaffId: Record<
    string,
    Array<{ workDate: string; labelCode: string }>
  > = {};
  for (const day of scheduleDays) {
    if (!includedStaffIds.has(day.staff_id)) continue;
    const code = day.label_code?.trim();
    if (!code) continue;
    const list = scheduleDaysByStaffId[day.staff_id] ?? [];
    list.push({ workDate: day.work_date, labelCode: code });
    scheduleDaysByStaffId[day.staff_id] = list;
  }

  const availableHint =
    months.length > 0
      ? `${months[months.length - 1]?.month_key} → ${months[0]?.month_key}`
      : null;

  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-serif text-lg text-[#3D421F]">Insights</h2>
        <p className="text-sm text-black/55">
          Hours worked and punch completeness by staff
          {availableHint ? ` (indexed ${availableHint})` : ""}. Use payroll,
          week, or day filters within the loaded slice.
        </p>
      </div>
      <AttendanceInsightsPanel
        days={visibleDays}
        staffByEmp={staffByEmp}
        scheduleDaysByStaffId={scheduleDaysByStaffId}
        loadedFromDate={range.fromDate}
        loadedToDate={range.toDate}
        payrollPeriodStartDay={payrollSettings.periodStartDay}
        payrollPeriodEndDay={payrollSettings.periodEndDay}
      />
    </section>
  );
}
