import { ModulePageTitle } from "@/components/layout/module-page-title";
import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import { canAccessSchedules } from "@/lib/hr/permissions";
import { getHrPageContext } from "@/lib/hr/page-context";

export default async function SchedulesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { venue, permissions } = await getHrPageContext();

  if (!canAccessSchedules(permissions, venue.id)) {
    return <AccessDeniedBounce />;
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
