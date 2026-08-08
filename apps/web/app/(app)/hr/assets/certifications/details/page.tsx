import { CertificationsDetailsTable } from "@/components/hr/certifications-details-table";
import { getHrPageContext } from "@/lib/hr/page-context";
import { canEditAssets } from "@/lib/hr/permissions";
import { loadCertificationsDetailsPage } from "@/lib/hr/certifications-store";

export default async function CertificationsDetailsPage() {
  const { supabase, venue, permissions } = await getHrPageContext();
  const canManage = canEditAssets(permissions, venue.id);
  const data = await loadCertificationsDetailsPage(supabase);

  return (
    <CertificationsDetailsTable types={data.types} canManage={canManage} />
  );
}
