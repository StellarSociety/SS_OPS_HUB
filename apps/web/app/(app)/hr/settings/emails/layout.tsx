import { HrEmailsSettingsSubNav } from "@/components/hr/hr-settings-inner-sub-nav";
import { HrSettingsSectionHeader } from "@/components/hr/hr-settings-section";

export default function HrEmailsSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <HrSettingsSectionHeader
        title="Emails"
        description="Mailbox connection, default header and footer, payroll package email, and employee payslip delivery for this venue."
      />
      <HrEmailsSettingsSubNav />
      {/* Full width on smaller viewports; ~2/3 of the window once there’s room. */}
      <div className="w-full min-w-0 2xl:w-[min(100%,66.666vw)]">
        {children}
      </div>
    </div>
  );
}
