import { StaffSubNav } from "@/components/hr/staff-sub-nav";
import { ModulePageTitle } from "@/components/layout/module-page-title";
import { canAccessStaff } from "@/lib/hr/permissions";
import { getHrPageContext } from "@/lib/hr/page-context";

export default async function StaffDirectoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { venue, permissions } = await getHrPageContext();

  if (!canAccessStaff(permissions, venue.id)) {
    return (
      <div className="mx-auto max-w-4xl">
        <p className="text-sm text-black/60">
          You do not have access to Human Resources for this venue.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-none space-y-6">
      <div>
        <ModulePageTitle>Staff directory</ModulePageTitle>
        <p className="mt-1 text-sm text-black/60">
          {venue.is_global
            ? "Group staff — corporate and multi-venue personnel"
            : `${venue.name} venue staff roster`}
        </p>
        <hr className="mt-4 border-black/10" />
      </div>

      <StaffSubNav />

      {children}
    </div>
  );
}
