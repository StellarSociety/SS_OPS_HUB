import { HrSettingsSubNav } from "@/components/hr/hr-settings-sub-nav";
import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import { ModulePageTitle } from "@/components/layout/module-page-title";
import { canAdminLookups } from "@/lib/hr/permissions";
import { getHrPageContext } from "@/lib/hr/page-context";

export default async function HrSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { venue, permissions } = await getHrPageContext();

  if (!canAdminLookups(permissions, venue.id)) {
    return <AccessDeniedBounce />;
  }

  return (
    <div className="mx-auto w-full max-w-none space-y-6">
      <div>
        <ModulePageTitle>Human Resources Settings</ModulePageTitle>
        <p className="mt-1 text-sm text-black/60">
          Configuration for {venue.name} — organised by Staff Details,
          Attendance, Pay, Boarding, Notifications, Data Management, and Emails.
        </p>
        <hr className="mt-4 border-black/10" />
      </div>

      <HrSettingsSubNav />

      {children}
    </div>
  );
}
