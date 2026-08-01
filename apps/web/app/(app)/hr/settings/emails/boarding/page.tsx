import { BoardingEmailSettingsPanel } from "@/components/hr/boarding-email-settings-panel";
import { getBoardingEmailSettings } from "@/lib/actions/hr-boarding-email";
import { getHrPageContext } from "@/lib/hr/page-context";
import { canAdminLookups, canEditStaff } from "@/lib/hr/permissions";

export default async function HrEmailsBoardingSettingsPage() {
  const { venue, permissions } = await getHrPageContext();

  const canConfigure =
    canEditStaff(permissions, venue.id) ||
    canAdminLookups(permissions, venue.id);

  const settings = await getBoardingEmailSettings();

  return (
    <div className="space-y-4">
      {canConfigure ? (
        <BoardingEmailSettingsPanel settings={settings} />
      ) : (
        <p className="text-sm text-black/55">
          You need staff edit access to change these settings.
        </p>
      )}
    </div>
  );
}
