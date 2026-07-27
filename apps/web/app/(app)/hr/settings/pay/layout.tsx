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
        description="Payroll period, payment rules, WPS / GL accounts, and adjustment code catalogues for this venue. Salary package defaults for new staff are under Staff Details → Salary Defaults."
      />
      <HrPaySettingsSubNav />
      {children}
    </div>
  );
}
