import { HrSettingsSubNav } from "@/components/hr/hr-settings-sub-nav";
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
    return (
      <div className="mx-auto max-w-4xl">
        <p className="text-sm text-black/60">
          You do not have access to Human Resources settings for this venue.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <ModulePageTitle>Human Resources Settings</ModulePageTitle>
        <p className="mt-1 text-sm text-black/60">
          Configuration for {venue.name} — organised by Staff Details,
          Attendance, Pay, Boarding, Notifications, and Data Management.
        </p>
        <hr className="mt-4 border-black/10" />
      </div>

      <HrSettingsSubNav />

      {children}
    </div>
  );
}
