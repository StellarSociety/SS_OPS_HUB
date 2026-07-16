import { redirect } from "next/navigation";
import { scopedPath } from "@/lib/venue/active-venue";
import { HR_SETTINGS_SCHEDULE_APPROVAL_HREF } from "@/lib/hr/settings-nav";

/** Legacy top-level path → Attendance subtab. */
export default async function HrScheduleApprovalSettingsRedirectPage() {
  redirect(await scopedPath(HR_SETTINGS_SCHEDULE_APPROVAL_HREF));
}
