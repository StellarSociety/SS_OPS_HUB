import { AttendanceImportRulesPanel } from "@/components/hr/attendance-import-rules-panel";
import { getHrPageContext } from "@/lib/hr/page-context";
import { getHrVenueSetting } from "@/lib/hr/store";
import {
  DEFAULT_HR_ATTENDANCE_IMPORT_RULES,
  HR_SETTINGS_KEYS,
  type HrAttendanceImportRules,
} from "@/lib/hr/types";

export default async function HrShiftImportRulesSettingsPage() {
  const { supabase, venue } = await getHrPageContext();
  const settings = await getHrVenueSetting<HrAttendanceImportRules>(
    supabase,
    venue.id,
    HR_SETTINGS_KEYS.attendanceImportRules,
    DEFAULT_HR_ATTENDANCE_IMPORT_RULES,
  );

  return <AttendanceImportRulesPanel settings={settings} />;
}
