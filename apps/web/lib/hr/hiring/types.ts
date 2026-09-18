export const DEFAULT_HIRING_INTRO_BACKGROUND = "#323232";
export const DEFAULT_HIRING_INTRO2_BACKGROUND = "#E8E8E8";
/** Matches the logged-in app canvas (`--background` in globals.css). */
export const DEFAULT_HIRING_BODY_BACKGROUND = "#FAF9F6";
export const HIRING_PUBLIC_BASE = "/apply";
export const HIRING_STORAGE_BUCKET = "hiring";

export function hiringHexIsDark(value: string): boolean {
  const hex = value.trim().replace(/^#/, "");
  if (!/^[0-9A-Fa-f]{6}$/.test(hex)) return false;
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.55;
}

export function hiringApplyPath(code: string): string {
  return `${HIRING_PUBLIC_BASE}/${encodeURIComponent(code.trim().toLowerCase())}`;
}

export const HIRING_FIELD_TYPES = [
  "short_text",
  "long_text",
  "date",
  "number",
  "email",
  "phone",
  "nationality",
  "yes_no",
  "dropdown",
  "radio",
  "checkbox",
  "multiple_choice",
  "picture",
  "file",
] as const;

export type HiringFieldType = (typeof HIRING_FIELD_TYPES)[number];

export const HIRING_BLOCK_KINDS = [
  "title",
  "description",
  "field",
  "page",
] as const;
export type HiringBlockKind = (typeof HIRING_BLOCK_KINDS)[number];

export function isHiringBlockKind(value: unknown): value is HiringBlockKind {
  return (
    typeof value === "string" &&
    (HIRING_BLOCK_KINDS as readonly string[]).includes(value)
  );
}

export function hiringBodyPageLabel(pageNumber: number): string {
  return `BODY PAGE ${pageNumber}`;
}

export function hiringBodyPageNumberAt(
  blocks: { kind: string }[],
  index: number,
): number {
  let page = 1;
  for (let i = 0; i <= index; i += 1) {
    if (blocks[i]?.kind === "page") page += 1;
  }
  return page;
}

/** Splits questionnaire blocks on `page` dividers. Empty pages are omitted. */
export function splitHiringBodyPages<T extends { kind: string }>(
  blocks: T[],
): T[][] {
  const pages: T[][] = [[]];
  for (const block of blocks) {
    if (block.kind === "page") {
      pages.push([]);
      continue;
    }
    pages[pages.length - 1]!.push(block);
  }
  const filled = pages.filter((page) => page.length > 0);
  return filled.length > 0 ? filled : [[]];
}

export const HIRING_FORM_STATUSES = ["live", "paused", "scheduled"] as const;
export type HiringFormStatus = (typeof HIRING_FORM_STATUSES)[number];

export const HIRING_CATEGORIES = ["not_fit", "maybe", "good_candidate"] as const;
export type HiringCategory = (typeof HIRING_CATEGORIES)[number];

export const HIRING_APPLICATION_STATUSES = [
  "no_interaction",
  "interview_request_sent",
  "interview_scheduled",
  "final_assessment",
  "to_be_hired",
] as const;
export type HiringApplicationStatus =
  (typeof HIRING_APPLICATION_STATUSES)[number];

export const HIRING_SHORTLIST_STATUSES: HiringApplicationStatus[] = [
  "final_assessment",
  "to_be_hired",
];

export const HIRING_FIELD_TYPE_LABELS: Record<HiringFieldType, string> = {
  short_text: "Short text",
  long_text: "Long text",
  date: "Date",
  number: "Numbers",
  email: "Email",
  phone: "Phone",
  nationality: "Nationality",
  yes_no: "Yes or No",
  dropdown: "Drop down",
  radio: "Radio",
  checkbox: "Checkbox",
  multiple_choice: "Multiple choices",
  picture: "Picture upload",
  file: "File upload",
};

export const HIRING_FIELD_PLACEHOLDERS: Record<HiringFieldType, string> = {
  short_text: "e.g. Jane Smith",
  long_text: "e.g. Tell us a bit about yourself",
  date: "DD/MM/YYYY",
  number: "e.g. 5",
  email: "e.g. name@email.com",
  phone: "e.g. 50 123 4567",
  nationality: "Search country…",
  yes_no: "",
  dropdown: "Select…",
  radio: "",
  checkbox: "",
  multiple_choice: "",
  picture: "JPG, PNG or WebP",
  file: "PDF or document, up to 8 MB",
};

export function hiringFieldPlaceholder(
  type: HiringFieldType,
  custom?: string | null,
): string {
  const trimmed = custom?.trim() ?? "";
  return trimmed || HIRING_FIELD_PLACEHOLDERS[type];
}

export const HIRING_YES_NO_OPTIONS = ["Yes", "No"] as const;

export const DEFAULT_HIRING_OPTIONS = ["Option 1", "Option 2", "Option 3"];

export const HIRING_OPTION_FIELD_TYPES = [
  "dropdown",
  "radio",
  "multiple_choice",
] as const;

export function hiringFieldHasOptions(type: HiringFieldType): boolean {
  return (HIRING_OPTION_FIELD_TYPES as readonly string[]).includes(type);
}

export function hiringFieldShowsPlaceholder(type: HiringFieldType): boolean {
  return (
    type !== "yes_no" &&
    type !== "radio" &&
    type !== "checkbox" &&
    type !== "multiple_choice"
  );
}

export function isHiringFieldType(value: unknown): value is HiringFieldType {
  return (
    typeof value === "string" &&
    (HIRING_FIELD_TYPES as readonly string[]).includes(value)
  );
}

export function normalizeHiringOptions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [...DEFAULT_HIRING_OPTIONS];
  const options = raw
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .slice(0, 30);
  return options.length > 0 ? options : [...DEFAULT_HIRING_OPTIONS];
}

export function hiringFieldChoiceOptions(
  type: HiringFieldType,
  options: string[] | undefined,
): string[] {
  if (type === "yes_no") return [...HIRING_YES_NO_OPTIONS];
  if (hiringFieldHasOptions(type)) return normalizeHiringOptions(options);
  return [];
}

export const HIRING_CATEGORY_LABELS: Record<HiringCategory, string> = {
  not_fit: "Not Fit",
  maybe: "Maybe",
  good_candidate: "Good Candidate",
};

export const HIRING_STATUS_LABELS: Record<HiringApplicationStatus, string> = {
  no_interaction: "No interaction",
  interview_request_sent: "Interview request email sent",
  interview_scheduled: "Interview schedule confirmed",
  final_assessment: "Final Assessment",
  to_be_hired: "To be Hired",
};

export const HIRING_FORM_STATUS_LABELS: Record<HiringFormStatus, string> = {
  live: "Live",
  paused: "Paused",
  scheduled: "Accepting period",
};

export type HiringFieldConfig = {
  allowNumbers: boolean;
  allowSymbols: boolean;
  allowPunctuation: boolean;
  maxFileMb: number;
  maxFiles: number;
  computeAge: boolean;
  placeholder: string;
  instructions: string;
  options: string[];
};

export const DEFAULT_HIRING_FIELD_CONFIG: HiringFieldConfig = {
  allowNumbers: true,
  allowSymbols: true,
  allowPunctuation: true,
  maxFileMb: 8,
  maxFiles: 1,
  computeAge: false,
  placeholder: "",
  instructions: "",
  options: [...DEFAULT_HIRING_OPTIONS],
};

export type HiringFormBlock = {
  id: string;
  form_id: string;
  sort_order: number;
  kind: HiringBlockKind;
  title: string | null;
  description: string | null;
  field_key: string | null;
  field_label: string | null;
  field_type: HiringFieldType | null;
  required: boolean;
  config: HiringFieldConfig;
};

export type HiringForm = {
  id: string;
  venue_id: string;
  name: string;
  public_code: string;
  status: HiringFormStatus;
  accept_from: string | null;
  accept_until: string | null;
  max_entries: number | null;
  intro_image_url: string | null;
  intro_background_color: string;
  intro_description: string;
  intro_button_label: string;
  intro2_image_url: string | null;
  intro2_background_color: string;
  intro2_title: string;
  intro2_description: string;
  intro2_button_label: string;
  intro2_department_id: string | null;
  intro2_position_ids: string[];
  intro2_position_labels?: string[];
  body_background_color: string;
  end_message: string;
  show_socials: boolean;
  table_column_ids: string[];
  notify_user_ids: string[];
  sort_field_id: string | null;
  sort_direction: "asc" | "desc";
  interview_request_subject: string;
  interview_request_body: string;
  interview_confirm_subject: string;
  interview_confirm_body: string;
  interview_confirm_video_subject: string;
  interview_confirm_video_body: string;
  created_at: string;
  updated_at: string;
  application_count?: number;
};

export function hasSecondHiringIntro(
  form: Pick<
    HiringForm,
    "intro2_image_url" | "intro2_title" | "intro2_description"
  >,
): boolean {
  const title = form.intro2_title.trim();
  const copy = form.intro2_description
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return Boolean(form.intro2_image_url || title || copy);
}

export type HiringApplicationFile = {
  id: string;
  application_id: string;
  block_id: string | null;
  storage_path: string;
  public_url: string;
  file_name: string;
  content_type: string | null;
  byte_size: number | null;
};

export type HiringAnswerValue =
  | string
  | number
  | string[]
  | null;

export type HiringAnswers = Record<
  string,
  {
    label: string;
    type: HiringFieldType;
    value: HiringAnswerValue;
  }
>;

export type HiringApplication = {
  id: string;
  form_id: string;
  venue_id: string;
  submitted_at: string;
  category: HiringCategory | null;
  status: HiringApplicationStatus;
  answers: HiringAnswers;
  applicant_name: string | null;
  applicant_email: string | null;
  files: HiringApplicationFile[];
};

export type HiringAppointment = {
  id: string;
  venue_id: string;
  form_id: string;
  application_id: string;
  format: "in_person" | "video";
  location_details: string | null;
  meeting_link: string | null;
  starts_at: string;
  ends_at: string | null;
  status: "confirmed" | "cancelled";
  applicant_name: string | null;
  applicant_email: string | null;
  form_name: string | null;
};

export const DEFAULT_INTERVIEW_REQUEST_SUBJECT =
  "Interview availability — {venue}";
export const DEFAULT_INTERVIEW_REQUEST_BODY = `Hello {name},

Thank you for applying. Could you share a few times you are available for an interview?

Kind regards,
{venue}`;

export const DEFAULT_INTERVIEW_CONFIRM_SUBJECT =
  "In-person interview confirmed — {venue}";
export const DEFAULT_INTERVIEW_CONFIRM_BODY = `Hello {name},

Your in-person interview is confirmed for {datetime}.

{details}

Kind regards,
{venue}`;

export const DEFAULT_INTERVIEW_CONFIRM_VIDEO_SUBJECT =
  "Online interview confirmed — {venue}";
export const DEFAULT_INTERVIEW_CONFIRM_VIDEO_BODY = `Hello {name},

Your online interview is confirmed for {datetime}.

{details}

Kind regards,
{venue}`;

export function hiringInterviewConfirmCopy(
  form: Pick<
    HiringForm,
    | "interview_confirm_subject"
    | "interview_confirm_body"
    | "interview_confirm_video_subject"
    | "interview_confirm_video_body"
  >,
  format: "in_person" | "video",
): { subject: string; body: string } {
  if (format === "video") {
    const subject = form.interview_confirm_video_subject.trim();
    const body = form.interview_confirm_video_body.trim();
    return {
      subject: subject || form.interview_confirm_subject,
      body: body || form.interview_confirm_body,
    };
  }
  return {
    subject: form.interview_confirm_subject,
    body: form.interview_confirm_body,
  };
}

export function mergeHiringFieldConfig(
  raw: unknown,
): HiringFieldConfig {
  const value =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const maxFileMb = Number(value.maxFileMb);
  const maxFiles = Number(value.maxFiles);
  return {
    allowNumbers:
      typeof value.allowNumbers === "boolean"
        ? value.allowNumbers
        : DEFAULT_HIRING_FIELD_CONFIG.allowNumbers,
    allowSymbols:
      typeof value.allowSymbols === "boolean"
        ? value.allowSymbols
        : DEFAULT_HIRING_FIELD_CONFIG.allowSymbols,
    allowPunctuation:
      typeof value.allowPunctuation === "boolean"
        ? value.allowPunctuation
        : DEFAULT_HIRING_FIELD_CONFIG.allowPunctuation,
    maxFileMb:
      Number.isFinite(maxFileMb) && maxFileMb > 0
        ? Math.min(20, Math.round(maxFileMb))
        : DEFAULT_HIRING_FIELD_CONFIG.maxFileMb,
    maxFiles:
      Number.isFinite(maxFiles) && maxFiles > 0
        ? Math.min(5, Math.round(maxFiles))
        : DEFAULT_HIRING_FIELD_CONFIG.maxFiles,
    computeAge: value.computeAge === true,
    placeholder:
      typeof value.placeholder === "string"
        ? value.placeholder.trim().slice(0, 800)
        : DEFAULT_HIRING_FIELD_CONFIG.placeholder,
    instructions:
      typeof value.instructions === "string"
        ? value.instructions.trim().slice(0, 400)
        : DEFAULT_HIRING_FIELD_CONFIG.instructions,
    options: normalizeHiringOptions(value.options),
  };
}

export function slugifyHiringFieldKey(label: string, fallback: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
  return slug || fallback;
}

export function isHiringFormAccepting(
  form: Pick<
    HiringForm,
    "status" | "accept_from" | "accept_until" | "max_entries"
  >,
  options?: { todayIso?: string; applicationCount?: number },
): { ok: true } | { ok: false; reason: string } {
  if (form.status === "paused") {
    return { ok: false, reason: "This hiring form is paused." };
  }
  const today =
    options?.todayIso ??
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai" }).format(
      new Date(),
    );
  if (form.status === "scheduled") {
    if (form.accept_from && today < form.accept_from) {
      return { ok: false, reason: "Applications are not open yet." };
    }
    if (form.accept_until && today > form.accept_until) {
      return { ok: false, reason: "The application period has ended." };
    }
  }
  if (
    form.max_entries != null &&
    options?.applicationCount != null &&
    options.applicationCount >= form.max_entries
  ) {
    return { ok: false, reason: "This form is no longer accepting applications." };
  }
  return { ok: true };
}

export function ageFromIsoDate(iso: string, today = new Date()): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [year, month, day] = iso.split("-").map(Number);
  const birth = new Date(year, month - 1, day);
  if (Number.isNaN(birth.getTime())) return null;
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age >= 0 && age < 120 ? age : null;
}

export function fillHiringEmailTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? "");
}

export const HIRING_COPY_POSITIONS_TOKEN = "{positions}";
export const HIRING_COPY_NAME_TOKEN = "{name}";
export const HIRING_COPY_FIRST_NAME_TOKEN = "{firstname}";

export function formatHiringPositionNames(names: string[]): string {
  return names.map((name) => name.trim()).filter(Boolean).join(", ");
}

export function hiringFirstNameFromFullName(fullName: string): string {
  return fullName.trim().split(/\s+/).filter(Boolean)[0] ?? "";
}

/** Live / saved applicant name from a Full name (or similar) short-text field. */
export function hiringApplicantNameFromFieldValues(
  blocks: Array<{
    id: string;
    kind: string;
    field_type: string | null;
    field_label: string | null;
    field_key?: string | null;
  }>,
  values: Record<string, string>,
): string {
  const fields = blocks.filter(
    (block) => block.kind === "field" && block.field_type,
  );
  for (const block of fields) {
    const value = (values[block.id] ?? "").trim();
    if (!value || block.field_type !== "short_text") continue;
    const label =
      `${block.field_label ?? ""} ${block.field_key ?? ""}`.toLowerCase();
    if (label.includes("name")) return value;
  }
  const firstText = fields.find(
    (block) =>
      block.field_type === "short_text" && (values[block.id] ?? "").trim(),
  );
  return firstText ? (values[firstText.id] ?? "").trim() : "";
}

function escapeHiringCopyTokenValue(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function fillHiringCopyTokens(
  html: string,
  vars: { positions?: string; name?: string },
): string {
  const positions = escapeHiringCopyTokenValue(vars.positions ?? "");
  const name = escapeHiringCopyTokenValue(vars.name ?? "");
  const firstName = escapeHiringCopyTokenValue(
    hiringFirstNameFromFullName(vars.name ?? ""),
  );
  return html
    .replace(/\{positions\}/gi, positions)
    .replace(/\{firstname\}/gi, firstName)
    .replace(/\{name\}/gi, name);
}
