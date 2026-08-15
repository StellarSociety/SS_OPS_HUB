import { AcknowledgementsPageClient } from "@/components/hr/acknowledgements-page-client";
import { listEmailAcknowledgements } from "@/lib/actions/hr-acknowledgements";
import { getHrPageContext } from "@/lib/hr/page-context";
import { canAdminLookups, canEditStaff, canViewStaff } from "@/lib/hr/permissions";
import { listStaffForVenue } from "@/lib/hr/store";

export default async function HrAcknowledgementEmployeesPage() {
  const { supabase, venue, permissions } = await getHrPageContext();

  if (!canViewStaff(permissions, venue.id)) {
    return (
      <p className="text-sm text-black/60">
        You do not have permission to view acknowledgements for this venue.
      </p>
    );
  }

  const [records, staff] = await Promise.all([
    listEmailAcknowledgements(),
    listStaffForVenue(supabase, venue.id),
  ]);

  return (
    <AcknowledgementsPageClient
      records={records}
      staff={staff}
      view="employees"
      canRemind={
        canEditStaff(permissions, venue.id) ||
        canAdminLookups(permissions, venue.id)
      }
    />
  );
}
