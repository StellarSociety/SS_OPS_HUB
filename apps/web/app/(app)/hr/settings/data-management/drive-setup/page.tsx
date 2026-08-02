import { WorkDriveSetupPanel } from "@/components/hr/workdrive-setup-panel";
import { getWorkDriveSettings } from "@/lib/actions/hr-workdrive";
import { getHrPageContext } from "@/lib/hr/page-context";
import { canAdminLookups, canEditStaff } from "@/lib/hr/permissions";

export default async function HrDataManagementDriveSetupPage() {
  const { venue, permissions } = await getHrPageContext();

  const canConfigure =
    canAdminLookups(permissions, venue.id) ||
    canEditStaff(permissions, venue.id);

  const settings = await getWorkDriveSettings();

  return (
    <div className="space-y-4">
      {canConfigure ? (
        <WorkDriveSetupPanel settings={settings} />
      ) : (
        <p className="text-sm text-black/55">
          You need staff edit or lookups admin access to change Drive Setup.
        </p>
      )}
    </div>
  );
}
