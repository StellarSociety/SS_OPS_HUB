import { AssetsCatalogTable } from "@/components/hr/assets-catalog-table";
import { getHrPageContext } from "@/lib/hr/page-context";
import { loadAssetsCatalogPage } from "@/lib/hr/load-assets-page";
import { canEditAssets } from "@/lib/hr/permissions";

export default async function HrAssetsCatalogDetailsPage() {
  const { supabase, venue, permissions } = await getHrPageContext();
  const canManage = canEditAssets(permissions, venue.id);
  const data = await loadAssetsCatalogPage(supabase, venue.id, "assets");

  return (
    <AssetsCatalogTable
      mode="assets"
      uniformTypeId={data.uniformTypeId}
      assets={data.assets}
      assetTypes={data.assetTypes}
      staff={data.staff}
      departments={data.departments}
      positions={data.positions}
      statuses={data.statuses}
      canManage={canManage}
    />
  );
}
