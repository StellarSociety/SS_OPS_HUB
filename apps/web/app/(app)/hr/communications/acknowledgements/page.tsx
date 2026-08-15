import { AcknowledgementsPageClient } from "@/components/hr/acknowledgements-page-client";
import { listEmailAcknowledgements } from "@/lib/actions/hr-acknowledgements";
import { getHrPageContext } from "@/lib/hr/page-context";
import { canAdminLookups, canEditStaff, canViewStaff } from "@/lib/hr/permissions";

export default async function HrAcknowledgementsPage() {
  const { venue, permissions } = await getHrPageContext();

  if (!canViewStaff(permissions, venue.id)) {
    return (
      <p className="text-sm text-black/60">
        You do not have permission to view acknowledgements for this venue.
      </p>
    );
  }

  const records = await listEmailAcknowledgements();

  return (
    <AcknowledgementsPageClient
      records={records}
      canRemind={
        canEditStaff(permissions, venue.id) ||
        canAdminLookups(permissions, venue.id)
      }
    />
  );
}
