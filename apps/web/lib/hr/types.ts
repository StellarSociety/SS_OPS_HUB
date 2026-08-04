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

export type AssetType = {
  id: string;
  name: string;
  sort_order: number;
};

export type AssetStatus = "available" | "assigned" | "lost" | "retired";

export type AssetRow = {
  id: string;
  asset_type_id: string;
  name: string;
  serial_no: string;
  description: string;
  asset_value: number;
  status: AssetStatus;
  notes: string;
  created_at: string;
  updated_at: string;
  asset_type?: AssetType | null;
  assigned_staff_id?: string | null;
  assigned_staff_name?: string | null;
  assigned_staff_emp_no?: string | null;
  assigned_at?: string | null;
  assignment_id?: string | null;
};

export const ASSET_STATUS_LABELS: Record<AssetStatus, string> = {
  available: "Available",
  assigned: "Assigned",
  lost: "Lost",
  retired: "Retired",
};

/** Asset linked to a staff member via an assignment row. */
export type StaffAssignedAssetRow = {
  assignment_id: string;
  assigned_at: string;
  returned_at: string | null;
  assignment_notes: string;
  id: string;
  asset_type_id: string;
  name: string;
  serial_no: string;
  description: string;
  asset_value: number;
  status: AssetStatus;
  notes: string;
  asset_type?: AssetType | null;
};

export type UniformProductStatus = "active" | "old";

export const UNIFORM_PRODUCT_STATUS_LABELS: Record<UniformProductStatus, string> = {
  active: "Active Uniform",
  old: "Old Uniform",
};

export type UniformSupplierRow = {
  id: string;
  name: string;
  orders_email: string;
  contact_person: string;
  contact_phone: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

export type UniformPieceEntitlement = {
  id: string;
  piece_id: string;
  department_id: string;
  position_id: string | null;
  department?: Department | null;
  position?: Position | null;
};

export type UniformStockReceiptRow = {
  id: string;
  piece_id: string;
  received_at: string;
  quantity: number;
  notes: string;
  created_at: string;
  updated_at: string;
};

export type UniformPieceRow = {
  id: string;
  name: string;
  details: string;
  supplier_id: string | null;
  supplier: string;
  supplier_orders_email: string;
  contact_person: string;
  contact_phone: string;
  image_url: string;
  workdrive_file_id: string;
  product_status: UniformProductStatus;
  unit_value: number;
  created_at: string;
  updated_at: string;
  entitlements: UniformPieceEntitlement[];
  stock_receipts: UniformStockReceiptRow[];
  stock_received: number;
  stock_assigned: number;
  stock_balance: number;
  supplier_record?: UniformSupplierRow | null;
};

export type UniformStaffItemRow = {
  id: string;
  staff_id: string;
  piece_id: string;
  quantity: number;
  provided_at: string;
  notes: string;
  created_at: string;
  updated_at: string;
  piece?: Pick<UniformPieceRow, "id" | "name" | "unit_value"> | null;
};

export type UniformStaffSummaryRow = {
  staff: StaffWithLookups;
  items: UniformStaffItemRow[];
  total_value: number;
  /** Sum of pending payroll deductions for uniform replacements. */
  pending_deduction_total?: number;
  /** Replacement queries recorded for this employee. */
  replacements?: UniformReplacementRow[];
  /** Hidden from the default Uniform Employees list. */
  archived?: boolean;
  archived_at?: string | null;
};

export type UniformReplacementRow = {
  id: string;
  venue_id: string;
  staff_id: string;
  piece_id: string;
  staff_item_id: string | null;
  quantity: number;
  unit_value: number;
  charged_to_employee: boolean;
  deduction_amount: number;
  notes: string;
  pending_deduction_id: string | null;
  email_sent_at: string | null;
  created_at: string;
  piece_name?: string | null;
  /** Linked pending payroll deduction status, when any. */
  pending_deduction_status?: "pending" | "applied" | "cancelled" | null;
};

/** How employment ended — set on staff profile when termination_date is filled. */
export type StaffTerminationType =
  | "resignation"
  | "termination_with_notice"
  | "termination";

export const STAFF_TERMINATION_TYPE_OPTIONS: {
  value: StaffTerminationType;
  label: string;
}[] = [
  { value: "resignation", label: "Resignation" },
  { value: "termination_with_notice", label: "Termination with notice" },
  { value: "termination", label: "Immediate termination" },
];

export function isStaffTerminationType(
  value: string | null | undefined,
): value is StaffTerminationType {
  return (
    value === "resignation" ||
    value === "termination_with_notice" ||
    value === "termination"
  );
}

/** Collapse directory types into benefit entitlement buckets. */
export function employmentEndedAsFromTerminationType(
  type: string | null | undefined,
): "resignation" | "termination" | null {
  if (type === "resignation") return "resignation";
  if (type === "termination" || type === "termination_with_notice") {
    return "termination";
  }
  return null;
}

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
  whatsapp: string | null;
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
  wps_employee_id: string | null;
  joining_date: string | null;
  termination_date: string | null;
  termination_type: StaffTerminationType | null;
  contract_kind: string | null;
  contract_expiry: string | null;
  eresidence_expiry: string | null;
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
  assets: "assets",
  schedules: "schedules",
  lookups: "lookups",
  salary: "salary",
  scheduleApproval: "schedule_approval",
  payroll: "payroll",
  payslips: "payslips",
  benefits: "benefits",
} as const;

export const EXPIRY_FIELDS = [
  { field: "passport_expiry", label: "Passport" },
  { field: "eid_expiry", label: "Emirates ID" },
  { field: "visa_expiry", label: "Visa" },
  { field: "contract_expiry", label: "Labour contract" },
  { field: "eresidence_expiry", label: "eResidence card" },
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
  payroll: "payroll",
  payrollApprovals: "payroll_approvals",
  payrollAdjustmentCodes: "payroll_adjustment_codes",
  benefitsGratuity: "benefits_gratuity",
  benefitsServiceCharge: "benefits_service_charge",
  emailTransport: "email_transport",
  emailChrome: "email_chrome",
  payslipEmail: "payslip_email",
  payslipLetterhead: "payslip_letterhead",
  boardingEmail: "boarding_email",
  workAnniversaryEmail: "work_anniversary_email",
  /** Dedupe map of auto/manual anniversary emails already sent. */
  workAnniversaryEmailSent: "work_anniversary_email_sent",
  updatedDocsRequestEmail: "updated_docs_request_email",
  /** Uniform on-hand confirmation + T&Cs email. */
  uniformTermsEmail: "uniform_terms_email",
  /** Uniform replacement salary-deduction notice email. */
  uniformReplacementEmail: "uniform_replacement_email",
  /** Zoho WorkDrive connection + folder/naming rules for staff documents. */
  workDrive: "work_drive",
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
   * How partial months count toward AL before 1 year of adjusted service
   * (calendar days minus approved unpaid leave, measured in 30-day months).
   * - full_months: floor(adjustedDays / 30) * daysPerMonthBeforeYear
   * - pro_rata: adjustedDays / 30 * daysPerMonthBeforeYear (roundDays)
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

export type PayrollApprovalStep = "hr_review" | "final_approval";

export type PayrollEmailTemplate = {
  id: string;
  name: string;
  subject: string;
  message: string;
};

export type HrPayrollApprovalsSettings = {
  hrReviewApproverUserIds: string[];
  finalApprovalApproverUserIds: string[];
  reopenUserIds: string[];
  email: {
    fromEmail: string;
    toEmails: string[];
    /** Named message templates (subject + body). */
    templates: PayrollEmailTemplate[];
    /** Template used when sending; must match a templates[].id. */
    defaultTemplateId: string;
    attachPayrollExport: boolean;
    attachGlExport: boolean;
    attachOther: boolean;
    /** When true, send the payroll package email right after Final Approval. */
    autoSendOnFinalApproval: boolean;
  };
};

/** Config-driven mailbox transport (SMTP + optional IMAP Sent append). */
export type EmailTransportProvider =
  | "zoho"
  | "gmail"
  | "outlook"
  | "custom"
  | "resend";

export type HrEmailTransportSettings = {
  provider: EmailTransportProvider;
  smtp: {
    host: string;
    port: number;
    /** true = SSL (465), false = STARTTLS (587). */
    secure: boolean;
    username: string;
    fromName: string;
    fromEmail: string;
    replyTo: string;
  };
  imap: {
    enabled: boolean;
    host: string;
    port: number;
    sentFolder: string;
  };
  /**
   * AES-256-GCM ciphertext of the app password. Server-only — never return
   * this field to the browser.
   */
  passwordEncrypted?: string | null;
  lastVerifiedAt?: string | null;
  lastError?: string | null;
};

/** Safe shape for server → client (no secret). */
export type HrEmailTransportPublicSettings = Omit<
  HrEmailTransportSettings,
  "passwordEncrypted"
> & {
  hasPassword: boolean;
};

/** One mailbox connection stored under email_transport. */
export type HrEmailConnection = HrEmailTransportSettings & {
  id: string;
  label: string;
};

export type HrEmailConnectionPublic = HrEmailTransportPublicSettings & {
  id: string;
  label: string;
  isDefault: boolean;
};

/** Multi-connection store persisted in hr_venue_settings.email_transport. */
export type HrEmailTransportStore = {
  connections: HrEmailConnection[];
  defaultConnectionId: string | null;
};

export const EMPTY_HR_EMAIL_TRANSPORT_SETTINGS: HrEmailTransportSettings = {
  provider: "zoho",
  smtp: {
    host: "smtppro.zoho.com",
    port: 465,
    secure: true,
    username: "",
    fromName: "",
    fromEmail: "",
    replyTo: "",
  },
  imap: {
    enabled: true,
    host: "imappro.zoho.com",
    port: 993,
    sentFolder: "Sent",
  },
  passwordEncrypted: null,
  lastVerifiedAt: null,
  lastError: null,
};

export const EMAIL_TRANSPORT_PRESETS: Record<
  EmailTransportProvider,
  {
    label: string;
    smtp: { host: string; port: number; secure: boolean };
    imap: { host: string; port: number };
  }
> = {
  zoho: {
    // Workplace Professional (paid), US region — free accounts use smtp/imap.zoho.com
    label: "Zoho",
    smtp: { host: "smtppro.zoho.com", port: 465, secure: true },
    imap: { host: "imappro.zoho.com", port: 993 },
  },
  gmail: {
    label: "Gmail",
    smtp: { host: "smtp.gmail.com", port: 465, secure: true },
    imap: { host: "imap.gmail.com", port: 993 },
  },
  outlook: {
    label: "Outlook",
    smtp: { host: "smtp.office365.com", port: 587, secure: false },
    imap: { host: "outlook.office365.com", port: 993 },
  },
  custom: {
    label: "Custom SMTP",
    smtp: { host: "", port: 465, secure: true },
    imap: { host: "", port: 993 },
  },
  resend: {
    label: "Resend",
    smtp: { host: "", port: 465, secure: true },
    imap: { host: "", port: 993 },
  },
};

export const DEFAULT_HR_EMAIL_TRANSPORT_SETTINGS: HrEmailTransportSettings = {
  provider: "zoho",
  smtp: {
    host: "smtppro.zoho.com",
    port: 465,
    secure: true,
    username: "people@orillarestaurant.com",
    fromName: "Orilla People",
    fromEmail: "people@orillarestaurant.com",
    replyTo: "",
  },
  imap: {
    enabled: true,
    host: "imappro.zoho.com",
    port: 993,
    sentFolder: "Sent",
  },
  passwordEncrypted: null,
  lastVerifiedAt: null,
  lastError: null,
};

/** Zoho accounts / API data center for WorkDrive. */
export type ZohoWorkDriveRegion =
  | "com"
  | "eu"
  | "in"
  | "com.au"
  | "jp"
  | "uk"
  | "ca"
  | "sa";

/**
 * Document kinds that map to auto-created subfolders under each employee
 * folder in WorkDrive. More kinds can be added as upload surfaces ship.
 */
export type HrWorkDriveDocKind =
  | "profile_photo"
  | "passport"
  | "emirates_id"
  | "bank"
  | "offer_letter"
  | "contract"
  | "addendums"
  | "eresidence_card"
  | "ohc"
  | "medical_insurance"
  | "training_certificates"
  | "others";

/**
 * One uploadable part within a document kind. Most kinds have a single
 * "File" slot; Emirates ID typically has Front + Back.
 */
export type HrWorkDriveDocFileSlot = {
  /** Stable id within the doc kind, e.g. "front", "back", "default". */
  id: string;
  /** UI label for the part, e.g. "Front". */
  label: string;
  /**
   * Auto file-name template for this part (extension preserved separately).
   * Primary tokens: {first_name} {last_name} {doc_name} {doc_expiry}
   * Also: {emp_no} {full_name} {slot_label} {yyyy-MM-dd} {original_name}
   * {doc_expiry} is dd-mm-yy from the staff record when available.
   */
  fileNameTemplate: string;
};

export type HrWorkDriveDocSubfolder = {
  kind: HrWorkDriveDocKind;
  /** Folder name under the employee folder, e.g. "Passport". */
  folderName: string;
  /**
   * Used as `{doc_label}` in file-name templates (prefer compact forms like
   * EmiratesID). Also shown in the Drive Setup document column.
   */
  label: string;
  active: boolean;
  /** One or more file parts stored under this document subfolder. */
  fileSlots: HrWorkDriveDocFileSlot[];
};

function defaultDocFileSlot(
  label: string,
  template?: string,
): HrWorkDriveDocFileSlot {
  return {
    id: "default",
    label: "File",
    fileNameTemplate:
      template?.trim() ||
      `{doc_name}_{first_name}_{last_name}_{doc_expiry}`,
  };
}

export const DEFAULT_HR_WORK_DRIVE_DOC_SUBFOLDERS: HrWorkDriveDocSubfolder[] = [
  {
    kind: "profile_photo",
    folderName: "Profile Photo",
    label: "ProfilePhoto",
    active: true,
    fileSlots: [defaultDocFileSlot("ProfilePhoto")],
  },
  {
    kind: "passport",
    folderName: "Passport",
    label: "Passport",
    active: true,
    fileSlots: [defaultDocFileSlot("Passport")],
  },
  {
    kind: "emirates_id",
    folderName: "Emirates ID",
    label: "EmiratesID",
    active: true,
    fileSlots: [
      {
        id: "front",
        label: "Front",
        fileNameTemplate:
          "{doc_name}_Front_{first_name}_{last_name}_{doc_expiry}",
      },
      {
        id: "back",
        label: "Back",
        fileNameTemplate:
          "{doc_name}_Back_{first_name}_{last_name}_{doc_expiry}",
      },
    ],
  },
  {
    kind: "bank",
    folderName: "Bank",
    label: "Bank",
    active: true,
    fileSlots: [defaultDocFileSlot("Bank")],
  },
  {
    kind: "offer_letter",
    folderName: "Offer Letter",
    label: "OfferLetter",
    active: true,
    fileSlots: [defaultDocFileSlot("OfferLetter")],
  },
  {
    kind: "contract",
    folderName: "Labour Contract",
    label: "LabourContract",
    active: true,
    fileSlots: [defaultDocFileSlot("LabourContract")],
  },
  {
    kind: "addendums",
    folderName: "Addendums",
    label: "Addendum",
    active: true,
    fileSlots: [defaultDocFileSlot("Addendum")],
  },
  {
    kind: "eresidence_card",
    folderName: "eResidence Card",
    label: "eResidence",
    active: true,
    fileSlots: [defaultDocFileSlot("eResidence")],
  },
  {
    kind: "ohc",
    folderName: "OHC",
    label: "OHC",
    active: true,
    fileSlots: [defaultDocFileSlot("OHC")],
  },
  {
    kind: "medical_insurance",
    folderName: "Medical Insurance",
    label: "MedicalInsurance",
    active: true,
    fileSlots: [defaultDocFileSlot("MedicalInsurance")],
  },
  {
    kind: "training_certificates",
    folderName: "Training Certificates",
    label: "TrainingCert",
    active: true,
    fileSlots: [
      {
        id: "pic",
        label: "PIC",
        fileNameTemplate:
          "{doc_name}_PIC_{first_name}_{last_name}_{doc_expiry}",
      },
      {
        id: "basic_food_safety",
        label: "Food Safety",
        fileNameTemplate:
          "{doc_name}_FoodSafety_{first_name}_{last_name}_{doc_expiry}",
      },
      {
        id: "fire_safety",
        label: "Fire Safety",
        fileNameTemplate:
          "{doc_name}_FireSafety_{first_name}_{last_name}_{doc_expiry}",
      },
      {
        id: "first_aid",
        label: "First Aid",
        fileNameTemplate:
          "{doc_name}_FirstAid_{first_name}_{last_name}_{doc_expiry}",
      },
    ],
  },
  {
    kind: "others",
    folderName: "Others",
    label: "Other",
    active: true,
    fileSlots: [defaultDocFileSlot("Other")],
  },
];

export type HrWorkDriveConnectionStatus =
  | "disconnected"
  | "connected"
  | "error";

/**
 * Venue-scoped Zoho WorkDrive config (hr_venue_settings key `work_drive`).
 * Files are stored in WorkDrive — not Supabase Storage. Secrets stay encrypted
 * server-side and are never returned to the client.
 *
 * Tree: SS-OPS-HUB (team) → Human Resources (module) → Employee Documents →
 * `{emp_no} — {full_name}` → doc-type subfolders.
 */
export type HrWorkDriveSettings = {
  enabled: boolean;
  region: ZohoWorkDriveRegion;
  clientId: string;
  clientSecretEncrypted?: string | null;
  refreshTokenEncrypted?: string | null;
  /** Team / workspace root (SS-OPS-HUB). */
  teamFolderName: string;
  teamFolderId: string;
  /** Module folder under the team root (e.g. Human Resources). */
  hrFolderName: string;
  hrFolderId: string;
  /**
   * Working parent for `{emp_no} — {full_name}` folders (Employee Documents).
   */
  employeeDocsFolderId: string;
  /** Display name for the Employee Documents folder. */
  employeeDocsFolderName: string;
  /**
   * Extra folders under the module folder (siblings of Employee Documents).
   */
  extraFolders: HrWorkDriveExtraFolder[];
  /**
   * Template for per-employee folders under employeeDocsFolderId.
   * Tokens: {emp_no} {full_name} {first_name} {last_name}
   */
  employeeFolderTemplate: string;
  /**
   * Legacy fallback file-name template when a doc slot has none.
   * Prefer per-slot `fileSlots[].fileNameTemplate` in Drive Setup.
   */
  fileNameTemplate: string;
  /** Create missing employee / doc-type folders on upload. */
  autoCreateFolders: boolean;
  docSubfolders: HrWorkDriveDocSubfolder[];
  connectionStatus: HrWorkDriveConnectionStatus;
  lastVerifiedAt?: string | null;
  lastError?: string | null;
};

export type HrWorkDrivePublicSettings = Omit<
  HrWorkDriveSettings,
  "clientSecretEncrypted" | "refreshTokenEncrypted"
> & {
  hasClientSecret: boolean;
  hasRefreshToken: boolean;
};

/** Extra child folder under a module folder (sibling of Employee Documents). */
export type HrWorkDriveExtraFolder = {
  id: string;
  name: string;
  folderId: string;
  /** When true, uploads use auto file naming via `fileSlots`. */
  fileNameManagement?: boolean;
  fileSlots?: HrWorkDriveDocFileSlot[];
};

/** Team-folder tree under a WorkDrive OAuth connection. */
export type HrWorkDriveFolder = {
  id: string;
  label: string;
  /** Module that consumes this tree; `hr` is used by staff document uploads. */
  moduleKey: string;
  teamFolderName: string;
  teamFolderId: string;
  hrFolderName: string;
  hrFolderId: string;
  employeeDocsFolderId: string;
  employeeDocsFolderName: string;
  extraFolders: HrWorkDriveExtraFolder[];
  employeeFolderTemplate: string;
  fileNameTemplate: string;
  autoCreateFolders: boolean;
  docSubfolders: HrWorkDriveDocSubfolder[];
};

/** OAuth connection + its folder trees. */
export type HrWorkDriveConnection = {
  id: string;
  label: string;
  enabled: boolean;
  region: ZohoWorkDriveRegion;
  clientId: string;
  clientSecretEncrypted?: string | null;
  refreshTokenEncrypted?: string | null;
  connectionStatus: HrWorkDriveConnectionStatus;
  lastVerifiedAt?: string | null;
  lastError?: string | null;
  folders: HrWorkDriveFolder[];
};

export type HrWorkDriveStore = {
  connections: HrWorkDriveConnection[];
  defaultConnectionId: string | null;
};

export type HrWorkDriveFolderPublic = HrWorkDriveFolder;

export type HrWorkDriveConnectionPublic = Omit<
  HrWorkDriveConnection,
  "clientSecretEncrypted" | "refreshTokenEncrypted" | "folders"
> & {
  hasClientSecret: boolean;
  hasRefreshToken: boolean;
  folders: HrWorkDriveFolderPublic[];
  isDefault: boolean;
};

/** Default / seed values for WorkDrive folder tree. */
export const DEFAULT_HR_WORK_DRIVE_SETTINGS: HrWorkDriveSettings = {
  enabled: false,
  region: "com",
  clientId: "",
  clientSecretEncrypted: null,
  refreshTokenEncrypted: null,
  teamFolderName: "SS-OPS-HUB",
  teamFolderId: "",
  hrFolderName: "Human Resources",
  hrFolderId: "sae44cf1e2c4af89c4b2db0cbfcf01bcb006a",
  employeeDocsFolderId: "vtvbm62a07bbd35f041bd996fea000998c43a",
  employeeDocsFolderName: "Employee Documents",
  extraFolders: [],
  employeeFolderTemplate: "{emp_no} — {full_name}",
  fileNameTemplate: "{doc_label}_{emp_no}_{yyyy-MM-dd}",
  autoCreateFolders: true,
  docSubfolders: DEFAULT_HR_WORK_DRIVE_DOC_SUBFOLDERS,
  connectionStatus: "disconnected",
  lastVerifiedAt: null,
  lastError: null,
};

/** Recipient source for individual payslip emails. */
export type PayslipEmailRecipientField =
  | "work"
  | "personal"
  | "work_then_personal";

export type PayslipEmailTemplate = {
  id: string;
  name: string;
  subject: string;
  message: string;
};

export type HrPayslipEmailSettings = {
  /** When false, payslip email actions stay disabled. */
  enabled: boolean;
  /** Prefer work email, personal, or work with personal fallback. */
  recipientField: PayslipEmailRecipientField;
  /** Optional from override; blank uses Venue Settings → Email config from address. */
  fromEmail: string;
  attachPdf: boolean;
  /** Send automatically when a payroll run is marked paid. */
  autoSendOnPaid: boolean;
  /** Named message templates (subject + body). */
  templates: PayslipEmailTemplate[];
  /** Template used when sending; must match a templates[].id. */
  defaultTemplateId: string;
};

export const PAYSLIP_EMAIL_TEMPLATE_CODES = [
  {
    code: "{{EMPLOYEE_NAME}}",
    description: "Employee full name",
  },
  {
    code: "{{USER_NAME}}",
    description: "Signed-in user sending this email",
  },
  {
    code: "{{PAYROLL_MONTH}}",
    description: "Month name (e.g. July)",
  },
  {
    code: "{{PAYROLL_YEAR}}",
    description: "Year (e.g. 2026)",
  },
  {
    code: "{{PAYROLL_PERIOD}}",
    description: "Attendance/pay period start → end",
  },
  {
    code: "{{NET_PAY}}",
    description: "Employee net pay amount",
  },
  {
    code: "{{PAYMENT_DATE}}",
    description: "Scheduled salary payment date",
  },
  {
    code: "{{VENUE_NAME}}",
    description: "Venue / company display name",
  },
] as const;

export const DEFAULT_PAYSLIP_EMAIL_MESSAGE = `Dear {{EMPLOYEE_NAME}},

Please find attached your payslip for {{PAYROLL_MONTH}} {{PAYROLL_YEAR}}.

Payroll period: {{PAYROLL_PERIOD}}
Net pay: AED {{NET_PAY}}
Scheduled payment date: {{PAYMENT_DATE}}

If you have any questions about your payslip, please contact People / HR.

Kind regards,

{{VENUE_NAME}}
Human Resources`;

export const DEFAULT_PAYSLIP_EMAIL_TEMPLATE_ID = "default";

export const DEFAULT_PAYSLIP_EMAIL_SUBJECT =
  "Your payslip — {{PAYROLL_MONTH}} {{PAYROLL_YEAR}} — {{VENUE_NAME}}";

export function createPayslipEmailTemplate(
  partial?: Partial<PayslipEmailTemplate>,
): PayslipEmailTemplate {
  return {
    id:
      partial?.id?.trim() ||
      `tpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    name: String(partial?.name ?? "New template").trim() || "New template",
    subject:
      String(partial?.subject ?? DEFAULT_PAYSLIP_EMAIL_SUBJECT).trim() ||
      DEFAULT_PAYSLIP_EMAIL_SUBJECT,
    message: String(partial?.message ?? DEFAULT_PAYSLIP_EMAIL_MESSAGE),
  };
}

export const DEFAULT_PAYSLIP_EMAIL_TEMPLATE: PayslipEmailTemplate =
  createPayslipEmailTemplate({
    id: DEFAULT_PAYSLIP_EMAIL_TEMPLATE_ID,
    name: "Default",
    subject: DEFAULT_PAYSLIP_EMAIL_SUBJECT,
    message: DEFAULT_PAYSLIP_EMAIL_MESSAGE,
  });

export const DEFAULT_HR_PAYSLIP_EMAIL_SETTINGS: HrPayslipEmailSettings = {
  enabled: false,
  recipientField: "work_then_personal",
  fromEmail: "",
  attachPdf: true,
  autoSendOnPaid: false,
  templates: [DEFAULT_PAYSLIP_EMAIL_TEMPLATE],
  defaultTemplateId: DEFAULT_PAYSLIP_EMAIL_TEMPLATE_ID,
};

// ---------------------------------------------------------------------------
// Work anniversary congratulations email
// ---------------------------------------------------------------------------

export type HrWorkAnniversaryEmailSettings = {
  enabled: boolean;
  /** When true, send congratulations automatically on the anniversary day. */
  autoSendOnAnniversary: boolean;
  recipientField: PayslipEmailRecipientField;
  fromEmail: string;
  subject: string;
  message: string;
};

export const WORK_ANNIVERSARY_EMAIL_TEMPLATE_CODES = [
  { code: "{{EMPLOYEE_NAME}}", description: "Employee full name" },
  { code: "{{EMP_NO}}", description: "Employee number" },
  { code: "{{YEARS}}", description: "Years of service being celebrated" },
  {
    code: "{{YEARS_LABEL}}",
    description: "“year” or “years” from the count",
  },
  {
    code: "{{ANNIVERSARY_DATE}}",
    description: "Anniversary date (e.g. 15 Aug 2026)",
  },
  { code: "{{VENUE_NAME}}", description: "Venue / company display name" },
  { code: "{{USER_NAME}}", description: "Signed-in user sending this email" },
] as const;

export const DEFAULT_WORK_ANNIVERSARY_EMAIL_SUBJECT =
  "Congratulations on {{YEARS}} {{YEARS_LABEL}} with {{VENUE_NAME}}";

export const DEFAULT_WORK_ANNIVERSARY_EMAIL_MESSAGE = `Dear {{EMPLOYEE_NAME}},

Congratulations on completing {{YEARS}} {{YEARS_LABEL}} with {{VENUE_NAME}}!

Your dedication and contribution mean a great deal to the team. We are proud to celebrate this milestone with you on {{ANNIVERSARY_DATE}}.

With warm regards,

{{VENUE_NAME}}
Human Resources`;

export const DEFAULT_HR_WORK_ANNIVERSARY_EMAIL_SETTINGS: HrWorkAnniversaryEmailSettings =
  {
    enabled: true,
    autoSendOnAnniversary: false,
    recipientField: "work_then_personal",
    fromEmail: "",
    subject: DEFAULT_WORK_ANNIVERSARY_EMAIL_SUBJECT,
    message: DEFAULT_WORK_ANNIVERSARY_EMAIL_MESSAGE,
  };

// ---------------------------------------------------------------------------
// Updated documents / missing details request email
// ---------------------------------------------------------------------------

export type HrUpdatedDocsRequestEmailSettings = {
  enabled: boolean;
  recipientField: PayslipEmailRecipientField;
  fromEmail: string;
  subject: string;
  message: string;
};

export const UPDATED_DOCS_REQUEST_EMAIL_TEMPLATE_CODES = [
  { code: "{{EMPLOYEE_NAME}}", description: "Employee full name" },
  { code: "{{EMP_NO}}", description: "Employee number" },
  {
    code: "{{MISSING_DETAILS}}",
    description: "Bullet list of details currently missing for this employee",
  },
  {
    code: "{{MISSING_DETAILS_COUNT}}",
    description: "Number of missing detail items",
  },
  {
    code: "{{DOC_LABEL}}",
    description: "Expiring/expired document label when sent from Upcoming expiries",
  },
  {
    code: "{{EXPIRY_DATE}}",
    description: "Document expiry date when sent from Upcoming expiries",
  },
  {
    code: "{{DAYS_STATUS}}",
    description: "e.g. “88 days overdue” or “in 13 days”",
  },
  { code: "{{VENUE_NAME}}", description: "Venue / company display name" },
  { code: "{{USER_NAME}}", description: "Signed-in user sending this email" },
] as const;

export const DEFAULT_UPDATED_DOCS_REQUEST_EMAIL_SUBJECT =
  "Action required: updated documents / details — {{EMPLOYEE_NAME}}";

export const DEFAULT_UPDATED_DOCS_REQUEST_EMAIL_MESSAGE = `Dear {{EMPLOYEE_NAME}},

We are reviewing your employee records with {{VENUE_NAME}} and need you to provide the following updated information and/or documents:

{{MISSING_DETAILS}}

Please reply with the requested details at your earliest convenience. If you have already submitted any of these items, kindly resend them so we can update your file.

Thank you,
{{USER_NAME}}
{{VENUE_NAME}}
Human Resources`;

export const DEFAULT_HR_UPDATED_DOCS_REQUEST_EMAIL_SETTINGS: HrUpdatedDocsRequestEmailSettings =
  {
    enabled: true,
    recipientField: "personal",
    fromEmail: "",
    subject: DEFAULT_UPDATED_DOCS_REQUEST_EMAIL_SUBJECT,
    message: DEFAULT_UPDATED_DOCS_REQUEST_EMAIL_MESSAGE,
  };

// ---------------------------------------------------------------------------
// Uniform on-hand confirmation + terms & conditions email
// ---------------------------------------------------------------------------

export type HrUniformTermsEmailSettings = {
  enabled: boolean;
  recipientField: PayslipEmailRecipientField;
  fromEmail: string;
  subject: string;
  message: string;
};

export const UNIFORM_TERMS_EMAIL_TEMPLATE_CODES = [
  { code: "{{EMPLOYEE_NAME}}", description: "Employee full name" },
  { code: "{{EMP_NO}}", description: "Employee number" },
  {
    code: "{{UNIFORMS_ON_HAND}}",
    description: "Bullet list of uniform pieces currently issued to the employee",
  },
  {
    code: "{{UNIFORMS_TOTAL_VALUE}}",
    description: "Total value of uniforms currently on hand",
  },
  { code: "{{VENUE_NAME}}", description: "Venue / company display name" },
  { code: "{{USER_NAME}}", description: "Signed-in user sending this email" },
] as const;

export const DEFAULT_UNIFORM_TERMS_EMAIL_SUBJECT =
  "Company uniform on hand & T&Cs — {{EMPLOYEE_NAME}}";

export const DEFAULT_UNIFORM_TERMS_EMAIL_MESSAGE = `Dear {{EMPLOYEE_NAME}},

This email confirms the company uniform items currently issued to you by {{VENUE_NAME}}:

{{UNIFORMS_ON_HAND}}

Total value of uniforms on hand: {{UNIFORMS_TOTAL_VALUE}}

Terms & Conditions of company uniform usage
• Company uniforms remain the property of {{VENUE_NAME}} and are issued for work use only.
• You are responsible for the care and safekeeping of all items issued to you.
• If any uniform item is lost or damaged beyond normal wear and tear, the respective value will be deducted from your salary.
• Uniforms must be returned upon request or when your employment ends.

Please keep this record for your reference. Contact Human Resources if any listed item is incorrect.

Thank you,
{{USER_NAME}}
{{VENUE_NAME}}
Human Resources`;

export const DEFAULT_HR_UNIFORM_TERMS_EMAIL_SETTINGS: HrUniformTermsEmailSettings =
  {
    enabled: true,
    recipientField: "personal",
    fromEmail: "",
    subject: DEFAULT_UNIFORM_TERMS_EMAIL_SUBJECT,
    message: DEFAULT_UNIFORM_TERMS_EMAIL_MESSAGE,
  };

// ---------------------------------------------------------------------------
// Uniform replacement deduction notice email
// ---------------------------------------------------------------------------

export type HrUniformReplacementEmailSettings = {
  enabled: boolean;
  recipientField: PayslipEmailRecipientField;
  fromEmail: string;
  subject: string;
  message: string;
};

export const UNIFORM_REPLACEMENT_EMAIL_TEMPLATE_CODES = [
  { code: "{{EMPLOYEE_NAME}}", description: "Employee full name" },
  { code: "{{EMP_NO}}", description: "Employee number" },
  {
    code: "{{UNIFORMS_REPLACED}}",
    description: "Bullet list of replaced uniform pieces",
  },
  {
    code: "{{DEDUCTION_AMOUNT}}",
    description: "Amount to be deducted from the next payroll",
  },
  { code: "{{VENUE_NAME}}", description: "Venue / company display name" },
  { code: "{{USER_NAME}}", description: "Signed-in user sending this email" },
] as const;

export const DEFAULT_UNIFORM_REPLACEMENT_EMAIL_SUBJECT =
  "Uniform replacement deduction — {{EMPLOYEE_NAME}}";

export const DEFAULT_UNIFORM_REPLACEMENT_EMAIL_MESSAGE = `Dear {{EMPLOYEE_NAME}},

This notice confirms that a company uniform replacement has been issued, and the cost will be recovered from your salary.

Items replaced:
{{UNIFORMS_REPLACED}}

Amount to be deducted: {{DEDUCTION_AMOUNT}}

This amount will be deducted from your next payroll.

If you have questions about this deduction, please contact Human Resources.

Thank you,
{{USER_NAME}}
{{VENUE_NAME}}
Human Resources`;

export const DEFAULT_HR_UNIFORM_REPLACEMENT_EMAIL_SETTINGS: HrUniformReplacementEmailSettings =
  {
    enabled: true,
    recipientField: "personal",
    fromEmail: "",
    subject: DEFAULT_UNIFORM_REPLACEMENT_EMAIL_SUBJECT,
    message: DEFAULT_UNIFORM_REPLACEMENT_EMAIL_MESSAGE,
  };

/** Footer disclaimer printed at the bottom of every payslip PDF. */
export const DEFAULT_PAYSLIP_FOOTER_DISCLAIMER =
  "This payslip contains confidential personal and salary information intended solely for the named employee. Unauthorized copying, distribution, or disclosure is prohibited. This is a system generated payslip, no need for signature. INTERNAL CONFIDENTIAL DOCUMENT. All rights reserved.";

/** Fixed-height email header / footer chrome applied to HR template emails. */
export const EMAIL_CHROME_HEADER_HEIGHT_CM = 3;
export const EMAIL_CHROME_FOOTER_HEIGHT_CM = 2;
/** Social icon display size in px — fixed, never scales with viewport/email width. */
export const EMAIL_CHROME_SOCIAL_ICON_PX = 18;

export const DEFAULT_EMAIL_FOOTER_DISCLAIMER =
  "This email and any attachments are confidential and intended solely for the named recipient. If you received this message in error, please delete it and notify the sender. Unauthorized copying or disclosure is prohibited.";

export type HrEmailChromeSettings = {
  enabled: boolean;
  /** Light green header band behind the centered venue logo. */
  headerBackgroundColor: string;
  /** Combined footer copy (disclaimer + company address). */
  footerText: string;
  websiteUrl: string;
  instagramUrl: string;
  facebookUrl: string;
  linkedinUrl: string;
  tiktokUrl: string;
  snapchatUrl: string;
};

export const DEFAULT_HR_EMAIL_CHROME_SETTINGS: HrEmailChromeSettings = {
  enabled: true,
  headerBackgroundColor: "#F0F3DD",
  footerText: DEFAULT_EMAIL_FOOTER_DISCLAIMER,
  websiteUrl: "",
  instagramUrl: "",
  facebookUrl: "",
  linkedinUrl: "",
  tiktokUrl: "",
  snapchatUrl: "",
};

export const EMAIL_CHROME_SOCIAL_LINK_KEYS = [
  "websiteUrl",
  "instagramUrl",
  "facebookUrl",
  "linkedinUrl",
  "tiktokUrl",
  "snapchatUrl",
] as const;

export type EmailChromeSocialLinkKey =
  (typeof EMAIL_CHROME_SOCIAL_LINK_KEYS)[number];

export const EMAIL_CHROME_SOCIAL_LINKS: {
  key: EmailChromeSocialLinkKey;
  label: string;
  icon: "website" | "instagram" | "facebook" | "linkedin" | "tiktok" | "snapchat";
  placeholder: string;
}[] = [
  {
    key: "websiteUrl",
    label: "Website",
    icon: "website",
    placeholder: "https://www.example.com",
  },
  {
    key: "instagramUrl",
    label: "Instagram",
    icon: "instagram",
    placeholder: "https://www.instagram.com/…",
  },
  {
    key: "facebookUrl",
    label: "Facebook",
    icon: "facebook",
    placeholder: "https://www.facebook.com/…",
  },
  {
    key: "linkedinUrl",
    label: "LinkedIn",
    icon: "linkedin",
    placeholder: "https://www.linkedin.com/…",
  },
  {
    key: "tiktokUrl",
    label: "TikTok",
    icon: "tiktok",
    placeholder: "https://www.tiktok.com/@…",
  },
  {
    key: "snapchatUrl",
    label: "Snapchat",
    icon: "snapchat",
    placeholder: "https://www.snapchat.com/add/…",
  },
];

/** Legal letterhead shown on payslip PDFs for this venue. */
export type HrPayslipLetterheadSettings = {
  companyName: string;
  companyAddress: string;
  /** Public URL of the uploaded legal stamp (WebP). Null = use built-in venue stamp if any. */
  stampUrl: string | null;
  footerDisclaimer: string;
};

export const DEFAULT_HR_PAYSLIP_LETTERHEAD_SETTINGS: HrPayslipLetterheadSettings =
  {
    companyName: "",
    companyAddress: "",
    stampUrl: null,
    footerDisclaimer: DEFAULT_PAYSLIP_FOOTER_DISCLAIMER,
  };

/** Active subject/message from the default (or first) template. */
export function resolvePayslipEmailTemplate(
  settings: HrPayslipEmailSettings,
): PayslipEmailTemplate {
  const byId = settings.templates.find((t) => t.id === settings.defaultTemplateId);
  return byId ?? settings.templates[0] ?? DEFAULT_PAYSLIP_EMAIL_TEMPLATE;
}

// ---------------------------------------------------------------------------
// Boarding / offboarding emails
// ---------------------------------------------------------------------------

export type BoardingEmailAction =
  | "resignation_confirm"
  | "termination_notice"
  | "handover"
  | "accommodation_employee"
  | "accommodation_management"
  | "cancel_visa"
  | "cancel_insurance"
  | "accounts_payment"
  | "goodbye";

export type BoardingEmailTemplate = {
  id: string;
  name: string;
  /** Which offboarding email action this template serves. */
  action: BoardingEmailAction;
  subject: string;
  message: string;
  /**
   * Fixed recipient emails (one per line) for templates not sent to the
   * employee — e.g. accommodation management, visa, insurance, accounts.
   */
  toEmails: string;
};

export type HrBoardingEmailSettings = {
  enabled: boolean;
  recipientField: PayslipEmailRecipientField;
  fromEmail: string;
  templates: BoardingEmailTemplate[];
  /** Default template id per email action. */
  defaultTemplateByAction: Record<BoardingEmailAction, string>;
};

export const BOARDING_EMAIL_ACTIONS: {
  value: BoardingEmailAction;
  label: string;
}[] = [
  { value: "resignation_confirm", label: "Resignation confirmation" },
  { value: "termination_notice", label: "Termination notice" },
  { value: "handover", label: "Handover" },
  {
    value: "accommodation_employee",
    label: "Accommodation clearance (employee)",
  },
  {
    value: "accommodation_management",
    label: "Accommodation clearance (management)",
  },
  { value: "cancel_visa", label: "Cancel visa" },
  { value: "cancel_insurance", label: "Cancel insurance" },
  {
    value: "accounts_payment",
    label: "Additional payment details (accounts)",
  },
  { value: "goodbye", label: "Goodbye" },
];

/** Actions that send to configured addresses, not the employee. */
export const BOARDING_EMAIL_FIXED_RECIPIENT_ACTIONS: BoardingEmailAction[] = [
  "accommodation_management",
  "cancel_visa",
  "cancel_insurance",
  "accounts_payment",
];

export function boardingEmailUsesFixedRecipients(
  action: BoardingEmailAction,
): boolean {
  return BOARDING_EMAIL_FIXED_RECIPIENT_ACTIONS.includes(action);
}

export function parseBoardingTemplateToEmails(
  value: string | null | undefined,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of String(value ?? "").split(/[\n,;]+/)) {
    const email = part.trim().toLowerCase();
    if (!email || !email.includes("@") || seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

export function formatBoardingTemplateToEmails(emails: string[]): string {
  return emails.join("\n");
}

/** Checklist stages that currently have boarding email templates in settings. */
export type BoardingEmailSettingsStepId =
  | "notice"
  | "handover"
  | "accommodation"
  | "benefits_cancel"
  | "final_payment"
  | "goodbye";

export const BOARDING_EMAIL_SETTINGS_STEPS: {
  id: BoardingEmailSettingsStepId;
  allowedActions: BoardingEmailAction[];
  defaultAddAction: BoardingEmailAction;
}[] = [
  {
    id: "notice",
    allowedActions: ["resignation_confirm", "termination_notice"],
    defaultAddAction: "resignation_confirm",
  },
  {
    id: "handover",
    allowedActions: ["handover"],
    defaultAddAction: "handover",
  },
  {
    id: "accommodation",
    allowedActions: ["accommodation_employee", "accommodation_management"],
    defaultAddAction: "accommodation_employee",
  },
  {
    id: "benefits_cancel",
    allowedActions: ["cancel_visa", "cancel_insurance"],
    defaultAddAction: "cancel_visa",
  },
  {
    id: "final_payment",
    allowedActions: ["accounts_payment"],
    defaultAddAction: "accounts_payment",
  },
  {
    id: "goodbye",
    allowedActions: ["goodbye"],
    defaultAddAction: "goodbye",
  },
];

export function boardingEmailActionLabel(action: BoardingEmailAction): string {
  return (
    BOARDING_EMAIL_ACTIONS.find((row) => row.value === action)?.label ?? action
  );
}

export function templatesForBoardingEmailStep(
  templates: BoardingEmailTemplate[],
  stepId: BoardingEmailSettingsStepId,
): BoardingEmailTemplate[] {
  const allowed =
    BOARDING_EMAIL_SETTINGS_STEPS.find((s) => s.id === stepId)?.allowedActions ??
    [];
  return templates.filter((t) => allowed.includes(t.action));
}

export function parseBoardingEmailAction(
  value: string | null | undefined,
): BoardingEmailAction {
  const raw = String(value ?? "").trim();
  if (BOARDING_EMAIL_ACTIONS.some((row) => row.value === raw)) {
    return raw as BoardingEmailAction;
  }
  return "resignation_confirm";
}

export const BOARDING_EMAIL_TEMPLATE_CODES = [
  { code: "{{EMPLOYEE_NAME}}", description: "Employee full name" },
  { code: "{{USER_NAME}}", description: "Signed-in user sending this email" },
  { code: "{{EMP_NO}}", description: "Employee number" },
  { code: "{{DEPARTMENT}}", description: "Department name" },
  { code: "{{POSITION}}", description: "Position / job title" },
  {
    code: "{{NOTIFICATION_DATE}}",
    description: "Date the notice / resignation was given",
  },
  {
    code: "{{LAST_WORKING_DAY}}",
    description: "Confirmed last working day",
  },
  {
    code: "{{ACCOMMODATION_CLEARANCE_DATE}}",
    description: "Deadline to clear company accommodation",
  },
  { code: "{{VENUE_NAME}}", description: "Venue / company display name" },
] as const;

export const DEFAULT_RESIGNATION_CONFIRM_SUBJECT =
  "Confirmation of your resignation — {{VENUE_NAME}}";

export const DEFAULT_RESIGNATION_CONFIRM_MESSAGE = `Dear {{EMPLOYEE_NAME}},

We acknowledge receipt of your resignation letter dated {{NOTIFICATION_DATE}}.

Please confirm whether you accept this acknowledgement and that your last working day will be {{LAST_WORKING_DAY}}.

If you have any questions, please contact People / HR.

Kind regards,

{{VENUE_NAME}}
Human Resources`;

export const DEFAULT_TERMINATION_NOTICE_SUBJECT =
  "Notice of termination — {{VENUE_NAME}}";

export const DEFAULT_TERMINATION_NOTICE_MESSAGE = `Dear {{EMPLOYEE_NAME}},

This letter serves as formal notice of the termination of your employment with {{VENUE_NAME}}.

Your last working day will be {{LAST_WORKING_DAY}}.

Further information about your final settlement and offboarding steps will follow from People / HR.

Kind regards,

{{VENUE_NAME}}
Human Resources`;

export const DEFAULT_HANDOVER_SUBJECT =
  "Handover plan before your last working day — {{VENUE_NAME}}";

export const DEFAULT_HANDOVER_MESSAGE = `Dear {{EMPLOYEE_NAME}},

As your last working day approaches ({{LAST_WORKING_DAY}}), please prepare a clear handover of your duties, open items, and any company property or access.

Please reply with:
• Outstanding tasks and owners
• Key contacts and passwords / access notes (as applicable)
• Documents or files that need handing over

Management and your HOD are copied so we can support a smooth transition.

Kind regards,

{{VENUE_NAME}}
Human Resources`;

export const DEFAULT_ACCOMMODATION_EMPLOYEE_SUBJECT =
  "Accommodation clearance deadline — {{VENUE_NAME}}";

export const DEFAULT_ACCOMMODATION_EMPLOYEE_MESSAGE = `Dear {{EMPLOYEE_NAME}},

Please complete clearance of your company accommodation by {{ACCOMMODATION_CLEARANCE_DATE}}.

This includes returning keys, leaving the unit clean, and removing personal belongings.

Contact People / HR if you need support before that date.

Kind regards,

{{VENUE_NAME}}
Human Resources`;

export const DEFAULT_ACCOMMODATION_MANAGEMENT_SUBJECT =
  "Accommodation clearance — {{EMPLOYEE_NAME}} ({{EMP_NO}})";

export const DEFAULT_ACCOMMODATION_MANAGEMENT_MESSAGE = `Hello,

Please note that {{EMPLOYEE_NAME}} (employee no. {{EMP_NO}}) must clear company accommodation by {{ACCOMMODATION_CLEARANCE_DATE}}.

Last working day: {{LAST_WORKING_DAY}}.

Please coordinate keys return, inspection, and any outstanding housing matters with People / HR.

Kind regards,

{{VENUE_NAME}}
Human Resources`;

export const DEFAULT_CANCEL_VISA_SUBJECT =
  "Visa cancellation — {{EMPLOYEE_NAME}} ({{EMP_NO}})";

export const DEFAULT_CANCEL_VISA_MESSAGE = `Hello,

Please proceed with visa cancellation for {{EMPLOYEE_NAME}} (employee no. {{EMP_NO}}).

Last working day: {{LAST_WORKING_DAY}}.

Kind regards,

{{VENUE_NAME}}
Human Resources`;

export const DEFAULT_CANCEL_INSURANCE_SUBJECT =
  "Insurance cancellation — {{EMPLOYEE_NAME}} ({{EMP_NO}})";

export const DEFAULT_CANCEL_INSURANCE_MESSAGE = `Hello,

Please cancel medical / employment insurance for {{EMPLOYEE_NAME}} (employee no. {{EMP_NO}}).

Last working day: {{LAST_WORKING_DAY}}.

Kind regards,

{{VENUE_NAME}}
Human Resources`;

export const DEFAULT_ACCOUNTS_PAYMENT_SUBJECT =
  "Final settlement / additional payment details — {{EMPLOYEE_NAME}} ({{EMP_NO}})";

export const DEFAULT_ACCOUNTS_PAYMENT_MESSAGE = `Hello Accounts,

Please find additional payment details for the final settlement of {{EMPLOYEE_NAME}} (employee no. {{EMP_NO}}).

Last working day: {{LAST_WORKING_DAY}}.

[Add payment breakdown, bank details, and any special instructions here.]

Kind regards,

{{VENUE_NAME}}
Human Resources`;

export const DEFAULT_GOODBYE_SUBJECT =
  "Thank you — {{VENUE_NAME}}";

export const DEFAULT_GOODBYE_MESSAGE = `Dear {{EMPLOYEE_NAME}},

Thank you for your time with {{VENUE_NAME}}. We wish you every success in your next chapter.

Your last working day was {{LAST_WORKING_DAY}}.

If you need anything after your exit, please contact People / HR.

Kind regards,

{{VENUE_NAME}}
Human Resources`;

export const DEFAULT_RESIGNATION_CONFIRM_TEMPLATE_ID = "resignation_confirm";
export const DEFAULT_TERMINATION_NOTICE_TEMPLATE_ID = "termination_notice";
export const DEFAULT_HANDOVER_TEMPLATE_ID = "handover";
export const DEFAULT_ACCOMMODATION_EMPLOYEE_TEMPLATE_ID =
  "accommodation_employee";
export const DEFAULT_ACCOMMODATION_MANAGEMENT_TEMPLATE_ID =
  "accommodation_management";
export const DEFAULT_CANCEL_VISA_TEMPLATE_ID = "cancel_visa";
export const DEFAULT_CANCEL_INSURANCE_TEMPLATE_ID = "cancel_insurance";
export const DEFAULT_ACCOUNTS_PAYMENT_TEMPLATE_ID = "accounts_payment";
export const DEFAULT_GOODBYE_TEMPLATE_ID = "goodbye";

const BOARDING_EMAIL_TEMPLATE_DEFAULTS: Record<
  BoardingEmailAction,
  { name: string; subject: string; message: string; id: string }
> = {
  resignation_confirm: {
    id: DEFAULT_RESIGNATION_CONFIRM_TEMPLATE_ID,
    name: "Resignation confirmation",
    subject: DEFAULT_RESIGNATION_CONFIRM_SUBJECT,
    message: DEFAULT_RESIGNATION_CONFIRM_MESSAGE,
  },
  termination_notice: {
    id: DEFAULT_TERMINATION_NOTICE_TEMPLATE_ID,
    name: "Termination notice",
    subject: DEFAULT_TERMINATION_NOTICE_SUBJECT,
    message: DEFAULT_TERMINATION_NOTICE_MESSAGE,
  },
  handover: {
    id: DEFAULT_HANDOVER_TEMPLATE_ID,
    name: "Handover",
    subject: DEFAULT_HANDOVER_SUBJECT,
    message: DEFAULT_HANDOVER_MESSAGE,
  },
  accommodation_employee: {
    id: DEFAULT_ACCOMMODATION_EMPLOYEE_TEMPLATE_ID,
    name: "Accommodation clearance (employee)",
    subject: DEFAULT_ACCOMMODATION_EMPLOYEE_SUBJECT,
    message: DEFAULT_ACCOMMODATION_EMPLOYEE_MESSAGE,
  },
  accommodation_management: {
    id: DEFAULT_ACCOMMODATION_MANAGEMENT_TEMPLATE_ID,
    name: "Accommodation clearance (management)",
    subject: DEFAULT_ACCOMMODATION_MANAGEMENT_SUBJECT,
    message: DEFAULT_ACCOMMODATION_MANAGEMENT_MESSAGE,
  },
  cancel_visa: {
    id: DEFAULT_CANCEL_VISA_TEMPLATE_ID,
    name: "Cancel visa",
    subject: DEFAULT_CANCEL_VISA_SUBJECT,
    message: DEFAULT_CANCEL_VISA_MESSAGE,
  },
  cancel_insurance: {
    id: DEFAULT_CANCEL_INSURANCE_TEMPLATE_ID,
    name: "Cancel insurance",
    subject: DEFAULT_CANCEL_INSURANCE_SUBJECT,
    message: DEFAULT_CANCEL_INSURANCE_MESSAGE,
  },
  accounts_payment: {
    id: DEFAULT_ACCOUNTS_PAYMENT_TEMPLATE_ID,
    name: "Additional payment details (accounts)",
    subject: DEFAULT_ACCOUNTS_PAYMENT_SUBJECT,
    message: DEFAULT_ACCOUNTS_PAYMENT_MESSAGE,
  },
  goodbye: {
    id: DEFAULT_GOODBYE_TEMPLATE_ID,
    name: "Goodbye",
    subject: DEFAULT_GOODBYE_SUBJECT,
    message: DEFAULT_GOODBYE_MESSAGE,
  },
};

export function createBoardingEmailTemplate(
  partial?: Partial<BoardingEmailTemplate>,
): BoardingEmailTemplate {
  const action = parseBoardingEmailAction(partial?.action);
  const defaults = BOARDING_EMAIL_TEMPLATE_DEFAULTS[action];
  const toEmails = boardingEmailUsesFixedRecipients(action)
    ? formatBoardingTemplateToEmails(
        parseBoardingTemplateToEmails(partial?.toEmails),
      )
    : "";
  return {
    id:
      partial?.id?.trim() ||
      `tpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    name: String(partial?.name ?? defaults.name).trim() || defaults.name,
    action,
    subject:
      String(partial?.subject ?? defaults.subject).trim() || defaults.subject,
    message: String(partial?.message ?? defaults.message),
    toEmails,
  };
}

export const DEFAULT_BOARDING_EMAIL_TEMPLATES: BoardingEmailTemplate[] =
  BOARDING_EMAIL_ACTIONS.map((row) => {
    const defaults = BOARDING_EMAIL_TEMPLATE_DEFAULTS[row.value];
    return createBoardingEmailTemplate({
      id: defaults.id,
      name: defaults.name,
      action: row.value,
      subject: defaults.subject,
      message: defaults.message,
    });
  });

export const DEFAULT_HR_BOARDING_EMAIL_SETTINGS: HrBoardingEmailSettings = {
  enabled: true,
  recipientField: "work_then_personal",
  fromEmail: "",
  templates: DEFAULT_BOARDING_EMAIL_TEMPLATES,
  defaultTemplateByAction: Object.fromEntries(
    BOARDING_EMAIL_ACTIONS.map((row) => [
      row.value,
      BOARDING_EMAIL_TEMPLATE_DEFAULTS[row.value].id,
    ]),
  ) as Record<BoardingEmailAction, string>,
};

export function resolveBoardingEmailTemplate(
  settings: HrBoardingEmailSettings,
  action: BoardingEmailAction,
  templateId?: string | null,
): BoardingEmailTemplate {
  const forAction = settings.templates.filter((t) => t.action === action);
  const requested = String(templateId ?? "").trim();
  if (requested) {
    const byId =
      forAction.find((t) => t.id === requested) ??
      settings.templates.find((t) => t.id === requested);
    if (byId) return byId;
  }
  const defaultId = settings.defaultTemplateByAction[action];
  const byDefault = forAction.find((t) => t.id === defaultId);
  return (
    byDefault ??
    forAction[0] ??
    settings.templates[0] ??
    DEFAULT_BOARDING_EMAIL_TEMPLATES[0]!
  );
}

/** Codes available in payroll approval email subject/message templates. */
export const PAYROLL_EMAIL_TEMPLATE_CODES = [
  {
    code: "{{USER_NAME}}",
    description: "Signed-in user sending this email",
  },
  {
    code: "{{PAYROLL_MONTH}}",
    description: "Month name (e.g. July)",
  },
  {
    code: "{{PAYROLL_YEAR}}",
    description: "Year (e.g. 2026)",
  },
  {
    code: "{{PAYROLL_PERIOD}}",
    description: "Attendance/pay period start → end",
  },
  {
    code: "{{TOTAL_EMPLOYEES}}",
    description: "Included employee count",
  },
  {
    code: "{{TOTAL_NET_PAYROLL}}",
    description: "Total net payroll amount (number)",
  },
  {
    code: "{{PAYMENT_DATE}}",
    description: "Scheduled salary payment date",
  },
  {
    code: "{{VENUE_NAME}}",
    description: "Venue / company display name",
  },
  {
    code: "{{PERIOD_START}}",
    description: "Period start date (YYYY-MM-DD)",
  },
  {
    code: "{{PERIOD_END}}",
    description: "Period end date (YYYY-MM-DD)",
  },
] as const;

export const DEFAULT_PAYROLL_EMAIL_MESSAGE = `Dear Paper Chase Team,

Please find attached the payroll package for {{PAYROLL_MONTH}} {{PAYROLL_YEAR}} for processing.

The attached documents include:

* Payroll Summary
* Employee Payroll Breakdown
* Salary Transfer Details (if applicable)
* Overtime Report
* Leave & Attendance Adjustments
* New Joiners / Resignations
* Final Settlements (if applicable)
* Supporting payroll documents

Payroll Information

* Company: Orilla Restaurant FZE
* Payroll Period: {{PAYROLL_PERIOD}}
* Total Employees: {{TOTAL_EMPLOYEES}}
* Total Net Payroll: AED {{TOTAL_NET_PAYROLL}}
* Scheduled Salary Payment Date: {{PAYMENT_DATE}}

Please process the payroll according to the attached documentation and advise us once the payment file has been completed or if any clarification is required.

If you identify any discrepancies or missing information during your review, kindly notify us before processing.

Thank you for your continued support.

Kind regards,

Orilla Restaurant
Human Resources Department
Stellar Society Group`;

export const DEFAULT_PAYROLL_EMAIL_TEMPLATE_ID = "default";

export const DEFAULT_PAYROLL_EMAIL_SUBJECT =
  "Payroll package — {{PAYROLL_MONTH}} {{PAYROLL_YEAR}} — Orilla Restaurant FZE";

export function createPayrollEmailTemplate(
  partial?: Partial<PayrollEmailTemplate>,
): PayrollEmailTemplate {
  return {
    id:
      partial?.id?.trim() ||
      `tpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    name: String(partial?.name ?? "New template").trim() || "New template",
    subject:
      String(partial?.subject ?? DEFAULT_PAYROLL_EMAIL_SUBJECT).trim() ||
      DEFAULT_PAYROLL_EMAIL_SUBJECT,
    message: String(partial?.message ?? DEFAULT_PAYROLL_EMAIL_MESSAGE),
  };
}

export const DEFAULT_PAYROLL_EMAIL_TEMPLATE: PayrollEmailTemplate =
  createPayrollEmailTemplate({
    id: DEFAULT_PAYROLL_EMAIL_TEMPLATE_ID,
    name: "Default",
    subject: DEFAULT_PAYROLL_EMAIL_SUBJECT,
    message: DEFAULT_PAYROLL_EMAIL_MESSAGE,
  });

/** Active subject/message from the default (or first) payroll email template. */
export function resolvePayrollEmailTemplate(
  email: HrPayrollApprovalsSettings["email"],
): PayrollEmailTemplate {
  const byId = email.templates.find((t) => t.id === email.defaultTemplateId);
  return byId ?? email.templates[0] ?? DEFAULT_PAYROLL_EMAIL_TEMPLATE;
}

export const DEFAULT_HR_PAYROLL_APPROVALS_SETTINGS: HrPayrollApprovalsSettings =
  {
    hrReviewApproverUserIds: [],
    finalApprovalApproverUserIds: [],
    reopenUserIds: [],
    email: {
      fromEmail: "people@orillarestaurant.com",
      toEmails: ["admin@orillarestaurant.com"],
      templates: [DEFAULT_PAYROLL_EMAIL_TEMPLATE],
      defaultTemplateId: DEFAULT_PAYROLL_EMAIL_TEMPLATE_ID,
      attachPayrollExport: true,
      attachGlExport: false,
      attachOther: false,
      autoSendOnFinalApproval: true,
    },
  };

export type PayrollApprovalRequestStatus =
  | "pending"
  | "approved"
  | "cancelled";

export type PayrollApprovalRequest = {
  id: string;
  venue_id: string;
  run_id: string;
  step: PayrollApprovalStep;
  status: PayrollApprovalRequestStatus;
  requested_by: string;
  requested_at: string;
  approver_user_ids: string[];
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ScheduleApprovalStatus = "pending" | "approved" | "cancelled";

export type ScheduleApprovalDepartmentKey =
  | "kitchen"
  | "bar"
  | "floor"
  | "office";

export type ScheduleApprovalRequest = {
  id: string;
  venue_id: string;
  week_start: string;
  /** Schedule department tab this approval applies to. */
  department_key: ScheduleApprovalDepartmentKey;
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
