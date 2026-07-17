import { AttendanceInsightsPanel } from "@/components/hr/attendance-insights-panel";
import { AttendanceMonthUrlPicker } from "@/components/hr/attendance-month-url-picker";
import {
  formatMonthKeyLabel,
  monthKeysFromSearchParams,
  rangeForMonthKeys,
  resolveFetchMonthKeys,
} from "@/lib/hr/attendance-months";
import { getHrPageContext } from "@/lib/hr/page-context";
import {
  listAttendanceDays,
  listAttendanceMonths,
  listStaffForVenue,
} from "@/lib/hr/store";

type Props = {
  searchParams: Promise<{ month?: string; months?: string }>;
};

export default async function AttendanceInsightsPage({ searchParams }: Props) {
  const { supabase, venue } = await getHrPageContext();
  const params = await searchParams;
  const selectedMonthKeys = monthKeysFromSearchParams(params);

  const [staff, months] = await Promise.all([
    listStaffForVenue(supabase, venue.id),
    listAttendanceMonths(supabase, venue.id),
  ]);

  const fetchMonthKeys = resolveFetchMonthKeys(
    selectedMonthKeys,
    months.map((m) => m.month_key),
  );
  const range = rangeForMonthKeys(fetchMonthKeys);

  const days = await listAttendanceDays(supabase, venue.id, {
    fromDate: range.fromDate,
    toDate: range.toDate,
    limit: 5000,
  });

  const staffByEmp: Record<
    string,
    {
      emp_no: string;
      full_name: string;
      department_id: string | null;
      department_name: string | null;
    }
  > = {};
  for (const s of staff) {
    staffByEmp[s.emp_no.trim().toLowerCase()] = {
      emp_no: s.emp_no,
      full_name: s.full_name,
      department_id: s.department_id,
      department_name: s.department?.name ?? null,
    };
  }

  const monthLabel =
    selectedMonthKeys.length === 0
      ? "all loaded months"
      : selectedMonthKeys.length === 1
        ? formatMonthKeyLabel(selectedMonthKeys[0]!)
        : `${selectedMonthKeys.length} months`;
  const availableHint =
    months.length > 0
      ? `${months[months.length - 1]?.month_key} → ${months[0]?.month_key}`
      : null;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-lg text-[#3D421F]">Insights</h2>
          <p className="text-sm text-black/55">
            Hours worked and punch completeness by staff for {monthLabel}
            {availableHint ? ` (indexed ${availableHint})` : ""}. Months are
            optional — week/day filters apply within the loaded slice.
          </p>
        </div>
        <AttendanceMonthUrlPicker selectedMonthKeys={selectedMonthKeys} />
      </div>
      <AttendanceInsightsPanel
        key={selectedMonthKeys.join(",") || "any"}
        days={days}
        staffByEmp={staffByEmp}
        defaultMonthKeys={selectedMonthKeys}
        monthPickerInParent
      />
    </section>
  );
}
