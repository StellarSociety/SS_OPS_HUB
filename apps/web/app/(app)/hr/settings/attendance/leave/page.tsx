import { LeavePolicySettingsPanel } from "@/components/hr/leave-policy-settings-panel";
import { getLeavePolicySettings } from "@/lib/actions/hr-leave";
import { getHrPageContext } from "@/lib/hr/page-context";

export default async function HrLeaveSettingsPage() {
  await getHrPageContext();
  const settings = await getLeavePolicySettings();

  return <LeavePolicySettingsPanel settings={settings} />;
}
