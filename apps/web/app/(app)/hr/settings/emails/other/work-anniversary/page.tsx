import { WorkAnniversaryEmailSettingsPanel } from "@/components/hr/work-anniversary-email-settings-panel";
import { getEmailTransportSettings } from "@/lib/actions/hr-email-transport";
import { getWorkAnniversaryEmailSettings } from "@/lib/actions/hr-work-anniversary-email";
import { getHrPageContext } from "@/lib/hr/page-context";
import { canAdminLookups, canEditStaff } from "@/lib/hr/permissions";

export default async function HrEmailsWorkAnniversarySettingsPage() {
  const { venue, permissions } = await getHrPageContext();

  const canConfigure =
    canEditStaff(permissions, venue.id) ||
    canAdminLookups(permissions, venue.id);

  const [settings, transport] = await Promise.all([
    getWorkAnniversaryEmailSettings(),
    getEmailTransportSettings(),
  ]);

  return (
    <div className="space-y-4">
      {canConfigure ? (
        <WorkAnniversaryEmailSettingsPanel
          settings={settings}
          connectionFromEmail={transport.smtp.fromEmail}
        />
      ) : (
        <p className="text-sm text-black/55">
          You need staff edit access to change these settings.
        </p>
      )}
    </div>
  );
}
