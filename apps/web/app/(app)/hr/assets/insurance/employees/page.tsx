import { InsuranceEmployeesTable } from "@/components/hr/insurance-employees-table";
import { getHrPageContext } from "@/lib/hr/page-context";
import { canEditAssets } from "@/lib/hr/permissions";
import { loadInsuranceEmployeesPage } from "@/lib/hr/insurance-store";

export default async function InsuranceEmployeesPage() {
  const { supabase, venue, permissions } = await getHrPageContext();
  const canManage = canEditAssets(permissions, venue.id);
  const data = await loadInsuranceEmployeesPage(supabase, venue.id);

  return (
    <InsuranceEmployeesTable
      rows={data.rows}
      categories={data.categories}
      departments={data.departments}
      employmentStatuses={data.statuses}
      providers={data.providers}
      venueId={venue.id}
      canManage={canManage}
    />
  );
}
