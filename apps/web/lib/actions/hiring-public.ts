"use server";

import { createServiceClient } from "@/lib/supabase/service";
import {
  HIRING_STORAGE_BUCKET,
  hiringApplicantNameFromFieldValues,
  hiringFieldChoiceOptions,
  isHiringFormAccepting,
  mergeHiringFieldConfig,
  type HiringAnswers,
  type HiringFieldType,
  type HiringFormBlock,
} from "@/lib/hr/hiring/types";
import { canonicalWorldCountryName } from "@/lib/hr/phone";
import { getHiringFormByCode, listHiringFormBlocks } from "@/lib/hr/hiring/store";
import { notifyHiringApplicationSubmitted } from "@/lib/hr/hiring/notify";
import {
  asUploadBlob,
  convertImageToWebp,
  isRasterImageMime,
  resolveRasterImageMime,
  uploadBlobMeta,
} from "@/lib/storage/convert-to-webp";

function fail(error: string) {
  return { ok: false as const, error };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function fieldBlocks(blocks: HiringFormBlock[]): HiringFormBlock[] {
  return blocks.filter((block) => block.kind === "field" && block.field_type);
}

function validateText(
  value: string,
  config: ReturnType<typeof mergeHiringFieldConfig>,
  label: string,
): string | null {
  if (!config.allowNumbers && /\d/.test(value)) {
    return `${label} cannot include numbers.`;
  }
  if (!config.allowPunctuation && /[.,;:!?…'"“”‘’]/.test(value)) {
    return `${label} cannot include punctuation.`;
  }
  if (!config.allowSymbols && /[^\w\s.,;:!?…'"“”‘’-]/.test(value)) {
    return `${label} cannot include symbols.`;
  }
  return null;
}

function extractIdentity(
  blocks: HiringFormBlock[],
  answers: HiringAnswers,
): { name: string | null; email: string | null } {
  let email: string | null = null;
  const flat: Record<string, string> = {};
  for (const block of fieldBlocks(blocks)) {
    const answer = answers[block.id];
    const value =
      typeof answer?.value === "string" ? answer.value.trim() : "";
    if (!value) continue;
    flat[block.id] = value;
    if (!email && (block.field_type === "email" || EMAIL_RE.test(value))) {
      email = value;
    }
  }
  const name = hiringApplicantNameFromFieldValues(blocks, flat) || null;
  return { name, email };
}

async function uploadPublicFile(input: {
  service: ReturnType<typeof createServiceClient>;
  venueId: string;
  applicationId: string;
  blockId: string;
  blob: Blob;
  convertImage: boolean;
}): Promise<
  | {
      storage_path: string;
      public_url: string;
      file_name: string;
      content_type: string;
      byte_size: number;
    }
  | { error: string }
> {
  const meta = uploadBlobMeta(input.blob);
  const bytes = Buffer.from(await input.blob.arrayBuffer());
  if (bytes.length === 0) return { error: "One of the uploads was empty." };

  let buffer = bytes;
  let contentType = meta.type || "application/octet-stream";
  let extension =
    meta.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "bin";
  const fileName = meta.name || `upload.${extension}`;

  if (input.convertImage) {
    if (!resolveRasterImageMime(meta)) {
      return { error: "Photos must be PNG, JPEG, GIF, AVIF, or WebP." };
    }
    try {
      const webp = await convertImageToWebp(bytes, {
        maxWidth: 1600,
        maxHeight: 1600,
      });
      buffer = Buffer.from(webp.buffer);
      contentType = webp.contentType;
      extension = webp.extension;
    } catch {
      return { error: "Could not convert the photo to WebP." };
    }
  }

  const storagePath = `${input.venueId}/applications/${input.applicationId}/${input.blockId}-${crypto.randomUUID()}.${extension}`;
  const { error } = await input.service.storage
    .from(HIRING_STORAGE_BUCKET)
    .upload(storagePath, new Uint8Array(buffer), {
      contentType,
      upsert: false,
      cacheControl: "31536000",
    });
  if (error) return { error: error.message };
  const { data } = input.service.storage
    .from(HIRING_STORAGE_BUCKET)
    .getPublicUrl(storagePath);
  return {
    storage_path: storagePath,
    public_url: data.publicUrl,
    file_name: input.convertImage
      ? fileName.replace(/\.[^.]+$/, ".webp")
      : fileName,
    content_type: contentType,
    byte_size: buffer.length,
  };
}

export async function submitHiringApplication(code: string, formData: FormData) {
  const service = createServiceClient();
  const form = await getHiringFormByCode(service, code);
  if (!form) return fail("This hiring form is not available.");
  const accepting = isHiringFormAccepting(form, {
    applicationCount: form.application_count ?? 0,
  });
  if (!accepting.ok) return fail(accepting.reason);

  const blocks = await listHiringFormBlocks(service, form.id);
  const answers: HiringAnswers = {};
  const filesToInsert: Array<{
    application_id: string;
    block_id: string;
    storage_path: string;
    public_url: string;
    file_name: string;
    content_type: string;
    byte_size: number;
  }> = [];
  const applicationId = crypto.randomUUID();

  for (const block of fieldBlocks(blocks)) {
    const type = block.field_type as HiringFieldType;
    const label = block.field_label || "This field";
    const config = mergeHiringFieldConfig(block.config);

    if (type === "picture" || type === "file") {
      const entries = formData
        .getAll(`field_${block.id}`)
        .map((value) => asUploadBlob(value))
        .filter((value): value is Blob => value != null);
      if (block.required && entries.length === 0) {
        return fail(`Please upload ${label}.`);
      }
      if (entries.length > config.maxFiles) {
        return fail(`${label} allows up to ${config.maxFiles} file(s).`);
      }
      const maxBytes = config.maxFileMb * 1024 * 1024;
      const urls: string[] = [];
      for (const blob of entries) {
        if (blob.size > maxBytes) {
          return fail(`${label} files must be ${config.maxFileMb} MB or smaller.`);
        }
        if (type === "file" && resolveRasterImageMime(uploadBlobMeta(blob))) {
          // raster CVs still convert; PDFs stay
        }
        const convertImage =
          type === "picture" ||
          isRasterImageMime(uploadBlobMeta(blob).type) ||
          Boolean(resolveRasterImageMime(uploadBlobMeta(blob)));
        const uploaded = await uploadPublicFile({
          service,
          venueId: form.venue_id,
          applicationId,
          blockId: block.id,
          blob,
          convertImage: type === "picture" || convertImage,
        });
        if ("error" in uploaded) return fail(uploaded.error);
        urls.push(uploaded.public_url);
        filesToInsert.push({
          application_id: applicationId,
          block_id: block.id,
          ...uploaded,
        });
      }
      answers[block.id] = { label, type, value: urls };
      continue;
    }

    if (type === "multiple_choice") {
      const options = hiringFieldChoiceOptions(type, config.options);
      const selected = formData
        .getAll(`field_${block.id}`)
        .map((value) => String(value ?? "").trim())
        .filter((value) => options.includes(value));
      if (block.required && selected.length === 0) {
        return fail(`Please choose at least one option for ${label}.`);
      }
      answers[block.id] = {
        label,
        type,
        value: selected.length > 0 ? selected : null,
      };
      continue;
    }

    const raw = String(formData.get(`field_${block.id}`) ?? "").trim();

    if (type === "checkbox") {
      if (raw !== "Yes") {
        if (block.required) return fail(`Please tick ${label}.`);
        answers[block.id] = { label, type, value: null };
        continue;
      }
      answers[block.id] = { label, type, value: "Yes" };
      continue;
    }

    if (type === "yes_no" || type === "dropdown" || type === "radio") {
      const options = hiringFieldChoiceOptions(type, config.options);
      if (!raw) {
        if (block.required) return fail(`Please fill in ${label}.`);
        answers[block.id] = { label, type, value: null };
        continue;
      }
      if (!options.includes(raw)) {
        return fail(`Choose a valid option for ${label}.`);
      }
      answers[block.id] = { label, type, value: raw };
      continue;
    }

    if (!raw) {
      if (block.required) return fail(`Please fill in ${label}.`);
      answers[block.id] = { label, type, value: null };
      continue;
    }

    if (type === "email") {
      if (!EMAIL_RE.test(raw)) return fail(`Enter a valid email for ${label}.`);
      answers[block.id] = { label, type, value: raw };
      continue;
    }

    if (type === "number") {
      if (!/^-?\d+(\.\d+)?$/.test(raw)) {
        return fail(`${label} must be a number.`);
      }
      answers[block.id] = { label, type, value: Number(raw) };
      continue;
    }

    if (type === "date") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        return fail(`${label} must be a valid date.`);
      }
      answers[block.id] = { label, type, value: raw };
      continue;
    }

    if (type === "phone") {
      const digits = raw.replace(/\D/g, "");
      if (!raw.startsWith("+") || digits.length < 8 || digits.length > 15) {
        return fail(`Enter a valid phone number for ${label}.`);
      }
      answers[block.id] = { label, type, value: raw };
      continue;
    }

    if (type === "nationality") {
      const country = canonicalWorldCountryName(raw);
      if (!country) {
        return fail(`Choose a nationality from the list for ${label}.`);
      }
      answers[block.id] = { label, type, value: country };
      continue;
    }

    const textError = validateText(raw, config, label);
    if (textError) return fail(textError);
    answers[block.id] = { label, type, value: raw };
  }

  const identity = extractIdentity(blocks, answers);

  const { error } = await service.from("hiring_applications").insert({
    id: applicationId,
    form_id: form.id,
    venue_id: form.venue_id,
    answers,
    applicant_name: identity.name,
    applicant_email: identity.email,
    status: "no_interaction",
  });
  if (error) return fail(error.message);

  if (filesToInsert.length > 0) {
    const { error: fileError } = await service
      .from("hiring_application_files")
      .insert(filesToInsert);
    if (fileError) return fail(fileError.message);
  }

  await notifyHiringApplicationSubmitted(service, {
    venueId: form.venue_id,
    formId: form.id,
    formName: form.name,
    applicationId,
    applicantName: identity.name,
    notifyUserIds: form.notify_user_ids,
  });

  return { ok: true as const };
}
