"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { getActionAuthContext } from "@/lib/auth/action-context";
import { canAdminSettings, canEditLogs } from "@/lib/save-log/permissions";
import { getLogRecord } from "@/lib/save-log/store";
import {
  isIsoDate,
  SAVE_LOG_BUCKET,
  SAVE_LOG_MAX_FILE_BYTES,
  SAVE_LOG_MODULE_KEY,
} from "@/lib/save-log/types";
import {
  asUploadBlob,
  convertImageToWebp,
  uploadBlobMeta,
} from "@/lib/storage/convert-to-webp";
import { createServiceClient } from "@/lib/supabase/service";

function fail(message: string) {
  return { ok: false as const, error: message };
}

type SaveLogActor =
  | { ok: false; error: string }
  | {
      ok: true;
      userId: string;
      venueId: string;
      service: ReturnType<typeof createServiceClient>;
    };

function revalidateSaveLog() {
  revalidatePath("/save-log", "page");
  revalidatePath("/save-log/logs", "page");
  revalidatePath("/save-log/settings", "page");
}

async function requireLogEditor(): Promise<SaveLogActor> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { ok: false, error: auth.error };

  if (!canEditLogs(auth.permissions, auth.venue.id)) {
    return {
      ok: false,
      error: "You need SafeLog edit access to upload or remove records.",
    };
  }

  return {
    ok: true,
    userId: auth.user.id,
    venueId: auth.venue.id,
    service: createServiceClient(),
  };
}

async function requireSettingsAdmin(): Promise<SaveLogActor> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { ok: false, error: auth.error };

  if (!canAdminSettings(auth.permissions, auth.venue.id)) {
    return { ok: false, error: "You need SafeLog Settings admin access." };
  }

  return {
    ok: true,
    userId: auth.user.id,
    venueId: auth.venue.id,
    service: createServiceClient(),
  };
}

function slugKey(label: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return slug || `log_${Date.now().toString(36)}`;
}

function isPdfUpload(type: string, name: string): boolean {
  return type === "application/pdf" || name.toLowerCase().endsWith(".pdf");
}

export async function uploadSaveLogRecord(formData: FormData) {
  const auth = await requireLogEditor();
  if (!auth.ok) return fail(auth.error);

  const typeId = String(formData.get("typeId") ?? "").trim();
  const logDate = String(formData.get("logDate") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const blob = asUploadBlob(formData.get("file"));

  if (!typeId) return fail("Choose a log type.");
  if (!isIsoDate(logDate)) return fail("Choose a valid log date.");
  if (!blob) return fail("Choose a photo or PDF to upload.");
  if (blob.size > SAVE_LOG_MAX_FILE_BYTES) {
    return fail("Files must be 15 MB or smaller.");
  }

  const { data: logType, error: typeError } = await auth.service
    .from("save_log_types")
    .select("id, archived_at")
    .eq("id", typeId)
    .eq("venue_id", auth.venueId)
    .maybeSingle();

  if (typeError) return fail(typeError.message);
  if (!logType || logType.archived_at) {
    return fail("That log type is not available.");
  }

  const meta = uploadBlobMeta(blob);
  const bytes = Buffer.from(await blob.arrayBuffer());
  let buffer: Buffer;
  let contentType: string;
  let extension: string;

  if (isPdfUpload(meta.type, meta.name)) {
    buffer = bytes;
    contentType = "application/pdf";
    extension = "pdf";
  } else {
    try {
      const webp = await convertImageToWebp(bytes, { maxWidth: 2400, maxHeight: 2400 });
      buffer = webp.buffer;
      contentType = webp.contentType;
      extension = webp.extension;
    } catch {
      return fail("Upload a photo or a PDF.");
    }
  }

  const recordId = randomUUID();
  const storagePath = `${auth.venueId}/${logDate}/${recordId}.${extension}`;

  const { error: uploadError } = await auth.service.storage
    .from(SAVE_LOG_BUCKET)
    .upload(storagePath, buffer, { contentType, upsert: false });

  if (uploadError) return fail(uploadError.message);

  const { data: publicUrl } = auth.service.storage
    .from(SAVE_LOG_BUCKET)
    .getPublicUrl(storagePath);

  const { error: insertError } = await auth.service.from("save_log_records").insert({
    id: recordId,
    venue_id: auth.venueId,
    type_id: typeId,
    log_date: logDate,
    original_name: meta.name || `log.${extension}`,
    storage_path: storagePath,
    file_url: publicUrl.publicUrl,
    content_type: contentType,
    file_size: buffer.length,
    notes,
    uploaded_by: auth.userId,
  });

  if (insertError) {
    await auth.service.storage.from(SAVE_LOG_BUCKET).remove([storagePath]);
    return fail(insertError.message);
  }

  await writeAuditLog({
    actor_id: auth.userId,
    action: "save_log.upload",
    module_key: SAVE_LOG_MODULE_KEY,
    entity: "save_log_records",
    entity_id: recordId,
    venue_id: auth.venueId,
    after: { type_id: typeId, log_date: logDate, content_type: contentType },
  });

  revalidateSaveLog();
  return { ok: true as const, id: recordId };
}

export async function deleteSaveLogRecord(formData: FormData) {
  const auth = await requireLogEditor();
  if (!auth.ok) return fail(auth.error);

  const recordId = String(formData.get("recordId") ?? "").trim();
  if (!recordId) return fail("Missing record.");

  const record = await getLogRecord(auth.service, auth.venueId, recordId);
  if (!record) return fail("Record not found.");

  const { error } = await auth.service
    .from("save_log_records")
    .delete()
    .eq("id", recordId)
    .eq("venue_id", auth.venueId);

  if (error) return fail(error.message);

  await auth.service.storage.from(SAVE_LOG_BUCKET).remove([record.storage_path]);

  await writeAuditLog({
    actor_id: auth.userId,
    action: "save_log.delete",
    module_key: SAVE_LOG_MODULE_KEY,
    entity: "save_log_records",
    entity_id: recordId,
    venue_id: auth.venueId,
    before: { type_id: record.type_id, log_date: record.log_date },
  });

  revalidateSaveLog();
  return { ok: true as const };
}

export async function saveSaveLogType(formData: FormData) {
  const auth = await requireSettingsAdmin();
  if (!auth.ok) return fail(auth.error);

  const id = String(formData.get("id") ?? "").trim() || null;
  const label = String(formData.get("label") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const requiredDaily = formData.get("requiredDaily") === "1";
  const sortOrder = Number(formData.get("sortOrder") ?? "0");

  if (!label) return fail("Give this log type a name.");

  if (id) {
    const { error } = await auth.service
      .from("save_log_types")
      .update({
        label,
        description,
        required_daily: requiredDaily,
        sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
      })
      .eq("id", id)
      .eq("venue_id", auth.venueId);

    if (error) return fail(error.message);
  } else {
    const { error } = await auth.service.from("save_log_types").insert({
      venue_id: auth.venueId,
      key: `${slugKey(label)}_${Date.now().toString(36)}`,
      label,
      description,
      required_daily: requiredDaily,
      sort_order: Number.isFinite(sortOrder) ? sortOrder : 100,
    });

    if (error) return fail(error.message);
  }

  await writeAuditLog({
    actor_id: auth.userId,
    action: id ? "save_log.type_update" : "save_log.type_create",
    module_key: SAVE_LOG_MODULE_KEY,
    entity: "save_log_types",
    entity_id: id,
    venue_id: auth.venueId,
    after: { label, required_daily: requiredDaily },
  });

  revalidateSaveLog();
  return { ok: true as const };
}

export async function archiveSaveLogType(formData: FormData) {
  const auth = await requireSettingsAdmin();
  if (!auth.ok) return fail(auth.error);

  const id = String(formData.get("id") ?? "").trim();
  const restore = formData.get("restore") === "1";
  if (!id) return fail("Missing log type.");

  const { error } = await auth.service
    .from("save_log_types")
    .update({ archived_at: restore ? null : new Date().toISOString() })
    .eq("id", id)
    .eq("venue_id", auth.venueId);

  if (error) return fail(error.message);

  await writeAuditLog({
    actor_id: auth.userId,
    action: restore ? "save_log.type_restore" : "save_log.type_archive",
    module_key: SAVE_LOG_MODULE_KEY,
    entity: "save_log_types",
    entity_id: id,
    venue_id: auth.venueId,
  });

  revalidateSaveLog();
  return { ok: true as const };
}
