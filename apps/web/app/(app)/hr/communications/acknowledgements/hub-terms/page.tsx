import { HubTermsAcknowledgementsClient } from "@/components/hr/hub-terms-acknowledgements-client";
import { listHubTermsAcknowledgements } from "@/lib/actions/hub-terms";
import { getHrPageContext } from "@/lib/hr/page-context";
import { canViewStaff, hasHrFeatureAccess } from "@/lib/hr/permissions";

export default async function HrHubTermsAcknowledgementsPage() {
  const { venue, permissions } = await getHrPageContext();

  if (
    !hasHrFeatureAccess(permissions, "communications", venue.id) &&
    !canViewStaff(permissions, venue.id)
  ) {
    return (
      <p className="text-sm text-black/60">
        You do not have permission to view acknowledgements for this venue.
      </p>
    );
  }

  const records = await listHubTermsAcknowledgements();

  return <HubTermsAcknowledgementsClient records={records} />;
}
