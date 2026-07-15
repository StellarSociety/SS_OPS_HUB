export type EmploymentStatus = {
  id: string;
  name: string;
  sort_order: number;
};

export type WorkingStatus = {
  id: string;
  name: string;
  sort_order: number;
};

export type Nationality = {
  id: string;
  name: string;
  fly_home_ticket_value: number;
  sort_order: number;
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

export type CivilStatus = {
  id: string;
  name: string;
  sort_order: number;
};

export type Gender = {
  id: string;
  name: string;
  sort_order: number;
};

export type InsuranceCategory = {
  id: string;
  name: string;
  default_medical_value: number;
  sort_order: number;
};

export type CertificationType = {
  id: string;
  name: string;
  renewal_months: number;
  lead_days: number;
  sort_order: number;
};

export type Staff = {
  id: string;
  home_venue_id: string;
  emp_no: string;
  department_id: string | null;
  position_id: string | null;
  employment_status_id: string | null;
  working_status_id: string | null;
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
  contract_kind: string | null;
  visa_status: string | null;
  visa_expiry: string | null;
  probation_duration_value: number | null;
  probation_duration_unit: string | null;
  probation_status: string | null;
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
  photo_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type StaffWithLookups = Staff & {
  department?: Department | null;
  position?: Position | null;
  employment_status?: EmploymentStatus | null;
  working_status?: WorkingStatus | null;
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
  { field: "visa_expiry", label: "Visa" },
  { field: "medical_insurance_expiry_date", label: "Medical insurance" },
  { field: "ohc_date", label: "OHC training", renewalMonths: 12 },
  { field: "pic_date", label: "PIC training", renewalMonths: 12 },
  { field: "basic_food_safety_date", label: "Food safety", renewalMonths: 12 },
  { field: "fire_safety_date", label: "Fire safety", renewalMonths: 12 },
  { field: "first_aid_date", label: "First aid", renewalMonths: 24 },
] as const;

/** Display window for HR expiry widgets (notifications fire at 30/14/7 days). */
export const DEFAULT_EXPIRY_LEAD_DAYS = 90;

// ---------------------------------------------------------------------------
// Venue-scoped HR settings (stored in public.hr_venue_settings as JSON)
// ---------------------------------------------------------------------------

export const HR_SETTINGS_KEYS = {
  expiry: "expiry",
  salaryDefaults: "salary_defaults",
  notifications: "notifications",
  attendanceImportRules: "attendance_import_rules",
} as const;

export type HrExpirySettings = {
  /** How far ahead expiring items are surfaced in the HR dashboard widgets. */
  displayWindowDays: number;
  /** Lead days at which reminder notifications fire (descending). */
  reminderLeadDays: number[];
};

export type HrSalaryDefaults = {
  basicPct: number;
  accomPct: number;
  transpPct: number;
  /** Annual leave entitlement in days used when creating staff. */
  annualLeaveDays: number;
  /** End-of-service benefit accrual (days of basic pay per year of service). */
  eosbDaysPerYear: number;
};

export type HrNotificationSettings = {
  /** Master switch for HR expiry reminder emails. */
  expiryEmailsEnabled: boolean;
  /** Notify on new staff added. */
  newStaffEnabled: boolean;
  /** Notify on staff termination. */
  terminationEnabled: boolean;
  /** Roles that receive HR notifications. */
  recipientRoles: string[];
};

export const DEFAULT_HR_EXPIRY_SETTINGS: HrExpirySettings = {
  displayWindowDays: DEFAULT_EXPIRY_LEAD_DAYS,
  reminderLeadDays: [30, 14, 7],
};

export const DEFAULT_HR_SALARY_DEFAULTS: HrSalaryDefaults = {
  basicPct: 60,
  accomPct: 25,
  transpPct: 15,
  annualLeaveDays: 30,
  eosbDaysPerYear: 21,
};

export const DEFAULT_HR_NOTIFICATION_SETTINGS: HrNotificationSettings = {
  expiryEmailsEnabled: true,
  newStaffEnabled: true,
  terminationEnabled: true,
  recipientRoles: ["hr_manager"],
};

/**
 * Rules for pairing fingerprint punches into work-day clock in/out.
 * Stored in hr_venue_settings under key attendance_import_rules.
 */
export type HrAttendanceImportRules = {
  /**
   * Local time (HH:mm). Punches strictly before this on calendar day D are
   * attributed to work date D−1 (typical overnight clock-outs, e.g. 01:00 → previous day).
   */
  overnightCutoffTime: string;
  /** Soft cap when computing hours; punches beyond this gap are still stored but flagged. */
  maxShiftHours: number;
  /** IANA timezone used when interpreting device wall-clock as timestamptz. */
  timezone: string;
};

export const DEFAULT_HR_ATTENDANCE_IMPORT_RULES: HrAttendanceImportRules = {
  overnightCutoffTime: "05:00",
  maxShiftHours: 16,
  timezone: "Asia/Dubai",
};
