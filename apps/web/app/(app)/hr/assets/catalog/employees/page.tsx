import { AssetsEmployeesTable } from "@/components/hr/assets-employees-table";
import { getHrPageContext } from "@/lib/hr/page-context";
import { canEditAssets } from "@/lib/hr/permissions";
import { loadAssetsEmployeesPage } from "@/lib/hr/assets-store";

export default async function AssetsEmployeesPage() {
  const { supabase, venue, permissions } = await getHrPageContext();
  const canManage = canEditAssets(permissions, venue.id);
  const data = await loadAssetsEmployeesPage(supabase, venue.id);

  return (
    <AssetsEmployeesTable
      rows={data.rows}
      availableAssets={data.availableAssets}
      staff={data.staff}
      departments={data.departments}
      positions={data.positions}
      statuses={data.statuses}
      canManage={canManage}
    />
  );
}
