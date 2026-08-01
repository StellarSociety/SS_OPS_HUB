import { PayrollApprovalsSettingsPanel } from "@/components/hr/payroll-approvals-settings-panel";
import {
  getPayrollApprovalsSettings,
  listPayrollApproverCandidates,
} from "@/lib/actions/hr-payroll-approvals";
import { getHrPageContext } from "@/lib/hr/page-context";
import { canAdminLookups, canEditPayroll } from "@/lib/hr/permissions";

export default async function HrPayrollApprovalsSettingsPage() {
  const { venue, permissions } = await getHrPageContext();

  const canConfigure =
    canEditPayroll(permissions, venue.id) ||
    canAdminLookups(permissions, venue.id);

  const [settings, candidatesResult] = await Promise.all([
    getPayrollApprovalsSettings(),
    listPayrollApproverCandidates(),
  ]);

  return (
    <div className="space-y-4">
      {canConfigure ? (
        <PayrollApprovalsSettingsPanel
          section="approvers"
          settings={settings}
          candidates={candidatesResult.candidates ?? []}
        />
      ) : (
        <p className="text-sm text-black/55">
          You need payroll edit access to change these settings.
        </p>
      )}
    </div>
  );
}
