import { AssetReplacementEmailSettingsPanel } from "@/components/hr/asset-replacement-email-settings-panel";
import { AssetTermsEmailSettingsPanel } from "@/components/hr/asset-terms-email-settings-panel";
import { getEmailTransportSettings } from "@/lib/actions/hr-email-transport";
import { getAssetReplacementEmailSettings } from "@/lib/actions/hr-asset-replacement-email";
import { getAssetTermsEmailSettings } from "@/lib/actions/hr-asset-terms-email";
import { getHrPageContext } from "@/lib/hr/page-context";
import { canAdminLookups, canEditStaff } from "@/lib/hr/permissions";

export default async function HrEmailsAssetSettingsPage() {
  const { venue, permissions } = await getHrPageContext();

  const canConfigure =
    canEditStaff(permissions, venue.id) ||
    canAdminLookups(permissions, venue.id);

  const [termsSettings, replacementSettings, transport] = await Promise.all([
    getAssetTermsEmailSettings(),
    getAssetReplacementEmailSettings(),
    getEmailTransportSettings(),
  ]);

  return (
    <div className="space-y-4">
      {canConfigure ? (
        <>
          <AssetTermsEmailSettingsPanel
            settings={termsSettings}
            connectionFromEmail={transport.smtp.fromEmail}
          />
          <AssetReplacementEmailSettingsPanel
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
