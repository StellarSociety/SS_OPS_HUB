import { UpdatedDocsRequestEmailSettingsPanel } from "@/components/hr/updated-docs-request-email-settings-panel";
import { getEmailTransportSettings } from "@/lib/actions/hr-email-transport";
import { getUpdatedDocsRequestEmailSettings } from "@/lib/actions/hr-updated-docs-request-email";
import { getHrPageContext } from "@/lib/hr/page-context";
import { canAdminLookups, canEditStaff } from "@/lib/hr/permissions";

export default async function HrEmailsUpdatedDocsRequestSettingsPage() {
  const { venue, permissions } = await getHrPageContext();

  const canConfigure =
    canEditStaff(permissions, venue.id) ||
    canAdminLookups(permissions, venue.id);

  const [settings, transport] = await Promise.all([
    getUpdatedDocsRequestEmailSettings(),
    getEmailTransportSettings(),
  ]);

  return (
    <div className="space-y-4">
      {canConfigure ? (
        <UpdatedDocsRequestEmailSettingsPanel
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
