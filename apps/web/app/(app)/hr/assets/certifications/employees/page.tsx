import { CertificationsEmployeesTable } from "@/components/hr/certifications-employees-table";
import { getHrPageContext } from "@/lib/hr/page-context";
import { canEditAssets } from "@/lib/hr/permissions";
import { loadCertificationsEmployeesPage } from "@/lib/hr/certifications-store";

export default async function CertificationsEmployeesPage() {
  const { supabase, venue, permissions } = await getHrPageContext();
  const canManage = canEditAssets(permissions, venue.id);
  const data = await loadCertificationsEmployeesPage(supabase, venue.id);

  return (
    <CertificationsEmployeesTable
      rows={data.rows}
      types={data.types}
      departments={data.departments}
      employmentStatuses={data.statuses}
      venueId={venue.id}
      canManage={canManage}
    />
  );
}
