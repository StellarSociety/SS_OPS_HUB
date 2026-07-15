import type { SheetRow } from "@/lib/sales/excel-utils";
import type { ImportStaffRow } from "./import";
import type {
  CivilStatus,
  Department,
  EmploymentStatus,
  Gender,
  HrSalaryDefaults,
  Nationality,
  Position,
  StaffWithLookups,
} from "./types";

export type EmployeeImportColumn = {
  /** Canonical key understood by the staff import server action. */
  key: string;
  /** Human-readable column header used in the Excel template. */
  label: string;
  type: "text" | "number" | "date";
  /** How to read the export value from a staff record. */
  value: (staff: StaffWithLookups) => string | number | null | undefined;
};

/**
 * Full set of employee fields collected per staff member. Lookups (department,
 * position, status, nationality) are exported/imported by name so the sheet is
 * human-editable; the import resolves them back to IDs.
 */
export const EMPLOYEE_IMPORT_COLUMNS: EmployeeImportColumn[] = [
  { key: "emp_no", label: "Emp no", type: "text", value: (s) => s.emp_no },
  { key: "department", label: "Department", type: "text", value: (s) => s.department?.name },
  { key: "position", label: "Position", type: "text", value: (s) => s.position?.name },
  { key: "status", label: "Status", type: "text", value: (s) => s.employment_status?.name },
  { key: "nationality", label: "Nationality", type: "text", value: (s) => s.nationality?.name },
  { key: "first_name", label: "First name", type: "text", value: (s) => s.first_name },
  { key: "last_name", label: "Last name", type: "text", value: (s) => s.last_name },
  { key: "full_name", label: "Full name", type: "text", value: (s) => s.full_name },
  { key: "contact_phone", label: "Contact phone", type: "text", value: (s) => s.contact_phone },
  { key: "personal_email", label: "Personal email", type: "text", value: (s) => s.personal_email },
  { key: "work_email", label: "Work email", type: "text", value: (s) => s.work_email },
  { key: "gender", label: "Gender", type: "text", value: (s) => s.gender },
  { key: "civil_status", label: "Civil status", type: "text", value: (s) => s.civil_status },
  { key: "dob", label: "Date of birth", type: "date", value: (s) => s.dob },
  { key: "passport_no", label: "Passport no.", type: "text", value: (s) => s.passport_no },
  { key: "passport_expiry", label: "Passport expiry", type: "date", value: (s) => s.passport_expiry },
  { key: "eid_no", label: "EID no.", type: "text", value: (s) => s.eid_no },
  { key: "eid_expiry", label: "EID expiry", type: "date", value: (s) => s.eid_expiry },
  { key: "iban", label: "IBAN", type: "text", value: (s) => s.iban },
  { key: "swift_code", label: "Swift code", type: "text", value: (s) => s.swift_code },
  { key: "bank_name", label: "Bank name", type: "text", value: (s) => s.bank_name },
  { key: "joining_date", label: "Joining date", type: "date", value: (s) => s.joining_date },
  { key: "contract_kind", label: "Contract type", type: "text", value: (s) => s.contract_kind },
  { key: "visa_status", label: "Visa status", type: "text", value: (s) => s.visa_status },
  { key: "visa_expiry", label: "Visa expiry", type: "date", value: (s) => s.visa_expiry },
  {
    key: "probation_duration_value",
    label: "Probation duration",
    type: "number",
    value: (s) => s.probation_duration_value,
  },
  {
    key: "probation_duration_unit",
    label: "Probation unit",
    type: "text",
    value: (s) => s.probation_duration_unit,
  },
  {
    key: "probation_status",
    label: "Probation status",
    type: "text",
    value: (s) => s.probation_status,
  },
  { key: "termination_date", label: "Termination date", type: "date", value: (s) => s.termination_date },
  {
    key: "unpaid_leave_days_total",
    label: "Unpaid leave days total",
    type: "number",
    value: (s) => s.unpaid_leave_days_total,
  },
  { key: "vacations_entitle", label: "Vacations entitle", type: "number", value: (s) => s.vacations_entitle },
  { key: "vacations_balance", label: "Vacations balance", type: "number", value: (s) => s.vacations_balance },
  { key: "wage_package", label: "Wage package", type: "number", value: (s) => s.wage_package },
  {
    key: "company_accommodation",
    label: "Company accommodation",
    type: "text",
    value: (s) => s.company_accommodation,
  },
  { key: "basic_salary_60", label: "Basic salary 60", type: "number", value: (s) => s.basic_salary_60 },
  { key: "accom_all_25", label: "Accom all 25", type: "number", value: (s) => s.accom_all_25 },
  { key: "transp_all_15", label: "Transp all 15", type: "number", value: (s) => s.transp_all_15 },
  {
    key: "fly_home_ticket_per_year",
    label: "Fly home ticket per year",
    type: "number",
    value: (s) => s.fly_home_ticket_per_year,
  },
];

/** Maps normalized sheet headers (lowercased labels/keys) to canonical keys. */
const HEADER_TO_KEY: Record<string, string> = {};
for (const column of EMPLOYEE_IMPORT_COLUMNS) {
  HEADER_TO_KEY[column.label.toLowerCase()] = column.key;
  HEADER_TO_KEY[column.key] = column.key;
  HEADER_TO_KEY[column.key.replace(/_/g, " ")] = column.key;
}

export function employeesTemplateHeaders(): string[] {
  return EMPLOYEE_IMPORT_COLUMNS.map((column) => column.label);
}

export function staffRecordToTemplateRow(
  staff: StaffWithLookups,
): (string | number)[] {
  return EMPLOYEE_IMPORT_COLUMNS.map((column) => {
    const raw = column.value(staff);
    if (raw === null || raw === undefined) return "";
    return raw;
  });
}

/**
 * Convert parsed Excel rows into the canonical row shape used by the staff
 * import server action. Empty rows (no emp no) are dropped by the caller.
 */
export function sheetRowsToStaffImportRows(rows: SheetRow[]): ImportStaffRow[] {
  return rows.map((row) => {
    const mapped: ImportStaffRow = {};
    for (const [header, rawValue] of Object.entries(row)) {
      const key = HEADER_TO_KEY[header.trim().toLowerCase()];
      if (!key) continue;
      const value = rawValue === null || rawValue === undefined ? "" : String(rawValue).trim();
      mapped[key] = value;
    }
    return mapped;
  });
}

export type EmployeesTemplateContext = {
  departments: Department[];
  positions: Position[];
  statuses: EmploymentStatus[];
  nationalities: Nationality[];
  genders: Gender[];
  civilStatuses: CivilStatus[];
  salaryDefaults: HrSalaryDefaults;
};

function formatTicketValue(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString("en-US") : "0";
}

export function employeesTemplateInstructions(
  context: EmployeesTemplateContext,
): string[][] {
  const {
    departments,
    positions,
    statuses,
    nationalities,
    genders,
    civilStatuses,
    salaryDefaults,
  } = context;

  const rows: string[][] = [
    ["Employee Details Import Template"],
    [""],
    ["How to use"],
    ["1. Download this template (blank or with existing employees)."],
    ["2. Fill in or edit rows — one row per employee."],
    ["3. Keep the column headers unchanged."],
    [
      "4. 'Emp no' is required and is the unique key: existing employees are updated, new emp numbers are added.",
    ],
    [
      "5. Department, Position, Status, Nationality, Gender and Civil status must match one of the valid values listed below (exact spelling).",
    ],
    ["6. Dates must be YYYY-MM-DD (e.g. 2026-01-15)."],
    [
      "7. Upload the saved .xlsx file on HR → Settings → Data Management → Employees Details.",
    ],
    ["8. Only the columns present in this sheet are imported; other stored fields are left untouched."],
    [""],
    ["Leave cells blank when not applicable."],
    [""],
    ["Formulas (reference — these values are derived automatically)"],
    [
      `Basic salary ${salaryDefaults.basicPct} = Wage package × ${salaryDefaults.basicPct}%`,
    ],
    [
      `Accom all ${salaryDefaults.accomPct} = Wage package × ${salaryDefaults.accomPct}%`,
    ],
    [
      `Transp all ${salaryDefaults.transpPct} = Wage package × ${salaryDefaults.transpPct}%`,
    ],
    [
      "Salary to pay = Basic salary when the employee is in company accommodation, otherwise the full Wage package.",
    ],
    [
      "Fly home ticket per year = the annual ticket value for the employee's nationality (see Nationalities below).",
    ],
  ];

  rows.push([""], ["Valid values — Departments"]);
  if (departments.length) {
    for (const d of departments) rows.push([d.name]);
  } else {
    rows.push(["(none configured)"]);
  }

  rows.push([""], ["Valid values — Positions (by department)"]);
  if (positions.length) {
    for (const d of departments) {
      const names = positions
        .filter((p) => p.department_id === d.id)
        .map((p) => p.name);
      if (names.length) rows.push([d.name, ...names]);
    }
    const orphaned = positions
      .filter((p) => !departments.some((d) => d.id === p.department_id))
      .map((p) => p.name);
    if (orphaned.length) rows.push(["(unassigned)", ...orphaned]);
  } else {
    rows.push(["(none configured)"]);
  }

  rows.push([""], ["Valid values — Status (employment status)"]);
  if (statuses.length) {
    for (const s of statuses) rows.push([s.name]);
  } else {
    rows.push(["(none configured)"]);
  }

  rows.push([""], ["Valid values — Nationality", "Fly home ticket per year"]);
  if (nationalities.length) {
    for (const n of nationalities) {
      rows.push([n.name, formatTicketValue(n.fly_home_ticket_value)]);
    }
  } else {
    rows.push(["(none configured)"]);
  }

  rows.push([""], ["Valid values — Gender"]);
  if (genders.length) {
    for (const g of genders) rows.push([g.name]);
  } else {
    rows.push(["(none configured)"]);
  }

  rows.push([""], ["Valid values — Civil status"]);
  if (civilStatuses.length) {
    for (const c of civilStatuses) rows.push([c.name]);
  } else {
    rows.push(["(none configured)"]);
  }

  return rows;
}
