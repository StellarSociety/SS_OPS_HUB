export const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

export function normalizeHexColor(value: string): string | null {
  const trimmed = value.trim();
  if (!HEX_COLOR_PATTERN.test(trimmed)) return null;
  return trimmed.toUpperCase();
}

export const BRAND_ASSET_TYPES = ["logo", "icon", "favicon"] as const;
export type BrandAssetType = (typeof BRAND_ASSET_TYPES)[number];

export const BRAND_ASSET_LABELS: Record<BrandAssetType, string> = {
  logo: "Logo",
  icon: "Icon",
  favicon: "Favicon",
};

export const BRAND_ASSET_ACCEPT =
  "image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon,.ico";

export const BRAND_ASSET_MAX_BYTES = 512 * 1024;

export function brandAssetColumn(assetType: BrandAssetType): "logo_url" | "icon_url" | "favicon_url" {
  if (assetType === "logo") return "logo_url";
  if (assetType === "icon") return "icon_url";
  return "favicon_url";
}
