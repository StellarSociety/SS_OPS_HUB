import { HrNotificationsSettingsSubNav } from "@/components/hr/hr-settings-inner-sub-nav";
import { HrSettingsSectionHeader } from "@/components/hr/hr-settings-section";

export default function HrNotificationsSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <HrSettingsSectionHeader
        title="Notifications"
        description="Email channels, role recipients, and document expiry reminders."
      />
      <HrNotificationsSettingsSubNav />
      <div className="w-full xl:w-2/3">{children}</div>
    </div>
  );
}
