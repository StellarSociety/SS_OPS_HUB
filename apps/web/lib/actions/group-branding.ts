"use server";

import { revalidatePath } from "next/cache";
import { requireAppAdmin } from "@/lib/access/permissions";
import { writeAuditLog } from "@/lib/audit";
import { GROUP_LOGO_STORAGE_PATHS } from "@/lib/group/branding";
import {
  asUploadBlob,
  convertImageToWebp,
  shouldSkipWebpConversion,
  uploadBlobMeta,
} from "@/lib/storage/convert-to-webp";
import { createServiceClient } from "@/lib/supabase/service";
import { BRAND_ASSET_MAX_BYTES } from "@/lib/venue/branding-validation";
import { storagePathFromBrandAssetUrl } from "@/lib/venue/branding";

const BRANDING_BUCKET = "venue-branding";
const GROUP_LOGO_SOURCE_MAX_BYTES = 4 * 1024 * 1024;

const REVALIDATE_PATHS = [
  "/login",
  "/global/settings",
  "/global/settings/branding",
];

const ALLOWED_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "svg"]);

function revalidateGroupBranding() {
  for (const path of REVALIDATE_PATHS) {
    revalidatePath(path);
  }
  revalidatePath("/", "layout");
}

function extensionForUpload(name: string, mimeType: string): string {
  const byName = name.split(".").pop()?.toLowerCase() ?? "";
  if (ALLOWED_EXTENSIONS.has(byName)) {
    return byName === "jpeg" ? "jpg" : byName;
  }
  switch (mimeType) {
    case "image/svg+xml":
      return "svg";
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
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
    default:
      return "application/octet-stream";
  }
}

async function readGroupLogoRow(
  service: ReturnType<typeof createServiceClient>,
) {
  const { data, error } = await service
    .from("group_branding")
    .select("id, logo_url")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    return {
      error: "Could not load group branding. Run the latest database migrations.",
    };
  }

  if (!data) {
    const { error: insertError } = await service
      .from("group_branding")
      .insert({ id: 1 });
    if (insertError) {
      return {
        error: "Could not load group branding. Run the latest database migrations.",
      };
    }
    return { row: { id: 1, logo_url: null as string | null } };
  }

  return { row: data };
}

export async function uploadGroupLogo(formData: FormData) {
  const { user: actor } = await requireAppAdmin();
  const service = createServiceClient();

  const file = asUploadBlob(formData.get("file"));
  if (!file) {
    return { error: "Choose an image file to upload." };
  }
  if (file.size > GROUP_LOGO_SOURCE_MAX_BYTES) {
    return { error: "File is too large. Maximum size is 4 MB." };
  }

  const meta = uploadBlobMeta(file);
  const sourceExtension = extensionForUpload(meta.name, meta.type);
  if (!ALLOWED_EXTENSIONS.has(sourceExtension)) {
    return { error: "Unsupported file type. Use PNG, JPG, WebP, or SVG." };
  }

  const existing = await readGroupLogoRow(service);
  if (existing.error || !existing.row) return { error: existing.error };

  const bytes = Buffer.from(await file.arrayBuffer());
  let uploadBytes: Buffer = bytes;
  let extension = sourceExtension;
  let contentType = contentTypeForExtension(sourceExtension);

  if (!shouldSkipWebpConversion(meta.type, sourceExtension)) {
    try {
      const webp = await convertImageToWebp(bytes, {
        maxWidth: 1600,
        maxHeight: 800,
      });
      uploadBytes = Buffer.from(webp.buffer);
      extension = webp.extension;
      contentType = webp.contentType;
    } catch {
      return { error: "Could not convert image to WebP." };
    }
  }

  if (uploadBytes.length > BRAND_ASSET_MAX_BYTES) {
    return { error: "Converted logo is too large. Try a simpler image." };
  }

  const storagePath = `group/logo.${extension}`;

  await service.storage.from(BRANDING_BUCKET).remove([...GROUP_LOGO_STORAGE_PATHS]);

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

  const publicUrl = `${publicData.publicUrl}?v=${Date.now()}`;

  const { data: updated, error: updateError } = await service
    .from("group_branding")
    .update({
      logo_url: publicUrl,
      updated_at: new Date().toISOString(),
      updated_by: actor.id,
    })
    .eq("id", 1)
    .select("logo_url")
    .single();

  if (updateError || !updated) {
    return { error: "File uploaded but group branding could not be updated." };
  }

  await writeAuditLog({
    actor_id: actor.id,
    action: "update",
    module_key: "settings",
    entity: "group_branding",
    entity_id: "1",
    before: { logo_url: existing.row.logo_url },
    after: { logo_url: publicUrl },
  });

  revalidateGroupBranding();
  return { success: "Group logo uploaded.", logoUrl: updated.logo_url as string };
}

export async function removeGroupLogo() {
  const { user: actor } = await requireAppAdmin();
  const service = createServiceClient();

  const existing = await readGroupLogoRow(service);
  if (existing.error || !existing.row) return { error: existing.error };

  const previousUrl = existing.row.logo_url;
  const storagePath = storagePathFromBrandAssetUrl(previousUrl);
  const paths = new Set<string>(GROUP_LOGO_STORAGE_PATHS);
  if (storagePath) paths.add(storagePath);

  await service.storage.from(BRANDING_BUCKET).remove([...paths]);

  const { error } = await service
    .from("group_branding")
    .update({
      logo_url: null,
      updated_at: new Date().toISOString(),
      updated_by: actor.id,
    })
    .eq("id", 1);

  if (error) return { error: "Could not restore the default group logo." };

  await writeAuditLog({
    actor_id: actor.id,
    action: "update",
    module_key: "settings",
    entity: "group_branding",
    entity_id: "1",
    before: { logo_url: previousUrl },
    after: { logo_url: null },
  });

  revalidateGroupBranding();
  return { success: "Default Stellar Society Group logo restored." };
}
