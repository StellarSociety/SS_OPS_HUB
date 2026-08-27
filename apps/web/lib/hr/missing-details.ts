/**
 * Profile completeness checks for Staff Directory Insights.
 * Surfaces empty operational fields on ON Board or OUT staff.
 */

import {
  EMPLOYMENT_STATUS_NAMES,
  normalizeEmploymentStatusName,
} from "@/lib/hr/employment-status";

export type MissingDetailItem = {
  staffId: string;
  empNo: string;
  fullName: string;
  /** Missing field labels, in checklist order. */
  labels: string[];
};

export type MissingDetailTab =
  | "identity"
  | "contact"
  | "employment"
  | "documents";

export type MissingDetailHit = {
  field: string;
  label: string;
  tab: MissingDetailTab;
  /** Form control id to scroll to after opening the tab. */
  anchorId: string;
};

type MissingDetailCheck = {
  field: string;
  label: string;
  tab: MissingDetailTab;
  /** Defaults to `field` when omitted. */
  anchorId?: string;
  isPresent: (member: {
    department_id: string | null;
    position_id: string | null;
    nationality_id: string | null;
    gender: string | null;
    dob: string | null;
    contact_phone: string | null;
    personal_email: string | null;
    work_email: string | null;
    joining_date: string | null;
    contract_kind: string | null;
    passport_no: string | null;
    passport_expiry: string | null;
    eid_no: string | null;
    eid_expiry: string | null;
    visa_expiry: string | null;
    iban: string | null;
    wage_package: number | null;
  }) => boolean;
};

function hasText(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

export const MISSING_DETAIL_CHECKS: MissingDetailCheck[] = [
  {
    field: "department_id",
    label: "Department",
    tab: "employment",
    isPresent: (m) => hasText(m.department_id),
  },
  {
    field: "position_id",
    label: "Position",
    tab: "employment",
    isPresent: (m) => hasText(m.position_id),
  },
  {
    field: "nationality_id",
    label: "Nationality",
    tab: "identity",
    isPresent: (m) => hasText(m.nationality_id),
  },
  {
    field: "gender",
    label: "Gender",
    tab: "identity",
    isPresent: (m) => hasText(m.gender),
  },
  {
    field: "dob",
    label: "Date of birth",
    tab: "identity",
    isPresent: (m) => hasText(m.dob),
  },
  {
    field: "contact_phone",
    label: "Contact phone",
    tab: "contact",
    isPresent: (m) => hasText(m.contact_phone),
  },
  {
    field: "email",
    label: "Email",
    tab: "contact",
    anchorId: "personal_email",
    isPresent: (m) => hasText(m.personal_email) || hasText(m.work_email),
  },
  {
    field: "joining_date",
    label: "Joining date",
    tab: "employment",
    isPresent: (m) => hasText(m.joining_date),
  },
  {
    field: "contract_kind",
    label: "Contract type",
    tab: "employment",
    isPresent: (m) => hasText(m.contract_kind),
  },
  {
    field: "passport_no",
    label: "Passport no.",
    tab: "documents",
    isPresent: (m) => hasText(m.passport_no),
  },
  {
    field: "passport_expiry",
    label: "Passport Expiry Date",
    tab: "documents",
    isPresent: (m) => hasText(m.passport_expiry),
  },
  {
    field: "eid_no",
    label: "EID number",
    tab: "documents",
    isPresent: (m) => hasText(m.eid_no),
  },
  {
    field: "eid_expiry",
    label: "EID expiry",
    tab: "documents",
    isPresent: (m) => hasText(m.eid_expiry),
  },
  {
    field: "visa_expiry",
    label: "Visa expiry",
    tab: "employment",
    isPresent: (m) => hasText(m.visa_expiry),
  },
  {
    field: "iban",
    label: "IBAN",
    tab: "documents",
    isPresent: (m) => hasText(m.iban),
  },
  {
    field: "wage_package",
    label: "Wage package",
    tab: "employment",
    isPresent: (m) => m.wage_package != null && m.wage_package > 0,
  },
];

export type MissingDetailStaffInput = {
  id: string;
  emp_no: string;
  full_name: string;
  department_id: string | null;
  position_id: string | null;
  nationality_id: string | null;
  gender: string | null;
  dob: string | null;
  contact_phone: string | null;
  personal_email: string | null;
  work_email: string | null;
  joining_date: string | null;
  contract_kind: string | null;
  passport_no: string | null;
  passport_expiry: string | null;
  eid_no: string | null;
  eid_expiry: string | null;
  visa_expiry: string | null;
  iban: string | null;
  wage_package: number | null;
  employment_status?: { name: string } | null;
};

type StaffFormLike = {
  emp_no: string;
  full_name: string;
  department_id: string;
  position_id: string;
  nationality_id: string;
  gender: string;
  dob: string;
  contact_phone: string;
  personal_email: string;
  work_email: string;
  joining_date: string;
  contract_kind: string;
  passport_no: string;
  passport_expiry: string;
  eid_no: string;
  eid_expiry: string;
  visa_expiry: string;
  iban: string;
  wage_package: string;
};

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** Map live staff-form state onto the missing-details checklist input. */
export function missingDetailInputFromForm(
  staffId: string,
  form: StaffFormLike,
): MissingDetailStaffInput {
  const wageRaw = form.wage_package.trim();
  const wage = wageRaw === "" ? null : Number(wageRaw);
  return {
    id: staffId,
    emp_no: form.emp_no,
    full_name: form.full_name,
    department_id: emptyToNull(form.department_id),
    position_id: emptyToNull(form.position_id),
    nationality_id: emptyToNull(form.nationality_id),
    gender: emptyToNull(form.gender),
    dob: emptyToNull(form.dob),
    contact_phone: emptyToNull(form.contact_phone),
    personal_email: emptyToNull(form.personal_email),
    work_email: emptyToNull(form.work_email),
    joining_date: emptyToNull(form.joining_date),
    contract_kind: emptyToNull(form.contract_kind),
    passport_no: emptyToNull(form.passport_no),
    passport_expiry: emptyToNull(form.passport_expiry),
    eid_no: emptyToNull(form.eid_no),
    eid_expiry: emptyToNull(form.eid_expiry),
    visa_expiry: emptyToNull(form.visa_expiry),
    iban: emptyToNull(form.iban),
    wage_package: wage != null && Number.isFinite(wage) ? wage : null,
  };
}

export function listMissingDetailsForMember(
  member: MissingDetailStaffInput,
  options?: { excludeFields?: readonly string[] },
): MissingDetailHit[] {
  const exclude = options?.excludeFields?.length
    ? new Set(options.excludeFields)
    : null;
  return MISSING_DETAIL_CHECKS.filter((check) => {
    if (exclude?.has(check.field)) return false;
    return !check.isPresent(member);
  }).map((check) => ({
    field: check.field,
    label: check.label,
    tab: check.tab,
    anchorId: check.anchorId ?? check.field,
  }));
}

/** Missing field labels for one staff member (checklist order). */
export function getMissingDetailLabels(
  member: MissingDetailStaffInput,
): string[] {
  return listMissingDetailsForMember(member).map((hit) => hit.label);
}

/**
 * One row per staff member in the given employment status with any missing
 * fields, sorted by emp no. Defaults to ON Board.
 */
export function listMissingDetailItems(
  staff: MissingDetailStaffInput[],
  statusName: string = EMPLOYMENT_STATUS_NAMES.onBoard,
): MissingDetailItem[] {
  const wanted = normalizeEmploymentStatusName(statusName);
  const items: MissingDetailItem[] = [];

  for (const member of staff) {
    if (
      normalizeEmploymentStatusName(member.employment_status?.name) !== wanted
    ) {
      continue;
    }

    const labels = getMissingDetailLabels(member);
    if (labels.length === 0) continue;

    items.push({
      staffId: member.id,
      empNo: member.emp_no,
      fullName: member.full_name,
      labels,
    });
  }

  return items.sort(
    (a, b) =>
      a.empNo.localeCompare(b.empNo, undefined, { numeric: true }) ||
      a.fullName.localeCompare(b.fullName),
  );
}
