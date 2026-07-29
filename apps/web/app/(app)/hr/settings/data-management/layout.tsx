import { HrDataManagementSubNav } from "@/components/hr/hr-data-management-sub-nav";
import { HrSettingsSectionHeader } from "@/components/hr/hr-settings-section";

export default function HrDataManagementLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <HrSettingsSectionHeader
        title="Data Management"
        description="Bulk import and export employee and attendance data via Excel templates."
      />
      <HrDataManagementSubNav />
      <div className="w-full xl:w-2/3">{children}</div>
    </div>
  );
}
