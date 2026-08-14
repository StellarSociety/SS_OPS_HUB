import { UniformEmployeesTable } from "@/components/hr/uniform-employees-table";
import { getHrPageContext } from "@/lib/hr/page-context";
import { canEditAssets } from "@/lib/hr/permissions";
import { loadUniformEmployeesPage } from "@/lib/hr/uniform-store";

export default async function UniformEmployeesPage() {
  const { supabase, venue, permissions } = await getHrPageContext();
  const canManage = canEditAssets(permissions, venue.id);
  const data = await loadUniformEmployeesPage(supabase, venue.id);

  return (
    <UniformEmployeesTable
      rows={data.rows}
      pieces={data.pieces}
      suppliers={data.suppliers}
      staff={data.staff}
      departments={data.departments}
      positions={data.positions}
      statuses={data.statuses}
      canManage={canManage}
    />
  );
}
