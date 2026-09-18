"use server";

import { getActionAuthContext, type ActionAuthContext } from "@/lib/auth/action-context";
import {
  canAccessHiring,
  canEditHiring,
} from "@/lib/hr/permissions";
import {
  DEFAULT_HIRING_INTRO_BACKGROUND,
  DEFAULT_HIRING_INTRO2_BACKGROUND,
  DEFAULT_INTERVIEW_CONFIRM_BODY,
  DEFAULT_INTERVIEW_CONFIRM_SUBJECT,
  DEFAULT_INTERVIEW_REQUEST_BODY,
  DEFAULT_INTERVIEW_REQUEST_SUBJECT,
  DEFAULT_HIRING_FIELD_CONFIG,
  HIRING_STORAGE_BUCKET,
  fillHiringEmailTemplate,
  mergeHiringFieldConfig,
  slugifyHiringFieldKey,
  type HiringApplicationStatus,
  type HiringBlockKind,
  type HiringCategory,
  type HiringFieldType,
  type HiringFormStatus,
  HIRING_SHORTLIST_STATUSES,
} from "@/lib/hr/hiring/types";
import { sanitizeHiringCopyHtml } from "@/lib/hr/hiring/copy-format";
import { normalizeHexColor } from "@/lib/venue/branding-validation";
import {
  getHiringApplication,
  getHiringForm,
  listHiringFormBlocks,
  newHiringPublicCode,
} from "@/lib/hr/hiring/store";
import { sendAppEmail } from "@/lib/email/transport";
import { buildHrTemplateEmailHtml } from "@/lib/hr/email-logo";
import { createServiceClient } from "@/lib/supabase/service";
import {
  asUploadBlob,
  convertImageToWebp,
  resolveRasterImageMime,
  uploadBlobMeta,
} from "@/lib/storage/convert-to-webp";

function fail(error: string) {
  return { ok: false as const, error };
}

async function hiringContext(requireEdit = false): Promise<
  | { error: string }
  | {
      auth: ActionAuthContext;
      service: ReturnType<typeof createServiceClient>;
    }
> {
  const ctx = await getActionAuthContext();
  if ("error" in ctx) return { error: ctx.error };
  const allowed = requireEdit
    ? canEditHiring(ctx.permissions, ctx.venue.id)
    : canAccessHiring(ctx.permissions, ctx.venue.id);
  if (!allowed) {
    return { error: "You do not have access to Hiring." };
  }
  return { auth: ctx, service: createServiceClient() };
}

const DEFAULT_BLOCKS: Array<{
  kind: HiringBlockKind;
  title?: string;
  description?: string;
  field_label?: string;
  field_type?: HiringFieldType;
  required?: boolean;
  config?: Record<string, unknown>;
}> = [
  {
    kind: "field",
    field_label: "Photo",
    field_type: "picture",
    required: false,
  },
  {
    kind: "field",
    field_label: "Full name",
    field_type: "short_text",
    required: true,
    config: { allowNumbers: false, allowSymbols: false, allowPunctuation: true },
  },
  {
    kind: "field",
    field_label: "Email",
    field_type: "email",
    required: true,
  },
  {
    kind: "field",
    field_label: "Nationality",
    field_type: "short_text",
    required: false,
    config: { allowNumbers: false, allowSymbols: false, allowPunctuation: true },
  },
  {
    kind: "field",
    field_label: "Position applied for",
    field_type: "short_text",
    required: true,
  },
  {
    kind: "field",
    field_label: "Date of birth",
    field_type: "date",
    required: false,
    config: { computeAge: true },
  },
];

export async function createHiringForm(name?: string) {
  const ctx = await hiringContext(true);
  if ("error" in ctx) return fail(ctx.error);

  const formName = (name ?? "").trim() || "New hiring form";
  const id = crypto.randomUUID();
  const { error } = await ctx.service.from("hiring_forms").insert({
    id,
    venue_id: ctx.auth.venue.id,
    name: formName,
    public_code: newHiringPublicCode(),
    status: "paused",
    intro_description: `Join ${ctx.auth.venue.name ?? "our team"}. Tell us a little about yourself.`,
    intro_background_color: DEFAULT_HIRING_INTRO_BACKGROUND,
    intro2_background_color: DEFAULT_HIRING_INTRO2_BACKGROUND,
    end_message:
      "Thank you — we have received your application and will be in touch.",
    interview_request_subject: DEFAULT_INTERVIEW_REQUEST_SUBJECT,
    interview_request_body: DEFAULT_INTERVIEW_REQUEST_BODY,
    interview_confirm_subject: DEFAULT_INTERVIEW_CONFIRM_SUBJECT,
    interview_confirm_body: DEFAULT_INTERVIEW_CONFIRM_BODY,
    created_by: ctx.auth.user.id,
  });
  if (error) return fail(error.message);

  const blockRows = DEFAULT_BLOCKS.map((block, index) => {
    const blockId = crypto.randomUUID();
    const fieldLabel = block.field_label ?? "";
    return {
      id: blockId,
      form_id: id,
      sort_order: (index + 1) * 10,
      kind: block.kind,
      title: block.title ?? null,
      description: block.description ?? null,
      field_key: fieldLabel
        ? slugifyHiringFieldKey(fieldLabel, `field_${index + 1}`)
        : null,
      field_label: fieldLabel || null,
      field_type: block.field_type ?? null,
      required: block.required === true,
      config: { ...DEFAULT_HIRING_FIELD_CONFIG, ...(block.config ?? {}) },
    };
  });

  const { error: blockError } = await ctx.service
    .from("hiring_form_blocks")
    .insert(blockRows);
  if (blockError) return fail(blockError.message);

  const columnIds = blockRows
    .filter((row) => row.kind === "field")
    .map((row) => row.id);
  await ctx.service
    .from("hiring_forms")
    .update({ table_column_ids: columnIds })
    .eq("id", id);

  return { ok: true as const, id };
}

export async function duplicateHiringForm(formId: string) {
  const ctx = await hiringContext(true);
  if ("error" in ctx) return fail(ctx.error);

  const source = await getHiringForm(
    ctx.service,
    ctx.auth.venue.id,
    formId,
  ).catch(() => null);
  if (!source) return fail("Form not found.");
  const blocks = await listHiringFormBlocks(ctx.service, formId);

  const id = crypto.randomUUID();
  const idMap = new Map(
    blocks.map((block) => [block.id, crypto.randomUUID()] as const),
  );
  const tableColumnIds = source.table_column_ids
    .map((oldId) => idMap.get(oldId))
    .filter((next): next is string => Boolean(next));
  const sortFieldId = source.sort_field_id
    ? (idMap.get(source.sort_field_id) ?? null)
    : null;

  const { error } = await ctx.service.from("hiring_forms").insert({
    id,
    venue_id: ctx.auth.venue.id,
    name: `${source.name.trim() || "Hiring form"} (copy)`,
    public_code: newHiringPublicCode(),
    status: "paused",
    accept_from: source.accept_from,
    accept_until: source.accept_until,
    max_entries: source.max_entries,
    intro_image_url: source.intro_image_url,
    intro_background_color: source.intro_background_color,
    intro_description: source.intro_description,
    intro_button_label: source.intro_button_label,
    intro2_image_url: source.intro2_image_url,
    intro2_background_color: source.intro2_background_color,
    intro2_title: source.intro2_title,
    intro2_description: source.intro2_description,
    intro2_button_label: source.intro2_button_label,
    intro2_department_id: source.intro2_department_id,
    intro2_position_ids: source.intro2_position_ids,
    end_message: source.end_message,
    show_socials: source.show_socials,
    table_column_ids: tableColumnIds,
    sort_field_id: sortFieldId,
    sort_direction: source.sort_direction,
    interview_request_subject: source.interview_request_subject,
    interview_request_body: source.interview_request_body,
    interview_confirm_subject: source.interview_confirm_subject,
    interview_confirm_body: source.interview_confirm_body,
    created_by: ctx.auth.user.id,
  });
  if (error) return fail(error.message);

  if (blocks.length > 0) {
    const { error: blockError } = await ctx.service
      .from("hiring_form_blocks")
      .insert(
        blocks.map((block) => ({
          id: idMap.get(block.id),
          form_id: id,
          sort_order: block.sort_order,
          kind: block.kind,
          title: block.title,
          description: block.description,
          field_key: block.field_key,
          field_label: block.field_label,
          field_type: block.field_type,
          required: block.required,
          config: block.config,
        })),
      );
    if (blockError) {
      await ctx.service
        .from("hiring_forms")
        .delete()
        .eq("id", id)
        .eq("venue_id", ctx.auth.venue.id);
      return fail(blockError.message);
    }
  }

  return { ok: true as const, id };
}

export async function deleteHiringForm(formId: string) {
  return purgeHiringFormData(formId, { form: true });
}

export type HiringPurgeTargets = {
  form?: boolean;
  allEntries?: boolean;
  nonShortlisted?: boolean;
  shortlisted?: boolean;
};

export async function purgeHiringFormData(
  formId: string,
  targets: HiringPurgeTargets,
) {
  const ctx = await hiringContext(true);
  if ("error" in ctx) return fail(ctx.error);

  const deleteForm = targets.form === true;
  const deleteAllEntries =
    deleteForm ||
    targets.allEntries === true ||
    (targets.nonShortlisted === true && targets.shortlisted === true);
  const deleteShortlisted = deleteAllEntries || targets.shortlisted === true;
  const deleteNonShortlisted =
    deleteAllEntries || targets.nonShortlisted === true;

  if (!deleteForm && !deleteShortlisted && !deleteNonShortlisted) {
    return fail("Choose what to delete.");
  }

  const venueId = ctx.auth.venue.id;
  const { data: form } = await ctx.service
    .from("hiring_forms")
    .select("id")
    .eq("id", formId)
    .eq("venue_id", venueId)
    .maybeSingle();
  if (!form) return fail("Form not found.");

  let appsQuery = ctx.service
    .from("hiring_applications")
    .select("id")
    .eq("form_id", formId)
    .eq("venue_id", venueId);
  if (!deleteAllEntries) {
    if (deleteShortlisted) {
      appsQuery = appsQuery.in("status", [...HIRING_SHORTLIST_STATUSES]);
    } else {
      appsQuery = appsQuery.not(
        "status",
        "in",
        `(${HIRING_SHORTLIST_STATUSES.join(",")})`,
      );
    }
  }

  const { data: apps, error: appsError } = await appsQuery;
  if (appsError) return fail(appsError.message);
  const applicationIds = ((apps ?? []) as Array<{ id: string }>).map(
    (row) => row.id,
  );

  if (applicationIds.length > 0) {
    const { data: files } = await ctx.service
      .from("hiring_application_files")
      .select("storage_path")
      .in("application_id", applicationIds);
    const filePaths = [
      ...new Set(
        ((files ?? []) as Array<{ storage_path: string | null }>)
          .map((row) => row.storage_path?.trim())
          .filter((path): path is string => Boolean(path)),
      ),
    ];
    if (filePaths.length > 0) {
      await ctx.service.storage.from(HIRING_STORAGE_BUCKET).remove(filePaths);
    }
    const { error: deleteAppsError } = await ctx.service
      .from("hiring_applications")
      .delete()
      .in("id", applicationIds)
      .eq("venue_id", venueId);
    if (deleteAppsError) return fail(deleteAppsError.message);
  }

  if (deleteForm) {
    const folder = `${venueId}/forms/${formId}`;
    const { data: objects } = await ctx.service.storage
      .from(HIRING_STORAGE_BUCKET)
      .list(folder);
    const formPaths = ((objects ?? []) as Array<{ name?: string }>)
      .map((item) => item.name?.trim())
      .filter((name): name is string => Boolean(name))
      .map((name) => `${folder}/${name}`);
    if (formPaths.length > 0) {
      await ctx.service.storage.from(HIRING_STORAGE_BUCKET).remove(formPaths);
    }
    const { error } = await ctx.service
      .from("hiring_forms")
      .delete()
      .eq("id", formId)
      .eq("venue_id", venueId);
    if (error) return fail(error.message);
  }

  return {
    ok: true as const,
    deletedForm: deleteForm,
    deletedApplications: applicationIds.length,
  };
}

export async function rotateHiringFormLink(formId: string) {
  const ctx = await hiringContext(true);
  if ("error" in ctx) return fail(ctx.error);
  const { error } = await ctx.service
    .from("hiring_forms")
    .update({ public_code: newHiringPublicCode() })
    .eq("id", formId)
    .eq("venue_id", ctx.auth.venue.id);
  if (error) return fail(error.message);
  return { ok: true as const };
}

export type HiringFormPatch = {
  name?: string;
  status?: HiringFormStatus;
  accept_from?: string | null;
  accept_until?: string | null;
  max_entries?: number | null;
  intro_description?: string;
  intro_button_label?: string;
  intro_background_color?: string;
  intro2_title?: string;
  intro2_description?: string;
  intro2_button_label?: string;
  intro2_background_color?: string;
  intro2_department_id?: string | null;
  intro2_position_ids?: string[];
  end_message?: string;
  show_socials?: boolean;
  table_column_ids?: string[];
  sort_field_id?: string | null;
  sort_direction?: "asc" | "desc";
  interview_request_subject?: string;
  interview_request_body?: string;
  interview_confirm_subject?: string;
  interview_confirm_body?: string;
};

export async function saveHiringForm(formId: string, patch: HiringFormPatch) {
  const ctx = await hiringContext(true);
  if ("error" in ctx) return fail(ctx.error);

  const payload: Record<string, unknown> = {};
  if (typeof patch.name === "string") payload.name = patch.name.trim() || "Untitled form";
  if (patch.status) payload.status = patch.status;
  if (patch.accept_from !== undefined) {
    payload.accept_from = patch.accept_from || null;
  }
  if (patch.accept_until !== undefined) {
    payload.accept_until = patch.accept_until || null;
  }
  if (patch.max_entries !== undefined) {
    payload.max_entries =
      patch.max_entries && patch.max_entries > 0 ? patch.max_entries : null;
  }
  if (typeof patch.intro_description === "string") {
    payload.intro_description = sanitizeHiringCopyHtml(patch.intro_description);
  }
  if (typeof patch.intro_button_label === "string") {
    payload.intro_button_label = patch.intro_button_label.trim() || "Apply here";
  }
  if (typeof patch.intro_background_color === "string") {
    payload.intro_background_color =
      normalizeHexColor(patch.intro_background_color) ??
      DEFAULT_HIRING_INTRO_BACKGROUND;
  }
  if (typeof patch.intro2_title === "string") {
    payload.intro2_title = patch.intro2_title.trim();
  }
  if (typeof patch.intro2_description === "string") {
    payload.intro2_description = sanitizeHiringCopyHtml(patch.intro2_description);
  }
  if (typeof patch.intro2_button_label === "string") {
    payload.intro2_button_label = patch.intro2_button_label.trim() || "Continue";
  }
  if (typeof patch.intro2_background_color === "string") {
    payload.intro2_background_color =
      normalizeHexColor(patch.intro2_background_color) ??
      DEFAULT_HIRING_INTRO2_BACKGROUND;
  }
  if (patch.intro2_department_id !== undefined) {
    payload.intro2_department_id = patch.intro2_department_id || null;
  }
  if (patch.intro2_position_ids !== undefined) {
    payload.intro2_position_ids = patch.intro2_position_ids.filter(Boolean);
  }
  if (typeof patch.end_message === "string") {
    payload.end_message = sanitizeHiringCopyHtml(patch.end_message);
  }
  if (typeof patch.show_socials === "boolean") payload.show_socials = patch.show_socials;
  if (patch.table_column_ids) payload.table_column_ids = patch.table_column_ids;
  if (patch.sort_field_id !== undefined) {
    payload.sort_field_id = patch.sort_field_id || null;
  }
  if (patch.sort_direction) payload.sort_direction = patch.sort_direction;
  if (typeof patch.interview_request_subject === "string") {
    payload.interview_request_subject = patch.interview_request_subject;
  }
  if (typeof patch.interview_request_body === "string") {
    payload.interview_request_body = patch.interview_request_body;
  }
  if (typeof patch.interview_confirm_subject === "string") {
    payload.interview_confirm_subject = patch.interview_confirm_subject;
  }
  if (typeof patch.interview_confirm_body === "string") {
    payload.interview_confirm_body = patch.interview_confirm_body;
  }

  const { error } = await ctx.service
    .from("hiring_forms")
    .update(payload)
    .eq("id", formId)
    .eq("venue_id", ctx.auth.venue.id);
  if (error) return fail(error.message);
  return { ok: true as const };
}

export async function uploadHiringIntroImage(formId: string, formData: FormData) {
  const ctx = await hiringContext(true);
  if ("error" in ctx) return fail(ctx.error);

  const slot = formData.get("slot") === "intro2" ? "intro2" : "intro";
  const blob = asUploadBlob(formData.get("image"));
  if (!blob) return fail("Choose an image for the intro page.");
  if (!resolveRasterImageMime(uploadBlobMeta(blob))) {
    return fail("Intro image must be a PNG, JPEG, GIF, AVIF, or WebP file.");
  }
  const bytes = Buffer.from(await blob.arrayBuffer());
  let webp: Awaited<ReturnType<typeof convertImageToWebp>>;
  try {
    webp = await convertImageToWebp(bytes, { maxWidth: 1600, maxHeight: 1600 });
  } catch {
    return fail("Could not convert the intro image to WebP.");
  }

  const path = `${ctx.auth.venue.id}/forms/${formId}/${slot}.webp`;
  const { error: uploadError } = await ctx.service.storage
    .from(HIRING_STORAGE_BUCKET)
    .upload(path, new Uint8Array(webp.buffer), {
      contentType: webp.contentType,
      upsert: true,
      cacheControl: "31536000",
    });
  if (uploadError) return fail(uploadError.message);

  const { data } = ctx.service.storage.from(HIRING_STORAGE_BUCKET).getPublicUrl(path);
  const publicUrl = `${data.publicUrl}?v=${Date.now()}`;
  const column = slot === "intro2" ? "intro2_image_url" : "intro_image_url";
  const { error } = await ctx.service
    .from("hiring_forms")
    .update({ [column]: publicUrl })
    .eq("id", formId)
    .eq("venue_id", ctx.auth.venue.id);
  if (error) return fail(error.message);
  return { ok: true as const, url: publicUrl, slot };
}

export type HiringBlockInput = {
  id: string;
  kind: HiringBlockKind;
  title?: string;
  description?: string;
  field_label?: string;
  field_type?: HiringFieldType | null;
  required?: boolean;
  config?: Record<string, unknown>;
};

export async function saveHiringFormBlocks(
  formId: string,
  blocks: HiringBlockInput[],
) {
  const ctx = await hiringContext(true);
  if ("error" in ctx) return fail(ctx.error);

  const { data: form } = await ctx.service
    .from("hiring_forms")
    .select("id")
    .eq("id", formId)
    .eq("venue_id", ctx.auth.venue.id)
    .maybeSingle();
  if (!form) return fail("Form not found.");

  const { data: existing } = await ctx.service
    .from("hiring_form_blocks")
    .select("id")
    .eq("form_id", formId);
  const keepIds = new Set(blocks.map((block) => block.id));
  const toDelete = ((existing ?? []) as Array<{ id: string }>)
    .map((row) => row.id)
    .filter((id) => !keepIds.has(id));
  if (toDelete.length > 0) {
    await ctx.service.from("hiring_form_blocks").delete().in("id", toDelete);
  }

  const rows = blocks.map((block, index) => {
    const label = (block.field_label ?? block.title ?? "").trim();
    return {
      id: block.id,
      form_id: formId,
      sort_order: (index + 1) * 10,
      kind: block.kind,
      title: block.kind === "title" ? (block.title ?? "").trim() || "Title" : null,
      description:
        block.kind === "description"
          ? sanitizeHiringCopyHtml(block.description ?? "")
          : (block.description ?? null),
      field_key:
        block.kind === "field"
          ? slugifyHiringFieldKey(label, `field_${index + 1}`)
          : null,
      field_label: block.kind === "field" ? label || "Untitled field" : null,
      field_type: block.kind === "field" ? block.field_type || "short_text" : null,
      required: block.kind === "field" ? block.required === true : false,
      config: mergeHiringFieldConfig(block.config),
    };
  });

  const { error } = await ctx.service
    .from("hiring_form_blocks")
    .upsert(rows, { onConflict: "id" });
  if (error) return fail(error.message);
  return { ok: true as const };
}

export async function updateHiringApplicationMeta(input: {
  applicationId: string;
  category?: HiringCategory | null;
  status?: HiringApplicationStatus;
}) {
  const ctx = await hiringContext(true);
  if ("error" in ctx) return fail(ctx.error);

  const payload: Record<string, unknown> = {};
  if (input.category !== undefined) payload.category = input.category;
  if (input.status) payload.status = input.status;

  const { error } = await ctx.service
    .from("hiring_applications")
    .update(payload)
    .eq("id", input.applicationId)
    .eq("venue_id", ctx.auth.venue.id);
  if (error) return fail(error.message);
  return { ok: true as const };
}

export async function sendHiringInterviewEmail(input: {
  applicationId: string;
  kind: "request" | "confirm";
  format?: "in_person" | "video";
  locationDetails?: string;
  meetingLink?: string;
  date?: string;
  time?: string;
  subject?: string;
  body?: string;
}) {
  const ctx = await hiringContext(true);
  if ("error" in ctx) return fail(ctx.error);

  const application = await getHiringApplication(
    ctx.service,
    ctx.auth.venue.id,
    input.applicationId,
  );
  if (!application) return fail("Application not found.");
  if (!application.applicant_email) {
    return fail("This reply has no email address. Add an Email field to the form.");
  }

  const { data: form } = await ctx.service
    .from("hiring_forms")
    .select(
      "id, name, interview_request_subject, interview_request_body, interview_confirm_subject, interview_confirm_body",
    )
    .eq("id", application.form_id)
    .eq("venue_id", ctx.auth.venue.id)
    .maybeSingle();
  if (!form) return fail("Form not found.");

  const venueName = ctx.auth.venue.name ?? "Venue";
  let details = "";
  let datetime = "";
  let startsAt: string | null = null;

  if (input.kind === "confirm") {
    if (!input.date || !input.time) {
      return fail("Choose a date and time for the interview.");
    }
    if (input.format === "video" && !input.meetingLink?.trim()) {
      return fail("Add a meeting link for the video call.");
    }
    if (input.format !== "video" && !input.locationDetails?.trim()) {
      return fail("Add the in-person location details.");
    }
    datetime = `${input.date.split("-").reverse().join("/")} at ${input.time}`;
    details =
      input.format === "video"
        ? `Format: video call\nMeeting link: ${input.meetingLink?.trim()}`
        : `Format: in person\nLocation: ${input.locationDetails?.trim()}`;
    startsAt = new Date(`${input.date}T${input.time}:00`).toISOString();
  }

  const vars = {
    name: application.applicant_name || "there",
    venue: venueName,
    datetime,
    details,
  };
  const subject = fillHiringEmailTemplate(
    (input.subject ??
      (input.kind === "confirm"
        ? form.interview_confirm_subject
        : form.interview_request_subject) ??
      "") ||
      (input.kind === "confirm"
        ? DEFAULT_INTERVIEW_CONFIRM_SUBJECT
        : DEFAULT_INTERVIEW_REQUEST_SUBJECT),
    vars,
  );
  const body = fillHiringEmailTemplate(
    (input.body ??
      (input.kind === "confirm"
        ? form.interview_confirm_body
        : form.interview_request_body) ??
      "") ||
      (input.kind === "confirm"
        ? DEFAULT_INTERVIEW_CONFIRM_BODY
        : DEFAULT_INTERVIEW_REQUEST_BODY),
    vars,
  );

  const { html, inlineAttachments } = await buildHrTemplateEmailHtml({
    body,
    venue: ctx.auth.venue,
  });

  try {
    await sendAppEmail(
      {
        to: application.applicant_email,
        subject,
        html,
        attachments: inlineAttachments,
      },
      { venueId: ctx.auth.venue.id, supabase: ctx.auth.supabase },
    );
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Could not send the email.");
  }

  if (input.kind === "confirm" && startsAt) {
    const { error: appointmentError } = await ctx.service
      .from("hiring_appointments")
      .insert({
        venue_id: ctx.auth.venue.id,
        form_id: application.form_id,
        application_id: application.id,
        format: input.format === "video" ? "video" : "in_person",
        location_details: input.locationDetails?.trim() || null,
        meeting_link: input.meetingLink?.trim() || null,
        starts_at: startsAt,
        status: "confirmed",
      });
    if (appointmentError) return fail(appointmentError.message);
    await ctx.service
      .from("hiring_applications")
      .update({ status: "interview_scheduled" })
      .eq("id", application.id);
  } else {
    await ctx.service
      .from("hiring_applications")
      .update({ status: "interview_request_sent" })
      .eq("id", application.id);
  }

  return { ok: true as const };
}
