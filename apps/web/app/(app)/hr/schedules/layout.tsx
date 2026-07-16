import { ModulePageTitle } from "@/components/layout/module-page-title";
import { canAccessSchedules } from "@/lib/hr/permissions";
import { getHrPageContext } from "@/lib/hr/page-context";

export default async function SchedulesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { venue, permissions } = await getHrPageContext();

  if (!canAccessSchedules(permissions, venue.id)) {
    return (
      <div className="mx-auto max-w-4xl">
        <p className="text-sm text-black/60">
          You do not have access to Schedules for this venue.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-none space-y-6">
      <div>
        <ModulePageTitle>Schedules</ModulePageTitle>
        <p className="mt-1 text-sm text-black/60">
          {venue.is_global
            ? "Staff schedules across all venues"
            : `${venue.name} staff schedules`}
        </p>
        <hr className="mt-4 border-black/10" />
      </div>

      {children}
    </div>
  );
}
