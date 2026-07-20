import { AttendanceRecordsTable } from "@/components/hr/attendance-records-table";
import {
  formatMonthKeyLabel,
  monthKeysFromSearchParams,
  rangeForMonthKeys,
  resolveFetchMonthKeys,
} from "@/lib/hr/attendance-months";
import {
  hrFiltersStorageKey,
  HR_ATTENDANCE_MONTHS_KEY,
  parseAttendanceMonthKeysCookie,
} from "@/lib/hr/hr-filters-storage";
import { getHrPageContext } from "@/lib/hr/page-context";
import {
  listAttendanceDays,
  listAttendanceMonths,
  listDepartments,
  listStaffForVenue,
} from "@/lib/hr/store";
import { cookies } from "next/headers";

type Props = {
  searchParams: Promise<{ month?: string; months?: string }>;
};

export default async function AttendanceRecordsPage({ searchParams }: Props) {
  const { supabase, venue } = await getHrPageContext();
  const params = await searchParams;
  const fromUrl = monthKeysFromSearchParams(params);
  const cookieStore = await cookies();
  const fromCookie = parseAttendanceMonthKeysCookie(
    cookieStore.get(hrFiltersStorageKey(HR_ATTENDANCE_MONTHS_KEY, venue.slug))
      ?.value,
  );
  const selectedMonthKeys = fromUrl.length > 0 ? fromUrl : fromCookie;

  const [staff, departments, months] = await Promise.all([
    listStaffForVenue(supabase, venue.id),
    listDepartments(supabase, venue.id),
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

  const departmentOptions = departments.map((d) => ({
    id: d.id,
    name: d.name,
  }));

  const monthLabel =
    selectedMonthKeys.length === 0
      ? "all loaded months"
      : selectedMonthKeys.length === 1
        ? formatMonthKeyLabel(selectedMonthKeys[0]!)
        : `${selectedMonthKeys.length} months`;
  const availableHint =
    months.length > 0
      ? `Indexed months: ${months[months.length - 1]?.month_key} → ${months[0]?.month_key}`
      : null;

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div>
          <h2 className="font-serif text-lg text-[#3D421F]">Recent records</h2>
          <p className="text-sm text-black/55">
            Showing {monthLabel}
            {availableHint ? ` · ${availableHint}` : ""}. Filter by employee,
            department, status, months, weeks, or days within the loaded slice.
          </p>
        </div>
        <AttendanceRecordsTable
          key={selectedMonthKeys.join(",") || "any"}
          days={days}
          staffByEmp={staffByEmp}
          departments={departmentOptions}
          monthKeys={selectedMonthKeys}
        />
      </section>
    </div>
  );
}
