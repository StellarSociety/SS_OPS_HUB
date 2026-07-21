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

/** Venue public holiday date used on schedules. */
export type PublicHoliday = {
  id: string;
  holidayDate: string;
  name: string;
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
  schedules: "schedules",
  lookups: "lookups",
  salary: "salary",
  scheduleApproval: "schedule_approval",
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
  scheduleApproval: "schedule_approval",
  leavePolicy: "leave_policy",
} as const;

/** Paid status for leave type configuration. */
export type HrLeavePaidStatus =
  | "paid"
  | "unpaid"
  | "half_pay"
  | "variable"
  | "paid_plus_compensation";

export type HrLeaveTypeConfig = {
  code: string;
  name: string;
  displayLabel: string;
  paidStatus: HrLeavePaidStatus;
  balanceRequired: boolean;
  active: boolean;
};

export type HrLeavePartialMonthMethod = "full_months" | "pro_rata";

export type HrLeaveAnnualPolicy = {
  /** No statutory AL through this many completed months. */
  zeroEntitlementMonths: number;
  /** Days per completed month after zero period and before full year. */
  daysPerMonthBeforeYear: number;
  /** Full annual entitlement after 1 year of service. */
  annualDaysAfterYear: number;
  /** Monthly accrual after 1 year (typically annualDaysAfterYear / 12). */
  monthlyAccrualAfterYear: number;
  /**
   * How partial months count toward AL before 1 year of service.
   * - full_months: only completed months (e.g. 9 × 2 = 18)
   * - pro_rata: include the current partial month as a fraction
   * Employees with a termination date always use pro_rata (capped at that date).
   */
  partialMonthMethod: HrLeavePartialMonthMethod;
  /** Entitlement counted in calendar days (not only working days). */
  calendarDayCalculation: boolean;
  /** Max days that may carry into the next calendar year (0 = none). */
  carryForwardMaxDays: number;
  /** Allow available balance to go negative when HR override permits. */
  allowNegativeBalance: boolean;
  /** HR may grant AL before statutory entitlement. */
  allowHrOverride: boolean;
};

export type HrLeaveSickPolicy = {
  /** During probation, only unpaid sick leave applies. */
  unpaidDuringProbation: boolean;
  fullPayDays: number;
  halfPayDays: number;
  unpaidDays: number;
  /** fullPay + halfPay + unpaid. */
  yearlyMaximumDays: number;
  requireMedicalCertificate: boolean;
};

export type HrLeaveOtherPolicy = {
  parentalWorkingDays: number;
  bereavementSpouseDays: number;
  bereavementCloseFamilyDays: number;
  studyLeaveWorkingDays: number;
  studyLeaveMinServiceYears: number;
  hajjLeaveDays: number;
  hajjOncePerEmployment: boolean;
  maternityFullPayDays: number;
  maternityHalfPayDays: number;
  maternityUnpaidExtraDays: number;
};

export type HrLeaveApprovalsPolicy = {
  employeeSubmits: boolean;
  managerReviews: boolean;
  hrReviewsWhenRequired: boolean;
  allowHrOverride: boolean;
  allowRosterCreatedLeave: boolean;
  allowBackdatedRequests: boolean;
  requireSupportingDocument: boolean;
  notifyOnSubmit: boolean;
  notifyOnDecision: boolean;
};

export type HrLeavePolicySettings = {
  /** Leave year is always calendar year (Jan–Dec); stored for clarity. */
  yearModel: "calendar";
  leaveTypes: HrLeaveTypeConfig[];
  annual: HrLeaveAnnualPolicy;
  sick: HrLeaveSickPolicy;
  other: HrLeaveOtherPolicy;
  approvals: HrLeaveApprovalsPolicy;
};

export const DEFAULT_HR_LEAVE_TYPES: HrLeaveTypeConfig[] = [
  {
    code: "AL",
    name: "Annual Leave",
    displayLabel: "AL",
    paidStatus: "paid",
    balanceRequired: true,
    active: true,
  },
  {
    code: "PH",
    name: "Public Holiday Taken",
    displayLabel: "PH",
    paidStatus: "paid",
    balanceRequired: false,
    active: true,
  },
  {
    code: "PH-W",
    name: "Public Holiday Worked (auto)",
    displayLabel: "PH-W",
    paidStatus: "paid_plus_compensation",
    balanceRequired: false,
    active: true,
  },
  {
    code: "PH-REPL",
    name: "Public Holiday",
    displayLabel: "PH-REPL",
    paidStatus: "paid",
    balanceRequired: true,
    active: true,
  },
  {
    code: "SL-FP",
    name: "Sick Leave — Full Pay",
    displayLabel: "SL-FP",
    paidStatus: "paid",
    balanceRequired: true,
    active: true,
  },
  {
    code: "SL-HP",
    name: "Sick Leave — Half Pay",
    displayLabel: "SL-HP",
    paidStatus: "half_pay",
    balanceRequired: true,
    active: true,
  },
  {
    code: "SL-UP",
    name: "Sick Leave — Unpaid",
    displayLabel: "SL-UP",
    paidStatus: "unpaid",
    balanceRequired: true,
    active: true,
  },
  {
    code: "UPL",
    name: "Unpaid Leave",
    displayLabel: "UPL",
    paidStatus: "unpaid",
    balanceRequired: false,
    active: true,
  },
  {
    code: "ABS",
    name: "Unauthorised Absence",
    displayLabel: "ABS",
    paidStatus: "unpaid",
    balanceRequired: false,
    active: true,
  },
  {
    code: "ML-FP",
    name: "Maternity Leave — Full Pay",
    displayLabel: "ML-FP",
    paidStatus: "paid",
    balanceRequired: true,
    active: true,
  },
  {
    code: "ML-HP",
    name: "Maternity Leave — Half Pay",
    displayLabel: "ML-HP",
    paidStatus: "half_pay",
    balanceRequired: true,
    active: true,
  },
  {
    code: "ML-UP",
    name: "Maternity Leave — Unpaid",
    displayLabel: "ML-UP",
    paidStatus: "unpaid",
    balanceRequired: true,
    active: true,
  },
  {
    code: "PL",
    name: "Parental Leave",
    displayLabel: "PL",
    paidStatus: "paid",
    balanceRequired: true,
    active: true,
  },
  {
    code: "BL",
    name: "Bereavement Leave",
    displayLabel: "BL",
    paidStatus: "paid",
    balanceRequired: true,
    active: true,
  },
  {
    code: "STL",
    name: "Study Leave",
    displayLabel: "STL",
    paidStatus: "paid",
    balanceRequired: true,
    active: true,
  },
  {
    code: "HL",
    name: "Hajj Leave",
    displayLabel: "HL",
    paidStatus: "unpaid",
    balanceRequired: true,
    active: true,
  },
];

export const DEFAULT_HR_LEAVE_POLICY_SETTINGS: HrLeavePolicySettings = {
  yearModel: "calendar",
  leaveTypes: DEFAULT_HR_LEAVE_TYPES,
  annual: {
    zeroEntitlementMonths: 6,
    daysPerMonthBeforeYear: 2,
    annualDaysAfterYear: 30,
    monthlyAccrualAfterYear: 2.5,
    partialMonthMethod: "full_months",
    calendarDayCalculation: true,
    carryForwardMaxDays: 30,
    allowNegativeBalance: false,
    allowHrOverride: true,
  },
  sick: {
    unpaidDuringProbation: true,
    fullPayDays: 15,
    halfPayDays: 30,
    unpaidDays: 45,
    yearlyMaximumDays: 90,
    requireMedicalCertificate: true,
  },
  other: {
    parentalWorkingDays: 5,
    bereavementSpouseDays: 5,
    bereavementCloseFamilyDays: 3,
    studyLeaveWorkingDays: 10,
    studyLeaveMinServiceYears: 2,
    hajjLeaveDays: 30,
    hajjOncePerEmployment: true,
    maternityFullPayDays: 45,
    maternityHalfPayDays: 15,
    maternityUnpaidExtraDays: 45,
  },
  approvals: {
    employeeSubmits: true,
    managerReviews: true,
    hrReviewsWhenRequired: true,
    allowHrOverride: true,
    allowRosterCreatedLeave: true,
    allowBackdatedRequests: false,
    requireSupportingDocument: false,
    notifyOnSubmit: true,
    notifyOnDecision: true,
  },
};

/** Persisted leave balance row (hr_leave_balances). */
export type HrLeaveBalance = {
  id: string;
  venue_id: string;
  staff_id: string;
  leave_year: number;
  leave_type_code: string;
  entitled: number;
  accrued: number;
  used: number;
  scheduled: number;
  pending: number;
  carried_forward: number;
  expired: number;
  adjusted: number;
  created_at: string;
  updated_at: string;
};

export type HrLeaveBalanceAdjustment = {
  id: string;
  venue_id: string;
  balance_id: string;
  field: string;
  previous_value: number;
  new_value: number;
  reason: string;
  author_id: string | null;
  created_at: string;
};

export type HrScheduleApprovalSettings = {
  /** Hub user ids allowed to be selected as schedule approvers. */
  approverUserIds: string[];
};

export const DEFAULT_HR_SCHEDULE_APPROVAL_SETTINGS: HrScheduleApprovalSettings =
  {
    approverUserIds: [],
  };

export type ScheduleApprovalStatus = "pending" | "approved" | "cancelled";

export type ScheduleApprovalRequest = {
  id: string;
  venue_id: string;
  week_start: string;
  status: ScheduleApprovalStatus;
  requested_by: string;
  requested_at: string;
  approver_user_ids: string[];
  reviewed_by: string | null;
  reviewed_at: string | null;
  note: string | null;
};

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
  /**
   * Grace (minutes) between scheduled shift times and clock in/out.
   * SHIFT days within this window do not need Validation approval.
   */
  scheduleVarianceMinutes: number;
};

export const DEFAULT_HR_ATTENDANCE_IMPORT_RULES: HrAttendanceImportRules = {
  overnightCutoffTime: "05:00",
  maxShiftHours: 16,
  timezone: "Asia/Dubai",
  scheduleVarianceMinutes: 40,
};
