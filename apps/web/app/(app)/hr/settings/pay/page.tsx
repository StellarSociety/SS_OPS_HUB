import { PayrollSettingsForm } from "@/components/hr/payroll-settings-form";
import { HrSettingsSectionHeader } from "@/components/hr/hr-settings-section";
import { getHrPageContext } from "@/lib/hr/page-context";
import {
  DEFAULT_HR_PAYROLL_SETTINGS,
  mergePayrollSettings,
} from "@/lib/hr/payroll";
import { getHrVenueSetting } from "@/lib/hr/store";
import { HR_SETTINGS_KEYS } from "@/lib/hr/types";
import { canAdminLookups, canEditPayroll } from "@/lib/hr/permissions";

export default async function HrPaySettingsPage() {
  const { supabase, venue, permissions } = await getHrPageContext();

  const canConfigure =
    canEditPayroll(permissions, venue.id) ||
    canAdminLookups(permissions, venue.id);

  const stored = await getHrVenueSetting<
    Partial<typeof DEFAULT_HR_PAYROLL_SETTINGS>
  >(supabase, venue.id, HR_SETTINGS_KEYS.payroll, {});
  const settings = mergePayrollSettings(stored);

  return (
    <div className="space-y-4">
      <HrSettingsSectionHeader
        title="Pay"
        description="Payroll period, payment date rules, WPS identifiers, and GL accounts for this venue. Salary package defaults for new staff are under Staff Details → Salary Defaults."
      />
      {canConfigure ? (
        <PayrollSettingsForm settings={settings} />
      ) : (
        <p className="text-sm text-black/55">
          You need payroll edit access to change these settings.
        </p>
      )}
    </div>
  );
}
