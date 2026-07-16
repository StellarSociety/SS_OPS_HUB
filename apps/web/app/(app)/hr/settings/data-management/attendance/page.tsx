import { AttendanceImportPanel } from "@/components/hr/attendance-import-panel";
import { canEditStaff } from "@/lib/hr/permissions";
import { getHrPageContext } from "@/lib/hr/page-context";
import {
  getAttendanceCoverage,
  listAttendanceImportBatches,
} from "@/lib/hr/store";

export default async function AttendanceDataManagementPage() {
  const { supabase, venue, permissions } = await getHrPageContext();
  const canEdit = canEditStaff(permissions, venue.id);

  const [coverage, batches] = await Promise.all([
    getAttendanceCoverage(supabase, venue.id),
    listAttendanceImportBatches(supabase, venue.id, 25),
  ]);

  return (
    <AttendanceImportPanel
      canEdit={canEdit}
      coverage={coverage}
      batches={batches}
    />
  );
}
