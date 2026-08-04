import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assetTypesForCatalog,
  filterAssetsForCatalog,
  findUniformAssetType,
} from "@/lib/hr/assets-catalog";
import {
  listAllStaff,
  listAssetTypes,
  listAssets,
  listDepartments,
  listEmploymentStatuses,
  listPositions,
} from "@/lib/hr/store";

export async function loadAssetsCatalogPage(
  supabase: SupabaseClient,
  venueId: string,
  mode: "assets" | "uniform",
) {
  const [allTypes, allAssets, staff, departments, positions, statuses] =
    await Promise.all([
      listAssetTypes(supabase),
      listAssets(supabase),
      listAllStaff(supabase),
      listDepartments(supabase, venueId),
      listPositions(supabase, venueId),
      listEmploymentStatuses(supabase),
    ]);

  const uniformType = findUniformAssetType(allTypes);
  const uniformTypeId = uniformType?.id ?? null;

  return {
    mode,
    uniformTypeId,
    assetTypes: assetTypesForCatalog(allTypes, mode, uniformTypeId),
    assets: filterAssetsForCatalog(allAssets, mode, uniformTypeId),
    staff,
    departments,
    positions,
    statuses,
  };
}
