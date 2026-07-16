import { AttendanceRecordsTable } from "@/components/hr/attendance-records-table";
import { getHrPageContext } from "@/lib/hr/page-context";
import {
  getAttendanceCoverage,
  listAttendanceDays,
  listDepartments,
  listStaffForVenue,
} from "@/lib/hr/store";

/** Inclusive YYYY-MM-DD range for the current local calendar month. */
function currentMonthRange(): { fromDate: string; toDate: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const pad = (n: number) => String(n).padStart(2, "0");
  const fromDate = `${y}-${pad(m + 1)}-01`;
  const lastDay = new Date(y, m + 1, 0).getDate();
  const toDate = `${y}-${pad(m + 1)}-${pad(lastDay)}`;
  return { fromDate, toDate };
}

function monthLabel(fromDate: string): string {
  const [y, m] = fromDate.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleString(undefined, { month: "long", year: "numeric" });
}

export default async function AttendanceRecordsPage() {
  const { supabase, venue } = await getHrPageContext();
  const month = currentMonthRange();

  const [coverage, staff, departments] = await Promise.all([
    getAttendanceCoverage(supabase, venue.id),
    listStaffForVenue(supabase, venue.id),
    listDepartments(supabase, venue.id),
  ]);

  // Load full history so week/day filters can reach older records.
  const loadFrom = coverage.minWorkDate ?? month.fromDate;
  const loadTo = coverage.maxWorkDate ?? month.toDate;
  const days = await listAttendanceDays(supabase, venue.id, {
    fromDate: loadFrom,
    toDate: loadTo,
    limit: 10000,
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

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div>
          <h2 className="font-serif text-lg text-[#3D421F]">Recent records</h2>
          <p className="text-sm text-black/55">
            Showing {monthLabel(month.fromDate)} by default — use Weeks or Days
            to browse earlier records
            {coverage.minWorkDate && coverage.maxWorkDate
              ? ` (${coverage.minWorkDate} → ${coverage.maxWorkDate})`
              : ""}
            .
          </p>
        </div>
        <AttendanceRecordsTable
          days={days}
          staffByEmp={staffByEmp}
          departments={departmentOptions}
          defaultDayStart={month.fromDate}
          defaultDayEnd={month.toDate}
        />
      </section>
    </div>
  );
}
