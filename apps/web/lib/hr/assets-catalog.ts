import type { AssetRow, AssetType } from "./types";

/** Seeded global lookup name for uniform items in `asset_types`. */
export const UNIFORM_ASSET_TYPE_NAME = "Uniform";

export function findUniformAssetType(
  types: AssetType[],
): AssetType | undefined {
  return types.find(
    (t) => t.name.toLowerCase() === UNIFORM_ASSET_TYPE_NAME.toLowerCase(),
  );
}

export function filterAssetsForCatalog(
  assets: AssetRow[],
  mode: "assets" | "uniform",
  uniformTypeId: string | null,
): AssetRow[] {
  if (!uniformTypeId) {
    return mode === "uniform" ? [] : assets;
  }
  if (mode === "uniform") {
    return assets.filter((a) => a.asset_type_id === uniformTypeId);
  }
  return assets.filter((a) => a.asset_type_id !== uniformTypeId);
}

export function assetTypesForCatalog(
  types: AssetType[],
  mode: "assets" | "uniform",
  uniformTypeId: string | null,
): AssetType[] {
  if (mode === "uniform" && uniformTypeId) {
    return types.filter((t) => t.id === uniformTypeId);
  }
  if (uniformTypeId) {
    return types.filter((t) => t.id !== uniformTypeId);
  }
  return types;
}
