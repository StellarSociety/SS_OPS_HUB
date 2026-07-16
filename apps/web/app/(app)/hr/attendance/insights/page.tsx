import { AttendanceInsightsPanel } from "@/components/hr/attendance-insights-panel";
import { getHrPageContext } from "@/lib/hr/page-context";
import {
  getAttendanceCoverage,
  listAttendanceDays,
  listStaffForVenue,
} from "@/lib/hr/store";

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

function currentMonthKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export default async function AttendanceInsightsPage() {
  const { supabase, venue } = await getHrPageContext();
  const month = currentMonthRange();

  const [coverage, staff] = await Promise.all([
    getAttendanceCoverage(supabase, venue.id),
    listStaffForVenue(supabase, venue.id),
  ]);

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

  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-serif text-lg text-[#3D421F]">Insights</h2>
        <p className="text-sm text-black/55">
          Hours worked and punch completeness by staff, grouped by department.
          Filter by days, weeks, or months
          {coverage.minWorkDate && coverage.maxWorkDate
            ? ` (${coverage.minWorkDate} → ${coverage.maxWorkDate})`
            : ""}
          .
        </p>
      </div>
      <AttendanceInsightsPanel
        days={days}
        staffByEmp={staffByEmp}
        defaultMonthKey={currentMonthKey()}
      />
    </section>
  );
}
