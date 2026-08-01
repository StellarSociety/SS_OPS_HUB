import { PayslipLetterheadSettingsPanel } from "@/components/hr/payslip-letterhead-settings-panel";
import { getPayslipLetterheadSettings } from "@/lib/actions/hr-payslip-letterhead";
import { getHrPageContext } from "@/lib/hr/page-context";
import { canAdminLookups, canEditPayroll } from "@/lib/hr/permissions";

export default async function HrPayPayslipDocumentSettingsPage() {
  const { venue, permissions } = await getHrPageContext();

  const canConfigure =
    canEditPayroll(permissions, venue.id) ||
    canAdminLookups(permissions, venue.id);

  const settings = await getPayslipLetterheadSettings();

  return (
    <div className="space-y-4">
      {canConfigure ? (
        <PayslipLetterheadSettingsPanel settings={settings} />
      ) : (
        <p className="text-sm text-black/55">
          You need payroll edit access to change these settings.
        </p>
      )}
    </div>
  );
}
