import { UniformReplacementEmailSettingsPanel } from "@/components/hr/uniform-replacement-email-settings-panel";
import { UniformTermsEmailSettingsPanel } from "@/components/hr/uniform-terms-email-settings-panel";
import { getEmailTransportSettings } from "@/lib/actions/hr-email-transport";
import { getUniformReplacementEmailSettings } from "@/lib/actions/hr-uniform-replacement-email";
import { getUniformTermsEmailSettings } from "@/lib/actions/hr-uniform-terms-email";
import { getHrPageContext } from "@/lib/hr/page-context";
import { canAdminLookups, canEditStaff } from "@/lib/hr/permissions";

export default async function HrEmailsUniformSettingsPage() {
  const { venue, permissions } = await getHrPageContext();

  const canConfigure =
    canEditStaff(permissions, venue.id) ||
    canAdminLookups(permissions, venue.id);

  const [termsSettings, replacementSettings, transport] = await Promise.all([
    getUniformTermsEmailSettings(),
    getUniformReplacementEmailSettings(),
    getEmailTransportSettings(),
  ]);

  return (
    <div className="space-y-4">
      {canConfigure ? (
        <>
          <UniformTermsEmailSettingsPanel
            settings={termsSettings}
            connectionFromEmail={transport.smtp.fromEmail}
          />
          <UniformReplacementEmailSettingsPanel
            settings={replacementSettings}
            connectionFromEmail={transport.smtp.fromEmail}
          />
        </>
      ) : (
        <p className="text-sm text-black/55">
          You need staff edit access to change these settings.
        </p>
      )}
    </div>
  );
}
