import { CertificationRequestEmailSettingsPanel } from "@/components/hr/certification-request-email-settings-panel";
import { getEmailTransportSettings } from "@/lib/actions/hr-email-transport";
import { getCertificationRequestEmailSettings } from "@/lib/actions/hr-certifications";
import { getHrPageContext } from "@/lib/hr/page-context";
import { canAdminLookups, canEditAssets, canEditStaff } from "@/lib/hr/permissions";

export default async function HrEmailsCertificationRequestSettingsPage() {
  const { venue, permissions } = await getHrPageContext();

  const canConfigure =
    canEditStaff(permissions, venue.id) ||
    canEditAssets(permissions, venue.id) ||
    canAdminLookups(permissions, venue.id);

  const [settings, transport] = await Promise.all([
    getCertificationRequestEmailSettings(),
    getEmailTransportSettings(),
  ]);

  return (
    <div className="space-y-4">
      {canConfigure ? (
        <CertificationRequestEmailSettingsPanel
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
