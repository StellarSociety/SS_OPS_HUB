import { EmailTransportSettingsCard } from "@/components/hr/email-transport-settings-card";
import { getEmailTransportSettings } from "@/lib/actions/hr-email-transport";
import { getHrPageContext } from "@/lib/hr/page-context";
import { canAdminLookups, canEditPayroll } from "@/lib/hr/permissions";

export default async function HrEmailsConnectionSettingsPage() {
  const { venue, permissions } = await getHrPageContext();

  const canConfigure =
    canEditPayroll(permissions, venue.id) ||
    canAdminLookups(permissions, venue.id);

  const transport = await getEmailTransportSettings();

  return (
    <div className="space-y-4">
      {canConfigure ? (
        <EmailTransportSettingsCard settings={transport} />
      ) : (
        <p className="text-sm text-black/55">
          You need payroll edit access to change these settings.
        </p>
      )}
    </div>
  );
}
