import { PayrollAdjustmentCodesPanel } from "@/components/hr/payroll-adjustment-codes-panel";
import { getHrPageContext } from "@/lib/hr/page-context";
import {
  mergePayrollAdjustmentCodes,
  type HrPayrollAdjustmentCodesSettings,
} from "@/lib/hr/payroll";
import { getHrVenueSetting } from "@/lib/hr/store";
import { HR_SETTINGS_KEYS } from "@/lib/hr/types";
import { canAdminLookups, canEditPayroll } from "@/lib/hr/permissions";

export default async function HrPayAdjustmentsSettingsPage() {
  const { supabase, venue, permissions } = await getHrPageContext();

  const canConfigure =
    canEditPayroll(permissions, venue.id) ||
    canAdminLookups(permissions, venue.id);

  const stored = await getHrVenueSetting<
    Partial<HrPayrollAdjustmentCodesSettings>
  >(supabase, venue.id, HR_SETTINGS_KEYS.payrollAdjustmentCodes, {});
  const codes = mergePayrollAdjustmentCodes(stored);

  return (
    <div className="space-y-4">
      {canConfigure ? (
        <PayrollAdjustmentCodesPanel codes={codes} />
      ) : (
        <p className="text-sm text-black/55">
          You need payroll edit access to change adjustment codes.
        </p>
      )}
    </div>
  );
}
