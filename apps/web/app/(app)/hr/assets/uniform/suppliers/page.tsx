import { UniformSuppliersTable } from "@/components/hr/uniform-suppliers-table";
import { getHrPageContext } from "@/lib/hr/page-context";
import { canEditAssets } from "@/lib/hr/permissions";
import { loadUniformSuppliersPage } from "@/lib/hr/uniform-store";

export default async function UniformSuppliersPage() {
  const { supabase, venue, permissions } = await getHrPageContext();
  const canManage = canEditAssets(permissions, venue.id);
  const data = await loadUniformSuppliersPage(supabase);

  return (
    <UniformSuppliersTable
      suppliers={data.suppliers}
      canManage={canManage}
    />
  );
}
