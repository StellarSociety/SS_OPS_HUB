"use server";

import { revalidatePath } from "next/cache";
import { requireAppAdmin } from "@/lib/access/permissions";
import { writeAuditLog } from "@/lib/audit";
import {
  convertImageToWebp,
  shouldSkipWebpConversion,
} from "@/lib/storage/convert-to-webp";
import { createServiceClient } from "@/lib/supabase/service";
import {
  BRAND_ASSET_MAX_BYTES,
  type BrandAssetType,
  brandAssetColumn,
  normalizeHexColor,
} from "@/lib/venue/branding-validation";
import { storagePathFromBrandAssetUrl } from "@/lib/venue/branding";

const SETTINGS_PATHS = [
  "/settings",
  "/settings/branding",
  "/global/settings",
  "/global/settings/branding",
];

const BRANDING_BUCKET = "venue-branding";

const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "image/x-icon",
  "image/vnd.microsoft.icon",
]);

function revalidateBranding(venueSlug?: string) {
  for (const path of SETTINGS_PATHS) {
    revalidatePath(path);
  }
  if (venueSlug) {
    revalidatePath(`/global/settings/branding/${venueSlug}`);
  }
  revalidatePath("/", "layout");
}

function extensionForFile(file: File): string {
  const byName = file.name.split(".").pop()?.toLowerCase();
  if (byName === "svg") return "svg";
  if (byName === "png") return "png";
  if (byName === "jpg" || byName === "jpeg") return "jpg";
  if (byName === "webp") return "webp";
  if (byName === "ico") return "ico";

  switch (file.type) {
    case "image/svg+xml":
      return "svg";
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/x-icon":
    case "image/vnd.microsoft.icon":
      return "ico";
    default:
      return "png";
  }
}

function contentTypeForExtension(extension: string): string {
  switch (extension) {
    case "png":
      return "image/png";
    case "jpg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    case "ico":
      return "image/x-icon";
    default:
      return "application/octet-stream";
  }
}

function isAllowedBrandFile(file: File): boolean {
  if (file.type && ALLOWED_MIME_TYPES.has(file.type)) return true;
  const extension = extensionForFile(file);
  return ["svg", "png", "jpg", "webp", "ico"].includes(extension);
}

function isValidPngBuffer(bytes: Buffer): boolean {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  );
}

export async function updateVenueBranding(input: {
  venueId: string;
  name: string;
  primaryColor: string;
  secondaryColor: string;
}) {
  const { user: actor } = await requireAppAdmin();
  const service = createServiceClient();

  const name = input.name.trim();
  if (!name) return { error: "Venue name is required." };

  const primaryColor = normalizeHexColor(input.primaryColor);
  const secondaryColor = normalizeHexColor(input.secondaryColor);
  if (!primaryColor || !secondaryColor) {
    return { error: "Brand colors must be valid hex values (e.g. #818A40)." };
  }

  const { data: before, error: fetchError } = await service
    .from("venues")
    .select("id, name, primary_color, secondary_color, is_global")
    .eq("id", input.venueId)
    .single();

  if (fetchError || !before) return { error: "Venue not found." };
  if (before.is_global) return { error: "Global view branding cannot be edited here." };

  const { data: updated, error } = await service
    .from("venues")
    .update({
      name,
      primary_color: primaryColor,
      secondary_color: secondaryColor,
    })
    .eq("id", input.venueId)
    .select("*")
    .single();

  if (error || !updated) return { error: "Could not save venue branding." };

  await writeAuditLog({
    actor_id: actor.id,
    action: "update",
    module_key: "settings",
    entity: "venues",
    entity_id: input.venueId,
    venue_id: input.venueId,
    before: {
      name: before.name,
      primary_color: before.primary_color,
      secondary_color: before.secondary_color,
    },
    after: {
      name,
      primary_color: primaryColor,
      secondary_color: secondaryColor,
    },
  });

  revalidateBranding(updated.slug);
  return { success: "Venue branding saved.", venue: updated };
}

export async function uploadVenueBrandAsset(formData: FormData) {
  const { user: actor } = await requireAppAdmin();
  const service = createServiceClient();

  const venueId = String(formData.get("venue_id") ?? "").trim();
  const assetType = String(formData.get("asset_type") ?? "").trim() as BrandAssetType;
  const file = formData.get("file");

  if (!venueId) return { error: "Venue is required." };
  if (!["logo", "icon", "favicon"].includes(assetType)) {
    return { error: "Invalid asset type." };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose an image file to upload." };
  }
  if (file.size > BRAND_ASSET_MAX_BYTES) {
    return { error: "File is too large. Maximum size is 512 KB." };
  }
  if (!isAllowedBrandFile(file)) {
    return { error: "Unsupported file type. Use PNG, JPG, WebP, SVG, or ICO." };
  }

  const { data: venue, error: venueError } = await service
    .from("venues")
    .select("id, slug, is_global, logo_url, icon_url, favicon_url")
    .eq("id", venueId)
    .single();

  if (venueError || !venue) return { error: "Venue not found." };
  if (venue.is_global) return { error: "Global view branding cannot be edited here." };

  const sourceExtension = extensionForFile(file);
  const bytes = Buffer.from(await file.arrayBuffer());

  if (sourceExtension === "png" && !isValidPngBuffer(bytes)) {
    return {
      error:
        "Invalid PNG file. Transparency and metadata are preserved only for valid PNG uploads.",
    };
  }

  let uploadBytes: Buffer = bytes;
  let extension = sourceExtension;
  let contentType = contentTypeForExtension(sourceExtension);

  // Raster images → WebP; SVG/ICO stay as-is.
  if (!shouldSkipWebpConversion(file.type, sourceExtension)) {
    try {
      const webp = await convertImageToWebp(bytes);
      uploadBytes = Buffer.from(webp.buffer);
      extension = webp.extension;
      contentType = webp.contentType;
    } catch {
      return { error: "Could not convert image to WebP." };
    }
  }

  const storagePath = `${venueId}/${assetType}.${extension}`;

  // Drop legacy format siblings for this asset key.
  await service.storage.from(BRANDING_BUCKET).remove([
    `${venueId}/${assetType}.png`,
    `${venueId}/${assetType}.jpg`,
    `${venueId}/${assetType}.jpeg`,
    `${venueId}/${assetType}.webp`,
    `${venueId}/${assetType}.svg`,
    `${venueId}/${assetType}.ico`,
  ]);

  const { error: uploadError } = await service.storage
    .from(BRANDING_BUCKET)
    .upload(storagePath, uploadBytes, {
      contentType,
      upsert: true,
      cacheControl: "31536000",
    });

  if (uploadError) {
    return {
      error:
        "Could not upload file. Ensure the venue-branding storage bucket exists (run db migrations).",
    };
  }

  const { data: publicData } = service.storage
    .from(BRANDING_BUCKET)
    .getPublicUrl(storagePath);

  const column = brandAssetColumn(assetType);
  const publicUrl = `${publicData.publicUrl}?v=${Date.now()}`;

  const { data: updated, error: updateError } = await service
    .from("venues")
    .update({ [column]: publicUrl })
    .eq("id", venueId)
    .select("*")
    .single();

  if (updateError || !updated) {
    return { error: "File uploaded but venue record could not be updated." };
  }

  await writeAuditLog({
    actor_id: actor.id,
    action: "update",
    module_key: "settings",
    entity: "venues",
    entity_id: venueId,
    venue_id: venueId,
    before: { [column]: venue[column as keyof typeof venue] },
    after: { [column]: publicUrl, asset_type: assetType },
  });

  revalidateBranding(updated.slug);
  return { success: `${assetType} uploaded.`, venue: updated };
}

export async function removeVenueBrandAsset(input: {
  venueId: string;
  assetType: BrandAssetType;
}) {
  const { user: actor } = await requireAppAdmin();
  const service = createServiceClient();

  const { data: venue, error: venueError } = await service
    .from("venues")
    .select("id, is_global, logo_url, icon_url, favicon_url")
    .eq("id", input.venueId)
    .single();

  if (venueError || !venue) return { error: "Venue not found." };
  if (venue.is_global) return { error: "Global view branding cannot be edited here." };

  const column = brandAssetColumn(input.assetType);
  const previousUrl = venue[column as keyof typeof venue] as string | null;
  const storagePath = storagePathFromBrandAssetUrl(previousUrl);

  const paths = new Set<string>([
    `${input.venueId}/${input.assetType}.png`,
    `${input.venueId}/${input.assetType}.jpg`,
    `${input.venueId}/${input.assetType}.jpeg`,
    `${input.venueId}/${input.assetType}.webp`,
    `${input.venueId}/${input.assetType}.svg`,
    `${input.venueId}/${input.assetType}.ico`,
  ]);
  if (storagePath) paths.add(storagePath);

  await service.storage.from(BRANDING_BUCKET).remove([...paths]);

  const { data: updated, error } = await service
    .from("venues")
    .update({ [column]: null })
    .eq("id", input.venueId)
    .select("*")
    .single();

  if (error || !updated) return { error: "Could not remove brand asset." };

  await writeAuditLog({
    actor_id: actor.id,
    action: "update",
    module_key: "settings",
    entity: "venues",
    entity_id: input.venueId,
    venue_id: input.venueId,
    before: { [column]: previousUrl },
    after: { [column]: null, asset_type: input.assetType },
  });

  revalidateBranding(updated.slug);
  return { success: "Brand asset cleared.", venue: updated };
}
