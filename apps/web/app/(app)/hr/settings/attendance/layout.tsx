import { HrAttendanceSettingsSubNav } from "@/components/hr/hr-settings-inner-sub-nav";
import { HrSettingsSectionHeader } from "@/components/hr/hr-settings-section";

export default function HrAttendanceSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <HrSettingsSectionHeader
        title="Attendance"
        description="Schedule, attendance, and leave settings used on the roster and attendance modules."
      />
      <HrAttendanceSettingsSubNav />
      {children}
    </div>
  );
}
