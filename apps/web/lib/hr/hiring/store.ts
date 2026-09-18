import type { SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import {
  DEFAULT_HIRING_INTRO_BACKGROUND,
  DEFAULT_HIRING_INTRO2_BACKGROUND,
  mergeHiringFieldConfig,
  type HiringAnswers,
  type HiringApplication,
  type HiringApplicationFile,
  type HiringAppointment,
  type HiringForm,
  type HiringFormBlock,
  type HiringFormStatus,
} from "./types";

const FORM_SELECT =
  "id, venue_id, name, public_code, status, accept_from, accept_until, max_entries, intro_image_url, intro_background_color, intro_description, intro_button_label, intro2_image_url, intro2_background_color, intro2_title, intro2_description, intro2_button_label, intro2_department_id, intro2_position_ids, end_message, show_socials, table_column_ids, sort_field_id, sort_direction, interview_request_subject, interview_request_body, interview_confirm_subject, interview_confirm_body, created_at, updated_at";

const BLOCK_SELECT =
  "id, form_id, sort_order, kind, title, description, field_key, field_label, field_type, required, config, created_at, updated_at";

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function mapForm(row: Record<string, unknown>, applicationCount?: number): HiringForm {
  return {
    id: String(row.id),
    venue_id: String(row.venue_id),
    name: String(row.name ?? ""),
    public_code: String(row.public_code ?? ""),
    status: (row.status as HiringFormStatus) || "paused",
    accept_from: (row.accept_from as string | null) ?? null,
    accept_until: (row.accept_until as string | null) ?? null,
    max_entries:
      row.max_entries == null ? null : Number(row.max_entries) || null,
    intro_image_url: (row.intro_image_url as string | null) ?? null,
    intro_background_color: String(
      row.intro_background_color ?? DEFAULT_HIRING_INTRO_BACKGROUND,
    ),
    intro_description: String(row.intro_description ?? ""),
    intro_button_label: String(row.intro_button_label ?? "Apply here"),
    intro2_image_url: (row.intro2_image_url as string | null) ?? null,
    intro2_background_color: String(
      row.intro2_background_color ?? DEFAULT_HIRING_INTRO2_BACKGROUND,
    ),
    intro2_title: String(row.intro2_title ?? ""),
    intro2_description: String(row.intro2_description ?? ""),
    intro2_button_label: String(row.intro2_button_label ?? "Continue"),
    intro2_department_id: (row.intro2_department_id as string | null) ?? null,
    intro2_position_ids: asStringArray(row.intro2_position_ids),
    end_message: String(row.end_message ?? ""),
    show_socials: row.show_socials !== false,
    table_column_ids: asStringArray(row.table_column_ids),
    sort_field_id: (row.sort_field_id as string | null) ?? null,
    sort_direction: row.sort_direction === "asc" ? "asc" : "desc",
    interview_request_subject: String(row.interview_request_subject ?? ""),
    interview_request_body: String(row.interview_request_body ?? ""),
    interview_confirm_subject: String(row.interview_confirm_subject ?? ""),
    interview_confirm_body: String(row.interview_confirm_body ?? ""),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
    application_count: applicationCount,
  };
}

async function withIntroPositionLabels(
  client: SupabaseClient,
  form: HiringForm,
): Promise<HiringForm> {
  if (form.intro2_position_ids.length === 0) {
    return { ...form, intro2_position_labels: [] };
  }
  const { data, error } = await client
    .from("positions")
    .select("id, name")
    .in("id", form.intro2_position_ids);
  if (error) {
    console.error("[hiring] intro position labels:", error.message);
    return { ...form, intro2_position_labels: [] };
  }
  const byId = new Map(
    (data ?? []).map((row) => [String(row.id), String(row.name ?? "")]),
  );
  return {
    ...form,
    intro2_position_labels: form.intro2_position_ids
      .map((id) => byId.get(id)?.trim() ?? "")
      .filter(Boolean),
  };
}

function mapBlock(row: Record<string, unknown>): HiringFormBlock {
  return {
    id: String(row.id),
    form_id: String(row.form_id),
    sort_order: Number(row.sort_order) || 0,
    kind: row.kind === "title" || row.kind === "description" ? row.kind : "field",
    title: (row.title as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    field_key: (row.field_key as string | null) ?? null,
    field_label: (row.field_label as string | null) ?? null,
    field_type:
      row.field_type === "short_text" ||
      row.field_type === "long_text" ||
      row.field_type === "date" ||
      row.field_type === "number" ||
      row.field_type === "email" ||
      row.field_type === "picture" ||
      row.field_type === "file"
        ? row.field_type
        : null,
    required: row.required === true,
    config: mergeHiringFieldConfig(row.config),
  };
}

function mapFile(row: Record<string, unknown>): HiringApplicationFile {
  return {
    id: String(row.id),
    application_id: String(row.application_id),
    block_id: (row.block_id as string | null) ?? null,
    storage_path: String(row.storage_path ?? ""),
    public_url: String(row.public_url ?? ""),
    file_name: String(row.file_name ?? ""),
    content_type: (row.content_type as string | null) ?? null,
    byte_size: row.byte_size == null ? null : Number(row.byte_size),
  };
}

function mapApplication(
  row: Record<string, unknown>,
  files: HiringApplicationFile[],
): HiringApplication {
  const answers =
    row.answers && typeof row.answers === "object"
      ? (row.answers as HiringAnswers)
      : {};
  return {
    id: String(row.id),
    form_id: String(row.form_id),
    venue_id: String(row.venue_id),
    submitted_at: String(row.submitted_at ?? ""),
    category:
      row.category === "not_fit" ||
      row.category === "maybe" ||
      row.category === "good_candidate"
        ? row.category
        : null,
    status:
      row.status === "interview_request_sent" ||
      row.status === "interview_scheduled" ||
      row.status === "final_assessment" ||
      row.status === "to_be_hired"
        ? row.status
        : "no_interaction",
    answers,
    applicant_name: (row.applicant_name as string | null) ?? null,
    applicant_email: (row.applicant_email as string | null) ?? null,
    files,
  };
}

export function newHiringPublicCode(): string {
  return randomBytes(4).toString("hex");
}

export async function listHiringForms(
  client: SupabaseClient,
  venueId: string,
): Promise<HiringForm[]> {
  const { data, error } = await client
    .from("hiring_forms")
    .select(FORM_SELECT)
    .eq("venue_id", venueId)
    .order("updated_at", { ascending: false });
  if (error) throw error;

  const forms = (data ?? []) as Record<string, unknown>[];
  if (forms.length === 0) return [];

  const { data: counts } = await client
    .from("hiring_applications")
    .select("form_id")
    .eq("venue_id", venueId);

  const countByForm = new Map<string, number>();
  for (const row of counts ?? []) {
    const id = String((row as { form_id: string }).form_id);
    countByForm.set(id, (countByForm.get(id) ?? 0) + 1);
  }

  return forms.map((row) => mapForm(row, countByForm.get(String(row.id)) ?? 0));
}

export async function getHiringForm(
  client: SupabaseClient,
  venueId: string,
  formId: string,
): Promise<HiringForm | null> {
  const { data, error } = await client
    .from("hiring_forms")
    .select(FORM_SELECT)
    .eq("venue_id", venueId)
    .eq("id", formId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { count } = await client
    .from("hiring_applications")
    .select("id", { count: "exact", head: true })
    .eq("form_id", formId);
  return withIntroPositionLabels(
    client,
    mapForm(data as Record<string, unknown>, count ?? 0),
  );
}

export async function getHiringFormByCode(
  client: SupabaseClient,
  code: string,
): Promise<HiringForm | null> {
  const normalized = code.trim().toLowerCase();
  if (!normalized) return null;
  const { data, error } = await client
    .from("hiring_forms")
    .select(FORM_SELECT)
    .ilike("public_code", normalized)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { count } = await client
    .from("hiring_applications")
    .select("id", { count: "exact", head: true })
    .eq("form_id", String((data as { id: string }).id));
  return withIntroPositionLabels(
    client,
    mapForm(data as Record<string, unknown>, count ?? 0),
  );
}

export async function listHiringFormBlocks(
  client: SupabaseClient,
  formId: string,
): Promise<HiringFormBlock[]> {
  const { data, error } = await client
    .from("hiring_form_blocks")
    .select(BLOCK_SELECT)
    .eq("form_id", formId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(mapBlock);
}

export async function listHiringApplicationsForForm(
  client: SupabaseClient,
  venueId: string,
  formId: string,
): Promise<HiringApplication[]> {
  const { data, error } = await client
    .from("hiring_applications")
    .select(
      "id, form_id, venue_id, submitted_at, category, status, answers, applicant_name, applicant_email",
    )
    .eq("venue_id", venueId)
    .eq("form_id", formId)
    .order("submitted_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as Record<string, unknown>[];
  if (rows.length === 0) return [];

  const ids = rows.map((row) => String(row.id));
  const { data: files } = await client
    .from("hiring_application_files")
    .select(
      "id, application_id, block_id, storage_path, public_url, file_name, content_type, byte_size",
    )
    .in("application_id", ids);

  const filesByApp = new Map<string, HiringApplicationFile[]>();
  for (const file of (files ?? []) as Record<string, unknown>[]) {
    const mapped = mapFile(file);
    const list = filesByApp.get(mapped.application_id) ?? [];
    list.push(mapped);
    filesByApp.set(mapped.application_id, list);
  }

  return rows.map((row) =>
    mapApplication(row, filesByApp.get(String(row.id)) ?? []),
  );
}

export async function listShortlistedApplications(
  client: SupabaseClient,
  venueId: string,
): Promise<Array<HiringApplication & { form_name: string }>> {
  const { data, error } = await client
    .from("hiring_applications")
    .select(
      "id, form_id, venue_id, submitted_at, category, status, answers, applicant_name, applicant_email, hiring_forms(name)",
    )
    .eq("venue_id", venueId)
    .in("status", ["final_assessment", "to_be_hired"])
    .order("submitted_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as Record<string, unknown>[];
  if (rows.length === 0) return [];

  const ids = rows.map((row) => String(row.id));
  const { data: files } = await client
    .from("hiring_application_files")
    .select(
      "id, application_id, block_id, storage_path, public_url, file_name, content_type, byte_size",
    )
    .in("application_id", ids);

  const filesByApp = new Map<string, HiringApplicationFile[]>();
  for (const file of (files ?? []) as Record<string, unknown>[]) {
    const mapped = mapFile(file);
    const list = filesByApp.get(mapped.application_id) ?? [];
    list.push(mapped);
    filesByApp.set(mapped.application_id, list);
  }

  return rows.map((row) => {
    const joined = row.hiring_forms as { name?: string } | { name?: string }[] | null;
    const formName = Array.isArray(joined)
      ? joined[0]?.name
      : joined?.name;
    return {
      ...mapApplication(row, filesByApp.get(String(row.id)) ?? []),
      form_name: formName?.trim() || "Form",
    };
  });
}

export async function getHiringApplication(
  client: SupabaseClient,
  venueId: string,
  applicationId: string,
): Promise<HiringApplication | null> {
  const { data, error } = await client
    .from("hiring_applications")
    .select(
      "id, form_id, venue_id, submitted_at, category, status, answers, applicant_name, applicant_email",
    )
    .eq("venue_id", venueId)
    .eq("id", applicationId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { data: files } = await client
    .from("hiring_application_files")
    .select(
      "id, application_id, block_id, storage_path, public_url, file_name, content_type, byte_size",
    )
    .eq("application_id", applicationId);
  return mapApplication(
    data as Record<string, unknown>,
    ((files ?? []) as Record<string, unknown>[]).map(mapFile),
  );
}

export async function listHiringAppointments(
  client: SupabaseClient,
  venueId: string,
): Promise<HiringAppointment[]> {
  const { data, error } = await client
    .from("hiring_appointments")
    .select(
      "id, venue_id, form_id, application_id, format, location_details, meeting_link, starts_at, ends_at, status, hiring_applications(applicant_name, applicant_email), hiring_forms(name)",
    )
    .eq("venue_id", venueId)
    .eq("status", "confirmed")
    .order("starts_at", { ascending: true });
  if (error) throw error;

  return ((data ?? []) as Record<string, unknown>[]).map((row) => {
    const app = row.hiring_applications as
      | { applicant_name?: string | null; applicant_email?: string | null }
      | { applicant_name?: string | null; applicant_email?: string | null }[]
      | null;
    const form = row.hiring_forms as { name?: string } | { name?: string }[] | null;
    const appRow = Array.isArray(app) ? app[0] : app;
    const formRow = Array.isArray(form) ? form[0] : form;
    return {
      id: String(row.id),
      venue_id: String(row.venue_id),
      form_id: String(row.form_id),
      application_id: String(row.application_id),
      format: row.format === "video" ? "video" : "in_person",
      location_details: (row.location_details as string | null) ?? null,
      meeting_link: (row.meeting_link as string | null) ?? null,
      starts_at: String(row.starts_at ?? ""),
      ends_at: (row.ends_at as string | null) ?? null,
      status: row.status === "cancelled" ? "cancelled" : "confirmed",
      applicant_name: appRow?.applicant_name ?? null,
      applicant_email: appRow?.applicant_email ?? null,
      form_name: formRow?.name ?? null,
    };
  });
}
