import { PayslipEmailSettingsPanel } from "@/components/hr/payslip-email-settings-panel";
import { getEmailTransportSettings } from "@/lib/actions/hr-email-transport";
import { getPayslipEmailSettings } from "@/lib/actions/hr-payslip-email";
import { getHrPageContext } from "@/lib/hr/page-context";
import { canAdminLookups, canEditPayroll } from "@/lib/hr/permissions";

export default async function HrEmailsPayslipsSettingsPage() {
  const { venue, permissions } = await getHrPageContext();

  const canConfigure =
    canEditPayroll(permissions, venue.id) ||
    canAdminLookups(permissions, venue.id);

  const [settings, transport] = await Promise.all([
    getPayslipEmailSettings(),
    getEmailTransportSettings(),
  ]);

  return (
    <div className="space-y-4">
      {canConfigure ? (
        <PayslipEmailSettingsPanel
          settings={settings}
          connectionFromEmail={transport.smtp.fromEmail}
        />
      ) : (
        <p className="text-sm text-black/55">
          You need payroll edit access to change these settings.
        </p>
      )}
    </div>
  );
}
