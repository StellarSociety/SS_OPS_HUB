/**
 * Full staff-profile completeness: every form field and expected attachment.
 * Separate from Insights `missing-details.ts`, which stays a short operational
 * checklist for the directory widgets.
 */

import type { StaffFormState } from "@/lib/hr/staff-form";
import {
  DEFAULT_HR_WORK_DRIVE_DOC_SUBFOLDERS,
  type HrWorkDriveDocKind,
} from "@/lib/hr/types";

export type ProfileMissingTab =
  | "identity"
  | "contact"
  | "employment"
  | "documents"
  | "employment_docs";

export type ProfileMissingKind = "field" | "attachment";

export type ProfileMissingHit = {
  field: string;
  label: string;
  tab: ProfileMissingTab;
  anchorId: string;
  kind: ProfileMissingKind;
};

export type ProfileDocumentPresence = {
  docKind: string;
  fileSlotId: string | null;
  isMissing: boolean;
};

export type ProfileDocumentSlotPart = {
  id: string;
  label: string;
};

export function staffDocAnchorId(
  docKind: string,
  fileSlotId?: string | null,
): string {
  const slot = String(fileSlotId ?? "").trim();
  if (!slot || slot === "default") return `staff-doc-${docKind}`;
  return `staff-doc-${docKind}-${slot}`;
}

function filled(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

type ProfileFieldCheck = {
  field: string;
  label: string;
  tab: ProfileMissingTab;
  anchorId: string;
  salaryOnly?: boolean;
  include?: (form: StaffFormState) => boolean;
  isPresent: (
    form: StaffFormState,
    ctx: { photoUrl?: string | null },
  ) => boolean;
};

const PROFILE_FIELD_CHECKS: ProfileFieldCheck[] = [
  {
    field: "photo",
    label: "Profile photo",
    tab: "identity",
    anchorId: "staff-profile-photo",
    isPresent: (_form, ctx) => filled(ctx.photoUrl),
  },
  {
    field: "full_name",
    label: "Full name",
    tab: "identity",
    anchorId: "full_name",
    isPresent: (form) => filled(form.full_name),
  },
  {
    field: "first_name",
    label: "First name",
    tab: "identity",
    anchorId: "first_name",
    isPresent: (form) => filled(form.first_name),
  },
  {
    field: "last_name",
    label: "Last name",
    tab: "identity",
    anchorId: "last_name",
    isPresent: (form) => filled(form.last_name),
  },
  {
    field: "gender",
    label: "Gender",
    tab: "identity",
    anchorId: "gender",
    isPresent: (form) => filled(form.gender),
  },
  {
    field: "civil_status",
    label: "Civil status",
    tab: "identity",
    anchorId: "civil_status",
    isPresent: (form) => filled(form.civil_status),
  },
  {
    field: "dob",
    label: "Date of birth",
    tab: "identity",
    anchorId: "dob",
    isPresent: (form) => filled(form.dob),
  },
  {
    field: "nationality_id",
    label: "Nationality",
    tab: "identity",
    anchorId: "nationality_id",
    isPresent: (form) => filled(form.nationality_id),
  },
  {
    field: "contact_phone",
    label: "Contact phone",
    tab: "contact",
    anchorId: "contact_phone",
    isPresent: (form) => filled(form.contact_phone),
  },
  {
    field: "whatsapp",
    label: "WhatsApp",
    tab: "contact",
    anchorId: "whatsapp",
    isPresent: (form) => filled(form.whatsapp),
  },
  {
    field: "personal_email",
    label: "Personal email",
    tab: "contact",
    anchorId: "personal_email",
    isPresent: (form) => filled(form.personal_email),
  },
  {
    field: "work_email",
    label: "Work email",
    tab: "contact",
    anchorId: "work_email",
    isPresent: (form) => filled(form.work_email),
  },
  {
    field: "department_id",
    label: "Department",
    tab: "employment",
    anchorId: "department_id",
    isPresent: (form) => filled(form.department_id),
  },
  {
    field: "position_id",
    label: "Position",
    tab: "employment",
    anchorId: "position_id",
    isPresent: (form) => filled(form.position_id),
  },
  {
    field: "employment_status_id",
    label: "Employment status",
    tab: "employment",
    anchorId: "employment_status_id",
    isPresent: (form) => filled(form.employment_status_id),
  },
  {
    field: "joining_date",
    label: "Joining date",
    tab: "employment",
    anchorId: "joining_date",
    isPresent: (form) => filled(form.joining_date),
  },
  {
    field: "contract_kind",
    label: "Contract type",
    tab: "employment",
    anchorId: "contract_kind",
    isPresent: (form) => filled(form.contract_kind),
  },
  {
    field: "visa_status",
    label: "Visa status",
    tab: "employment",
    anchorId: "visa_status",
    isPresent: (form) => filled(form.visa_status),
  },
  {
    field: "visa_expiry",
    label: "Visa expiry",
    tab: "employment",
    anchorId: "visa_expiry",
    isPresent: (form) => filled(form.visa_expiry),
  },
  {
    field: "wage_package",
    label: "Wage package",
    tab: "employment",
    anchorId: "wage_package",
    salaryOnly: true,
    isPresent: (form) => {
      const wage = Number(form.wage_package.trim());
      return Number.isFinite(wage) && wage > 0;
    },
  },
  {
    field: "termination_type",
    label: "Termination type",
    tab: "employment",
    anchorId: "termination_type",
    include: (form) => filled(form.termination_date),
    isPresent: (form) => filled(form.termination_type),
  },
  {
    field: "passport_no",
    label: "Passport no.",
    tab: "documents",
    anchorId: "passport_no",
    isPresent: (form) => filled(form.passport_no),
  },
  {
    field: "passport_expiry",
    label: "Passport Expiry Date",
    tab: "documents",
    anchorId: "passport_expiry",
    isPresent: (form) => filled(form.passport_expiry),
  },
  {
    field: "eid_no",
    label: "EID no.",
    tab: "documents",
    anchorId: "eid_no",
    isPresent: (form) => filled(form.eid_no),
  },
  {
    field: "eid_issue_date",
    label: "EID issue date",
    tab: "documents",
    anchorId: "eid_issue_date",
    isPresent: (form) => filled(form.eid_issue_date),
  },
  {
    field: "eid_expiry",
    label: "EID expiry",
    tab: "documents",
    anchorId: "eid_expiry",
    isPresent: (form) => filled(form.eid_expiry),
  },
  {
    field: "iban",
    label: "IBAN",
    tab: "documents",
    anchorId: "iban",
    isPresent: (form) => filled(form.iban),
  },
  {
    field: "swift_code",
    label: "Swift code",
    tab: "documents",
    anchorId: "swift_code",
    isPresent: (form) => filled(form.swift_code),
  },
  {
    field: "bank_name",
    label: "Bank name",
    tab: "documents",
    anchorId: "bank_name",
    isPresent: (form) => filled(form.bank_name),
  },
  {
    field: "wps_employee_id",
    label: "WPS employee ID",
    tab: "documents",
    anchorId: "wps_employee_id",
    isPresent: (form) => filled(form.wps_employee_id),
  },
  {
    field: "contract_expiry",
    label: "Contract expiry",
    tab: "employment_docs",
    anchorId: "contract_expiry",
    isPresent: (form) => filled(form.contract_expiry),
  },
  {
    field: "eresidence_expiry",
    label: "eResidence expiry",
    tab: "employment_docs",
    anchorId: "eresidence_expiry",
    isPresent: (form) => filled(form.eresidence_expiry),
  },
  {
    field: "ohc_date",
    label: "OHC date",
    tab: "employment_docs",
    anchorId: "ohc_date",
    isPresent: (form) => filled(form.ohc_date),
  },
  {
    field: "medical_insurance_expiry_date",
    label: "Insurance expiry",
    tab: "employment_docs",
    anchorId: "medical_insurance_expiry_date",
    isPresent: (form) => filled(form.medical_insurance_expiry_date),
  },
  {
    field: "pic_date",
    label: "PIC date",
    tab: "employment_docs",
    anchorId: "pic_date",
    isPresent: (form) => filled(form.pic_date),
  },
  {
    field: "basic_food_safety_date",
    label: "Food safety date",
    tab: "employment_docs",
    anchorId: "basic_food_safety_date",
    isPresent: (form) => filled(form.basic_food_safety_date),
  },
  {
    field: "fire_safety_date",
    label: "Fire safety date",
    tab: "employment_docs",
    anchorId: "fire_safety_date",
    isPresent: (form) => filled(form.fire_safety_date),
  },
  {
    field: "first_aid_date",
    label: "First aid date",
    tab: "employment_docs",
    anchorId: "first_aid_date",
    isPresent: (form) => filled(form.first_aid_date),
  },
];

const ATTACHMENT_TAB: Partial<Record<HrWorkDriveDocKind, ProfileMissingTab>> = {
  passport: "documents",
  emirates_id: "documents",
  bank: "documents",
  offer_letter: "employment_docs",
  contract: "employment_docs",
  addendums: "employment_docs",
  eresidence_card: "employment_docs",
  ohc: "employment_docs",
  medical_insurance: "employment_docs",
  training_certificates: "employment_docs",
  visa_cancelation: "employment_docs",
};

const SKIP_ATTACHMENT_KINDS = new Set<HrWorkDriveDocKind>([
  "profile_photo",
  "others",
  "visa_noc",
]);

function attachmentLabel(
  folderLabel: string,
  slotId: string,
  slotLabel: string,
): string {
  const base = folderLabel.trim() || "Document";
  if (!slotId || slotId === "default" || slotLabel === "File") {
    return `${base} file`;
  }
  return `${base} file (${slotLabel})`;
}

function shouldIncludeAttachmentKind(
  kind: HrWorkDriveDocKind,
  form: StaffFormState,
): boolean {
  if (SKIP_ATTACHMENT_KINDS.has(kind)) return false;
  if (kind === "visa_cancelation") {
    return (
      filled(form.termination_date) ||
      form.visa_status.trim() === "Visa Canceled"
    );
  }
  return Boolean(ATTACHMENT_TAB[kind]);
}

export function listProfileMissingFields(
  form: StaffFormState,
  options?: { canViewSalary?: boolean; photoUrl?: string | null },
): ProfileMissingHit[] {
  const canViewSalary = options?.canViewSalary !== false;
  const photoUrl = options?.photoUrl ?? null;
  return PROFILE_FIELD_CHECKS.filter((check) => {
    if (check.salaryOnly && !canViewSalary) return false;
    if (check.include && !check.include(form)) return false;
    return !check.isPresent(form, { photoUrl });
  }).map((check) => ({
    field: check.field,
    label: check.label,
    tab: check.tab,
    anchorId: check.anchorId,
    kind: "field" as const,
  }));
}

export function listProfileMissingAttachments(
  form: StaffFormState,
  present: ProfileDocumentPresence[],
  venueSlots?: Record<string, ProfileDocumentSlotPart[]>,
): ProfileMissingHit[] {
  const hits: ProfileMissingHit[] = [];

  for (const folder of DEFAULT_HR_WORK_DRIVE_DOC_SUBFOLDERS) {
    const kind = folder.kind;
    if (!shouldIncludeAttachmentKind(kind, form)) continue;
    const tab = ATTACHMENT_TAB[kind];
    if (!tab) continue;

    const parts =
      venueSlots?.[kind]?.filter((part) => part.id.trim()) ??
      folder.fileSlots.map((slot) => ({
        id: slot.id,
        label: slot.label,
      }));
    const slots = parts.length > 0 ? parts : [{ id: "default", label: "File" }];

    for (const slot of slots) {
      if (attachmentIsPresent(kind, slot.id, present)) continue;
      hits.push({
        field: `doc:${kind}:${slot.id}`,
        label: attachmentLabel(folder.folderName, slot.id, slot.label),
        tab,
        anchorId: staffDocAnchorId(kind, slot.id),
        kind: "attachment",
      });
    }
  }

  return hits;
}

function attachmentIsPresent(
  docKind: string,
  fileSlotId: string,
  present: ProfileDocumentPresence[],
): boolean {
  const rows = present.filter(
    (row) => row.docKind === docKind && !row.isMissing,
  );
  if (rows.length === 0) return false;
  const wanted = fileSlotId.trim();
  if (!wanted || wanted === "default") return true;
  return rows.some((row) => String(row.fileSlotId ?? "").trim() === wanted);
}

export function listProfileMissingItems(
  form: StaffFormState,
  options?: {
    canViewSalary?: boolean;
    photoUrl?: string | null;
    present?: ProfileDocumentPresence[];
    venueSlots?: Record<string, ProfileDocumentSlotPart[]>;
  },
): ProfileMissingHit[] {
  return [
    ...listProfileMissingFields(form, options),
    ...listProfileMissingAttachments(
      form,
      options?.present ?? [],
      options?.venueSlots,
    ),
  ];
}
