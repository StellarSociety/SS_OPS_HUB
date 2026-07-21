import { HrStaffDetailsSubNav } from "@/components/hr/hr-settings-inner-sub-nav";
import { HrSettingsSectionHeader } from "@/components/hr/hr-settings-section";

export default function HrStaffDetailsSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <HrSettingsSectionHeader
        title="Staff Details"
        description="Profile lookups and salary defaults used across the staff directory, insurance, and certifications."
      />
      <HrStaffDetailsSubNav />
      {children}
    </div>
  );
}
