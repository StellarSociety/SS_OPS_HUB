import { HrNotificationsSettingsSubNav } from "@/components/hr/hr-settings-inner-sub-nav";

export default function HrNotificationsSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-serif text-2xl text-[#3D421F]">Notifications</h2>
        <p className="mt-1 text-sm text-black/60">
          Email channels, role recipients, and document expiry reminders.
        </p>
      </div>
      <HrNotificationsSettingsSubNav />
      {children}
    </div>
  );
}
