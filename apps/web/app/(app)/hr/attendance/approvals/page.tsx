import { AttendanceApprovalsTable } from "@/components/hr/attendance-approvals-table";
import { canEditStaff } from "@/lib/hr/permissions";
import { getHrPageContext } from "@/lib/hr/page-context";
import {
  listAttendanceDays,
  listScheduleDaysByDateRange,
  listStaffForVenue,
} from "@/lib/hr/store";

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function AttendanceApprovalsPage() {
  const { supabase, venue, permissions } = await getHrPageContext();
  const canEdit = canEditStaff(permissions, venue.id);
  const fromDate = daysAgoIso(21);
  const toDate = todayIso();

  const [days, roster, staff] = await Promise.all([
    listAttendanceDays(supabase, venue.id, { fromDate, toDate, limit: 500 }),
    listScheduleDaysByDateRange(supabase, venue.id, { fromDate, toDate }),
    listStaffForVenue(supabase, venue.id),
  ]);

  const staffByEmp = new Map(
    staff.map((s) => [s.emp_no.trim().toLowerCase(), s]),
  );
  const rosterByKey = new Map(
    roster.map((r) => [`${r.emp_no.trim().toLowerCase()}::${r.work_date}`, r]),
  );

  const rows = days.map((day) => {
    const key = `${day.emp_no.trim().toLowerCase()}::${day.work_date}`;
    const planned = rosterByKey.get(key);
    const person = staffByEmp.get(day.emp_no.trim().toLowerCase());
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

    return {
      id: day.id,
      workDate: day.work_date,
      empNo: day.emp_no,
      fullName: person?.full_name ?? day.emp_no,
      rosterLabel: planned?.label_code ?? null,
      clockIn: day.clock_in,
      clockOut: day.clock_out,
      totalHours: day.total_hours,
      attendanceStatus: day.status,
      approvalStatus: day.approval_status,
      issue,
    };
  });

  // Surface issues first
  rows.sort((a, b) => {
    const ai = a.issue ? 0 : 1;
    const bi = b.issue ? 0 : 1;
    if (ai !== bi) return ai - bi;
    return b.workDate.localeCompare(a.workDate);
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-serif text-lg text-[#3D421F]">Approvals</h2>
        <p className="mt-1 text-sm text-black/55">
          Validate imported attendance against the roster ({fromDate} – {toDate}).
          Flag or approve mismatches before payroll.
        </p>
      </div>
      <AttendanceApprovalsTable rows={rows} canEdit={canEdit} />
    </div>
  );
}
