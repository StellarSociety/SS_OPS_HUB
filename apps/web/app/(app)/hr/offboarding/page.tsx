import { OffboardingPageClient } from "@/components/hr/offboarding-page-client";
import { listOffboardingProcesses } from "@/lib/actions/hr-offboarding";
import { canEditStaff, canViewStaff } from "@/lib/hr/permissions";
import { getHrPageContext } from "@/lib/hr/page-context";
import {
  listDepartments,
  listEmploymentStatuses,
  listPositions,
  listStaffForVenue,
} from "@/lib/hr/store";

export default async function HrOffboardingPage() {
  const { supabase, venue, permissions } = await getHrPageContext();

  if (!canViewStaff(permissions, venue.id)) {
    return (
      <p className="text-sm text-black/60">
        You do not have permission to view offboarding for this venue.
      </p>
    );
  }

  const [staff, departments, positions, statuses, processesResult] =
    await Promise.all([
      listStaffForVenue(supabase, venue.id),
      listDepartments(supabase, venue.id),
      listPositions(supabase, venue.id),
      listEmploymentStatuses(supabase),
      listOffboardingProcesses(),
    ]);

  return (
    <OffboardingPageClient
      venueName={venue.name ?? "Venue"}
      staff={staff}
      departments={departments}
      positions={positions}
      statuses={statuses}
      processes={processesResult.processes}
      canStart={canEditStaff(permissions, venue.id)}
    />
  );
}
