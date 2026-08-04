import { UniformDetailsTable } from "@/components/hr/uniform-details-table";
import { getHrPageContext } from "@/lib/hr/page-context";
import { canEditAssets } from "@/lib/hr/permissions";
import { loadUniformDetailsPage } from "@/lib/hr/uniform-store";
import { listDepartments, listPositions } from "@/lib/hr/store";

export default async function UniformDetailsPage() {
  const { supabase, venue, permissions } = await getHrPageContext();
  const canManage = canEditAssets(permissions, venue.id);
  const [data, departments, positions] = await Promise.all([
    loadUniformDetailsPage(supabase),
    listDepartments(supabase, venue.id),
    listPositions(supabase, venue.id),
  ]);

  return (
    <UniformDetailsTable
      pieces={data.pieces}
      suppliers={data.suppliers}
      departments={departments}
      positions={positions}
      canManage={canManage}
    />
  );
}
