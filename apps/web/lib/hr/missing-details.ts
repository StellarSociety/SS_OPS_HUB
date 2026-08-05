/**
 * Profile completeness checks for Staff Directory Insights.
 * Surfaces empty operational fields on ON Board staff.
 */

const ON_BOARD_STATUS_NAME = "ON Board";

export type MissingDetailItem = {
  staffId: string;
  empNo: string;
  fullName: string;
  /** Missing field labels, in checklist order. */
  labels: string[];
};

type MissingDetailCheck = {
  field: string;
  label: string;
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
    isPresent: (m) => hasText(m.department_id),
  },
  {
    field: "position_id",
    label: "Position",
    isPresent: (m) => hasText(m.position_id),
  },
  {
    field: "nationality_id",
    label: "Nationality",
    isPresent: (m) => hasText(m.nationality_id),
  },
  {
    field: "gender",
    label: "Gender",
    isPresent: (m) => hasText(m.gender),
  },
  {
    field: "dob",
    label: "Date of birth",
    isPresent: (m) => hasText(m.dob),
  },
  {
    field: "contact_phone",
    label: "Contact phone",
    isPresent: (m) => hasText(m.contact_phone),
  },
  {
    field: "email",
    label: "Email",
    isPresent: (m) => hasText(m.personal_email) || hasText(m.work_email),
  },
  {
    field: "joining_date",
    label: "Joining date",
    isPresent: (m) => hasText(m.joining_date),
  },
  {
    field: "contract_kind",
    label: "Contract type",
    isPresent: (m) => hasText(m.contract_kind),
  },
  {
    field: "passport_no",
    label: "Passport no.",
    isPresent: (m) => hasText(m.passport_no),
  },
  {
    field: "passport_expiry",
    label: "Passport expiry",
    isPresent: (m) => hasText(m.passport_expiry),
  },
  {
    field: "eid_no",
    label: "EID no.",
    isPresent: (m) => hasText(m.eid_no),
  },
  {
    field: "eid_expiry",
    label: "EID expiry",
    isPresent: (m) => hasText(m.eid_expiry),
  },
  {
    field: "visa_expiry",
    label: "Visa expiry",
    isPresent: (m) => hasText(m.visa_expiry),
  },
  {
    field: "iban",
    label: "IBAN",
    isPresent: (m) => hasText(m.iban),
  },
  {
    field: "wage_package",
    label: "Wage package",
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

/** Missing field labels for one staff member (checklist order). */
export function getMissingDetailLabels(
  member: MissingDetailStaffInput,
): string[] {
  return MISSING_DETAIL_CHECKS.filter((check) => !check.isPresent(member)).map(
    (check) => check.label,
  );
}

/**
 * One row per ON Board staff member with any missing fields, sorted by emp no.
 */
export function listMissingDetailItems(
  staff: MissingDetailStaffInput[],
): MissingDetailItem[] {
  const items: MissingDetailItem[] = [];

  for (const member of staff) {
    if (member.employment_status?.name !== ON_BOARD_STATUS_NAME) continue;

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
