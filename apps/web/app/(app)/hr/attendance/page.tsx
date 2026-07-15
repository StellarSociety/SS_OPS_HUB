import { AttendanceImportPanel } from "@/components/hr/attendance-import-panel";
import { AttendanceRecordsTable } from "@/components/hr/attendance-records-table";
import { canEditStaff } from "@/lib/hr/permissions";
import { getHrPageContext } from "@/lib/hr/page-context";
import {
  getHrVenueSetting,
  listAttendanceDays,
  listAttendanceImportBatches,
  listStaffForVenue,
} from "@/lib/hr/store";
import {
  DEFAULT_HR_ATTENDANCE_IMPORT_RULES,
  HR_SETTINGS_KEYS,
  type HrAttendanceImportRules,
} from "@/lib/hr/types";

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function AttendanceRecordsPage() {
  const { supabase, venue, permissions } = await getHrPageContext();
  const canEdit = canEditStaff(permissions, venue.id);
  const fromDate = daysAgoIso(45);
  const toDate = todayIso();

  const [days, staff, batches, importRules] = await Promise.all([
    listAttendanceDays(supabase, venue.id, { fromDate, toDate, limit: 400 }),
    listStaffForVenue(supabase, venue.id),
    listAttendanceImportBatches(supabase, venue.id, 5),
    getHrVenueSetting<HrAttendanceImportRules>(
      supabase,
      venue.id,
      HR_SETTINGS_KEYS.attendanceImportRules,
      DEFAULT_HR_ATTENDANCE_IMPORT_RULES,
    ),
  ]);

  const staffByEmp: Record<string, { emp_no: string; full_name: string }> = {};
  for (const s of staff) {
    staffByEmp[s.emp_no.trim().toLowerCase()] = {
      emp_no: s.emp_no,
      full_name: s.full_name,
    };
  }

  return (
    <div className="space-y-6">
      <AttendanceImportPanel canEdit={canEdit} importRules={importRules} />

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-serif text-lg text-[#3D421F]">Recent records</h2>
            <p className="text-sm text-black/55">
              Work days from {fromDate} to {toDate} (per employee: clock in,
              clock out, hours).
            </p>
          </div>
          {batches[0] ? (
            <p className="text-xs text-black/45">
              Last import: {batches[0].filename ?? "file"} ·{" "}
              {batches[0].day_count} days ·{" "}
              {new Date(batches[0].imported_at).toLocaleString()}
            </p>
          ) : null}
        </div>
        <AttendanceRecordsTable days={days} staffByEmp={staffByEmp} />
      </section>
    </div>
  );
}
