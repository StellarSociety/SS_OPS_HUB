import { HrPaySettingsSubNav } from "@/components/hr/hr-settings-inner-sub-nav";
import { HrSettingsSectionHeader } from "@/components/hr/hr-settings-section";

export default function HrPaySettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <HrSettingsSectionHeader
        title="Pay"
        description="Payroll period, payment rules, WPS / GL accounts, adjustment codes, and benefits (gratuity / service charge) policy for this venue. Salary package defaults for new staff are under Staff Details → Salary Defaults."
      />
      <HrPaySettingsSubNav />
      <div className="w-full xl:w-2/3">{children}</div>
    </div>
  );
}
