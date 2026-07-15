/** Normalize spreadsheet header typos and variants to canonical keys. */
const HEADER_ALIASES: Record<string, string> = {
  "emp no": "emp_no",
  emp_no: "emp_no",
  "emp#": "emp_no",
  department: "department",
  status: "status",
  stattus: "status",
  "first name": "first_name",
  first_name: "first_name",
  "last name": "last_name",
  last_name: "last_name",
  "full name": "full_name",
  full_name: "full_name",
  "contact phone": "contact_phone",
  contact_phone: "contact_phone",
  phone: "contact_phone",
  "personal email": "personal_email",
  personal_email: "personal_email",
  "work email": "work_email",
  work_email: "work_email",
  gender: "gender",
  "civil status": "civil_status",
  civil_status: "civil_status",
  dob: "dob",
  "date of birth": "dob",
  nationality: "nationality",
  nacionality: "nationality",
  "passport no": "passport_no",
  passport_no: "passport_no",
  "passport expiry": "passport_expiry",
  passport_expiry: "passport_expiry",
  "eid no": "eid_no",
  eid_no: "eid_no",
  "eid expiry": "eid_expiry",
  eid_expiry: "eid_expiry",
  iban: "iban",
  "swift code": "swift_code",
  swift_code: "swift_code",
  "bank name": "bank_name",
  bank_name: "bank_name",
  position: "position",
  "joining date": "joining_date",
  joining_date: "joining_date",
  "contract kind": "contract_kind",
  "contract type": "contract_kind",
  contract_kind: "contract_kind",
  "visa status": "visa_status",
  visa_status: "visa_status",
  "visa expiry": "visa_expiry",
  visa_expiry: "visa_expiry",
  "probation duration": "probation_duration_value",
  probation_duration_value: "probation_duration_value",
  "probation unit": "probation_duration_unit",
  probation_duration_unit: "probation_duration_unit",
  "probation status": "probation_status",
  probation_status: "probation_status",
  "termination date": "termination_date",
  termination_date: "termination_date",
  "unpaid leave days total": "unpaid_leave_days_total",
  unpaid_leave_days_total: "unpaid_leave_days_total",
  "vacations entitle": "vacations_entitle",
  vacations_entitle: "vacations_entitle",
  "vacations balance": "vacations_balance",
  vacations_balance: "vacations_balance",
  "wage package": "wage_package",
  wage_package: "wage_package",
  "company accommodation": "company_accommodation",
  company_accommodation: "company_accommodation",
  "basic salary 60": "basic_salary_60",
  basic_salary_60: "basic_salary_60",
  "accom all 25": "accom_all_25",
  accom_all_25: "accom_all_25",
  "transp all 15": "transp_all_15",
  transp_all_15: "transp_all_15",
  "fly home ticket per year": "fly_home_ticket_per_year",
  fly_home_ticket_per_year: "fly_home_ticket_per_year",
  "provisional leave": "provisional_leave",
  provisional_leave: "provisional_leave",
  "provisional eosb": "provisional_eosb",
  provisional_eosb: "provisional_eosb",
  "visa expenses": "visa_expenses",
  visa_expenses: "visa_expenses",
  "visa penalties paid": "visa_penalties_paid",
  visa_penalties_paid: "visa_penalties_paid",
  "ohc date": "ohc_date",
  ohc_date: "ohc_date",
  "pic date": "pic_date",
  pic_date: "pic_date",
  "basic food safety date": "basic_food_safety_date",
  basic_food_safety_date: "basic_food_safety_date",
  "fire safety date": "fire_safety_date",
  fire_safety_date: "fire_safety_date",
  "first aid date": "first_aid_date",
  first_aid_date: "first_aid_date",
  "insurance category": "insurance_category",
  insurance_category: "insurance_category",
  "medical insurance value": "medical_insurance_value",
  medical_insurance_value: "medical_insurance_value",
  "medical insurance issue date": "medical_insurance_issue_date",
  medical_insurance_issue_date: "medical_insurance_issue_date",
  "medical insurance expiry date": "medical_insurance_expiry_date",
  medical_insurance_expiry_date: "medical_insurance_expiry_date",
};

export type ImportStaffRow = Record<string, string>;

function normalizeHeader(header: string): string {
  const key = header.trim().toLowerCase().replace(/\s+/g, " ");
  return HEADER_ALIASES[key] ?? key.replace(/\s+/g, "_");
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export function parseStaffCsv(csvText: string): ImportStaffRow[] {
  const lines = csvText
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map(normalizeHeader);
  const rows: ImportStaffRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    if (values.every((v) => !v)) continue;
    const row: ImportStaffRow = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx]?.trim() ?? "";
    });
    rows.push(row);
  }

  return rows;
}

export function parseDate(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const dmy = trimmed.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (dmy) {
    const day = dmy[1].padStart(2, "0");
    const month = dmy[2].padStart(2, "0");
    let year = dmy[3];
    if (year.length === 2) year = `20${year}`;
    return `${year}-${month}-${day}`;
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return null;
}

export function parseNumber(value: string | undefined): number | null {
  if (!value) return null;
  const cleaned = value.replace(/[,\s]/g, "").replace(/AED/gi, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isNaN(n) ? null : n;
}
