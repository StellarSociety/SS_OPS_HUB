export type EmploymentStatus = {
  id: string;
  name: string;
  sort_order: number;
};

export type Nationality = {
  id: string;
  name: string;
  fly_home_ticket_value: number;
};

export type Department = {
  id: string;
  venue_id: string;
  name: string;
  sort_order: number;
};

export type Position = {
  id: string;
  venue_id: string;
  department_id: string;
  name: string;
  sort_order: number;
};

export type Staff = {
  id: string;
  home_venue_id: string;
  emp_no: string;
  department_id: string | null;
  position_id: string | null;
  employment_status_id: string | null;
  nationality_id: string | null;
  first_name: string | null;
  last_name: string | null;
  full_name: string;
  contact_phone: string | null;
  personal_email: string | null;
  work_email: string | null;
  gender: string | null;
  civil_status: string | null;
  dob: string | null;
  passport_no: string | null;
  passport_expiry: string | null;
  eid_no: string | null;
  eid_expiry: string | null;
  iban: string | null;
  swift_code: string | null;
  bank_name: string | null;
  joining_date: string | null;
  termination_date: string | null;
  unpaid_leave_days_total: number | null;
  vacations_entitle: number | null;
  vacations_balance: number | null;
  wage_package: number | null;
  company_accommodation: string | null;
  basic_salary_60: number | null;
  accom_all_25: number | null;
  transp_all_15: number | null;
  fly_home_ticket_per_year: number | null;
  provisional_leave: number | null;
  provisional_eosb: number | null;
  visa_expenses: number | null;
  visa_penalties_paid: number | null;
  ohc_date: string | null;
  pic_date: string | null;
  basic_food_safety_date: string | null;
  fire_safety_date: string | null;
  first_aid_date: string | null;
  insurance_category: string | null;
  medical_insurance_value: number | null;
  medical_insurance_issue_date: string | null;
  medical_insurance_expiry_date: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type StaffWithLookups = Staff & {
  department?: Department | null;
  position?: Position | null;
  employment_status?: EmploymentStatus | null;
  nationality?: Nationality | null;
};

export type ExpiryItem = {
  staffId: string;
  empNo: string;
  fullName: string;
  field: string;
  label: string;
  expiryDate: string;
  daysUntil: number;
};

export const HR_MODULE_KEY = "hr" as const;
export const HR_FEATURES = {
  staff: "staff",
  lookups: "lookups",
  salary: "salary",
} as const;

export const EXPIRY_FIELDS = [
  { field: "passport_expiry", label: "Passport" },
  { field: "eid_expiry", label: "Emirates ID" },
  { field: "medical_insurance_expiry_date", label: "Medical insurance" },
  { field: "ohc_date", label: "OHC training", renewalMonths: 12 },
  { field: "pic_date", label: "PIC training", renewalMonths: 12 },
  { field: "basic_food_safety_date", label: "Food safety", renewalMonths: 12 },
  { field: "fire_safety_date", label: "Fire safety", renewalMonths: 12 },
  { field: "first_aid_date", label: "First aid", renewalMonths: 24 },
] as const;

export const DEFAULT_EXPIRY_LEAD_DAYS = 90;
