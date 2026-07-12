import { StaffDirectory } from "@/components/hr/staff-directory";
import { ModulePageTitle } from "@/components/layout/module-page-title";
import { canAccessStaff } from "@/lib/hr/permissions";
import { getHrPageContext } from "@/lib/hr/page-context";
import {
  listDepartments,
  listEmploymentStatuses,
  listStaffForVenue,
} from "@/lib/hr/store";

export default async function StaffDirectoryPage() {
  const { supabase, venue, permissions } = await getHrPageContext();

  if (!canAccessStaff(permissions, venue.id)) {
    return (
      <div className="mx-auto max-w-4xl">
        <p className="text-sm text-black/60">
          You do not have access to Human Resources for this venue.
        </p>
      </div>
    );
  }

  const [staff, departments, statuses] = await Promise.all([
    listStaffForVenue(supabase, venue.id),
    listDepartments(supabase, venue.id),
    listEmploymentStatuses(supabase),
  ]);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <ModulePageTitle>Staff directory</ModulePageTitle>
        <p className="mt-1 text-sm text-black/60">
          {venue.is_global
            ? "Group staff — corporate and multi-venue personnel"
            : `${venue.name} venue staff roster`}
        </p>
      </div>

      <StaffDirectory
        staff={staff}
        departments={departments}
        statuses={statuses}
      />
    </div>
  );
}
