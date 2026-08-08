import { VisaRequestEmailSettingsPanel } from "@/components/hr/visa-request-email-settings-panel";
import { getEmailTransportSettings } from "@/lib/actions/hr-email-transport";
import { getVisaRequestEmailSettings } from "@/lib/actions/hr-visa";
import { getHrPageContext } from "@/lib/hr/page-context";
import { canAdminLookups, canEditAssets, canEditStaff } from "@/lib/hr/permissions";

export default async function HrEmailsVisaRequestSettingsPage() {
  const { venue, permissions } = await getHrPageContext();

  const canConfigure =
    canEditStaff(permissions, venue.id) ||
    canEditAssets(permissions, venue.id) ||
    canAdminLookups(permissions, venue.id);

  const [settings, transport] = await Promise.all([
    getVisaRequestEmailSettings(),
    getEmailTransportSettings(),
  ]);

  return (
    <div className="space-y-4">
      {canConfigure ? (
        <VisaRequestEmailSettingsPanel
          settings={settings}
          connectionFromEmail={transport.smtp.fromEmail}
        />
      ) : (
        <p className="text-sm text-black/55">
          You need staff or assets edit access to change these settings.
        </p>
      )}
    </div>
  );
}
