import { redirect } from "next/navigation";
import { scopedPath } from "@/lib/venue/active-venue";
import { HR_SETTINGS_ATTENDANCE_SCHEDULES_HREF } from "@/lib/hr/settings-nav";

export default async function HrAttendanceSettingsIndexPage() {
  redirect(await scopedPath(HR_SETTINGS_ATTENDANCE_SCHEDULES_HREF));
}
