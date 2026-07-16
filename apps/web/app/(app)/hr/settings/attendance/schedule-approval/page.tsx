import { ScheduleApprovalSettingsPanel } from "@/components/hr/schedule-approval-settings-panel";
import {
  getScheduleApprovalSettings,
  listScheduleApproverCandidates,
} from "@/lib/actions/hr-schedule-approval";
import { getHrPageContext } from "@/lib/hr/page-context";

export default async function HrAttendanceScheduleApprovalPage() {
  await getHrPageContext();
  const [settings, candidatesResult] = await Promise.all([
    getScheduleApprovalSettings(),
    listScheduleApproverCandidates(),
  ]);

  return (
    <ScheduleApprovalSettingsPanel
      settings={settings}
      candidates={candidatesResult.candidates ?? []}
    />
  );
}
