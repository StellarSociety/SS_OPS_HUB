import { PositionSalaryEmailSettingsPanel } from "@/components/hr/position-salary-email-settings-panel";
import { getEmailTransportSettings } from "@/lib/actions/hr-email-transport";
import { getPositionSalaryEmailSettings } from "@/lib/actions/hr-position-salary-email";
import { getHrPageContext } from "@/lib/hr/page-context";
import { canAdminLookups, canEditStaff } from "@/lib/hr/permissions";
import { resolveCompanyName } from "@/lib/hr/process-position-salary-emails";
import { createServiceClient } from "@/lib/supabase/service";

export default async function HrEmailsPositionSalarySettingsPage() {
  const { venue, permissions } = await getHrPageContext();

  const canConfigure =
    canEditStaff(permissions, venue.id) ||
    canAdminLookups(permissions, venue.id);

  const [settings, transport] = await Promise.all([
    getPositionSalaryEmailSettings(),
    getEmailTransportSettings(),
  ]);
  const defaultCompanyName = await resolveCompanyName(
    createServiceClient(),
    venue,
    { ...settings, companyName: "" },
  );

  return (
    <div className="space-y-4">
      {canConfigure ? (
        <PositionSalaryEmailSettingsPanel
          settings={settings}
          connectionFromEmail={transport.smtp.fromEmail}
          defaultCompanyName={defaultCompanyName}
        />
      ) : (
        <p className="text-sm text-black/55">
          You need staff edit access to change these settings.
        </p>
      )}
    </div>
  );
}
