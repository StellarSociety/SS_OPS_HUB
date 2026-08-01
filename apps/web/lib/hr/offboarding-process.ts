/** Offboarding process types — persisted in `hr_offboarding_processes`. */

export type OffboardingTerminationKind =
  | "resignation"
  | "termination_with_notice"
  | "immediate_termination";

export const OFFBOARDING_TERMINATION_KIND_OPTIONS: {
  value: OffboardingTerminationKind;
  label: string;
  description: string;
}[] = [
  {
    value: "resignation",
    label: "Resignation",
    description: "Employee-initiated exit",
  },
  {
    value: "termination_with_notice",
    label: "Termination with Notice",
    description: "Employer-initiated; notice pay applies",
  },
  {
    value: "immediate_termination",
    label: "Immediate Termination",
    description: "Employer-initiated; no notice period",
  },
];

/** How remaining leave is handled on exit. */
export type OffboardingLeaveHandling = "use_on_last_days" | "pay_off";

/** How a created exit leave is submitted. */
export type OffboardingLeaveApprovalMode = "draft" | "direct_approve";

export type OffboardingLeaveEntry = {
  id: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  approvalMode: OffboardingLeaveApprovalMode;
};

export type OffboardingProcessStatus =
  | "draft"
  | "in_progress"
  | "settlement_pending"
  | "completed"
  | "cancelled";

export const OFFBOARDING_PROCESS_STATUS_LABELS: Record<
  OffboardingProcessStatus,
  string
> = {
  draft: "Draft",
  in_progress: "In progress",
  settlement_pending: "Settlement pending",
  completed: "Completed",
  cancelled: "Cancelled",
};

export type OffboardingAutoAdjustments = {
  salaryToLastDay: boolean;
  annualLeavePayout: boolean;
  eosGratuity: boolean;
  publicHolidayBalance: boolean;
  noticePay: boolean;
};

export type OffboardingSettlementPreview = {
  dailyRate: number | null;
  alDays: number;
  phDays: number;
  alPayout: number | null;
  phPayout: number | null;
  eosGratuity: number | null;
  noticePayDays: number;
  noticePay: number | null;
  estimatedTotal: number | null;
};

/** Email action for offboarding communications (templates / sent records). */
export type OffboardingNoticeEmailAction =
  | "resignation_confirm"
  | "termination_notice"
  | "handover"
  | "accommodation_employee"
  | "accommodation_management"
  | "cancel_visa"
  | "cancel_insurance"
  | "accounts_payment"
  | "goodbye";

/** Email record after compose — draft, scheduled, or sent (viewable copy). */
export type OffboardingNoticeEmailDelivery = {
  id: string;
  action: OffboardingNoticeEmailAction;
  status: "draft" | "scheduled" | "sent";
  /** ISO time when sent, or when the draft/schedule was last saved. */
  sentAt: string;
  /** When status=scheduled: ISO time the email will be sent automatically. */
  scheduledAt: string | null;
  to: string;
  fromEmail: string | null;
  subject: string;
  message: string;
  templateId: string;
  templateName: string;
  provider: string;
};

export type OffboardingProcess = {
  id: string;
  staffId: string;
  empNo: string;
  fullName: string;
  departmentName: string | null;
  positionName: string | null;
  employmentStatusId: string | null;
  employmentStatusName: string | null;
  joiningDate: string | null;
  terminationKind: OffboardingTerminationKind;
  notificationDate: string;
  /** Last paid / last working day — syncs with staff directory termination_date. */
  terminationDate: string;
  noticeEmailAction: OffboardingNoticeEmailAction | null;
  /** Sent notice emails (newest last); open to review the exact message. */
  noticeEmailRecords: OffboardingNoticeEmailDelivery[];
  /** @deprecated Prefer noticeEmailRecords — kept for older session payloads. */
  noticeEmailDelivery?: OffboardingNoticeEmailDelivery | null;
  /** Auto-disable Hub access on this date (step 6). */
  hubAccessDisableDate: string | null;
  alBalance: number;
  phBalance: number;
  leaveHandling: OffboardingLeaveHandling;
  leaveEntries: OffboardingLeaveEntry[];
  checklist: OffboardingChecklistStepState[];
  autoAdjustments: OffboardingAutoAdjustments;
  settlement: OffboardingSettlementPreview;
  status: OffboardingProcessStatus;
  startedAt: string;
  notes: string;
};

/** Normalize legacy single delivery into the records list. */
export function normalizeNoticeEmailRecords(
  process: Pick<
    OffboardingProcess,
    "noticeEmailRecords" | "noticeEmailDelivery"
  > | null | undefined,
): OffboardingNoticeEmailDelivery[] {
  const fromList = Array.isArray(process?.noticeEmailRecords)
    ? process!.noticeEmailRecords
    : [];
  if (fromList.length > 0) {
    return fromList.map((row) => ({
      ...row,
      id: row.id || newProcessId(),
      status:
        row.status === "draft"
          ? "draft"
          : row.status === "scheduled"
            ? "scheduled"
            : "sent",
      scheduledAt: row.scheduledAt ?? null,
      fromEmail: row.fromEmail ?? null,
      message: row.message ?? "",
    }));
  }
  const legacy = process?.noticeEmailDelivery;
  if (!legacy) return [];
  return [
    {
      ...legacy,
      id: legacy.id || newProcessId(),
      status:
        legacy.status === "draft"
          ? "draft"
          : legacy.status === "scheduled"
            ? "scheduled"
            : "sent",
      scheduledAt: legacy.scheduledAt ?? null,
      fromEmail: legacy.fromEmail ?? null,
      message: legacy.message ?? "",
    },
  ];
}

export type OffboardingChecklistStepId =
  | "notice"
  | "handover"
  | "settlement_calc"
  | "final_payslip"
  | "signatures"
  | "access"
  | "property"
  | "accommodation"
  | "benefits_cancel"
  | "final_payment"
  | "goodbye";

export type OffboardingChecklistItem = {
  id: string;
  label: string;
  done: boolean;
  /** ISO timestamp when marked done (for timed checklist steps). */
  doneAt: string | null;
};

export type OffboardingChecklistStepState = {
  id: OffboardingChecklistStepId;
  items: OffboardingChecklistItem[];
};

export type OffboardingChecklistStepMeta = {
  id: OffboardingChecklistStepId;
  number: number;
  label: string;
  description: string;
};

export const OFFBOARDING_CHECKLIST_STEPS: OffboardingChecklistStepMeta[] = [
  {
    id: "notice",
    number: 1,
    label: "Receive resignation or issue termination notice",
    description: "Confirm the employee’s last working day and send notice email",
  },
  {
    id: "handover",
    number: 2,
    label: "Plan the handover of duties and company assets",
    description: "Email the employee; CC management and HODs",
  },
  {
    id: "settlement_calc",
    number: 3,
    label: "Calculate final settlement",
    description: "Salary, leave balance, deductions, gratuity if applicable",
  },
  {
    id: "final_payslip",
    number: 4,
    label: "Issue the final payslip and settlement document",
    description: "Generate and share final payslip / settlement papers",
  },
  {
    id: "signatures",
    number: 5,
    label: "Obtain required signatures and clearances",
    description: "Offboarding clearance checklist",
  },
  {
    id: "access",
    number: 6,
    label: "Disable system and building access on the last working day",
    description: "Hub auto-disable date and other app deactivations",
  },
  {
    id: "property",
    number: 7,
    label: "Collect company property",
    description: "Laptop, keys, uniforms, ID card, and other assets",
  },
  {
    id: "accommodation",
    number: 8,
    label: "Accommodation handover",
    description:
      "Clearance deadline to the employee and accommodation management",
  },
  {
    id: "benefits_cancel",
    number: 9,
    label: "Cancel visa, work permit, medical insurance, and benefits",
    description: "Employment-related benefits cancellation (if applicable)",
  },
  {
    id: "final_payment",
    number: 10,
    label: "Process the final payment",
    description: "Pay the final settlement",
  },
  {
    id: "goodbye",
    number: 11,
    label: "Goodbye",
    description: "Last email to the employee",
  },
];

function item(
  id: string,
  label: string,
): OffboardingChecklistItem {
  return { id, label, done: false, doneAt: null };
}

export function createDefaultChecklist(): OffboardingChecklistStepState[] {
  return OFFBOARDING_CHECKLIST_STEPS.map((step) => {
    switch (step.id) {
      case "notice":
        return {
          id: step.id,
          items: [],
        };
      case "handover":
        return {
          id: step.id,
          items: [
            item(
              "handover_email_sent",
              "Send handover email (CC management and HODs)",
            ),
          ],
        };
      case "settlement_calc":
        return {
          id: step.id,
          items: [
            item("salary_to_last_day", "Salary calculated to last working day"),
            item("leave_balance_reviewed", "Leave balance reviewed"),
            item("deductions_reviewed", "Deductions reviewed"),
            item("gratuity_reviewed", "Gratuity reviewed (if applicable)"),
            item("settlement_totals_confirmed", "Settlement totals confirmed"),
          ],
        };
      case "final_payslip":
        return {
          id: step.id,
          items: [
            item("final_payslip_issued", "Final payslip issued"),
            item("settlement_document_issued", "Settlement document issued"),
          ],
        };
      case "signatures":
        return {
          id: step.id,
          items: [
            item("hr_clearance", "HR clearance signed"),
            item("department_clearance", "Department / HOD clearance signed"),
            item("finance_clearance", "Finance clearance signed"),
            item("employee_acknowledgement", "Employee acknowledgement signed"),
          ],
        };
      case "access":
        return {
          id: step.id,
          items: [
            item("hub_access_scheduled", "Hub access auto-disable date set"),
            item("email_access", "Email access deactivated"),
            item("pos_access", "POS / venue systems deactivated"),
            item("building_access", "Building / door access deactivated"),
            item("other_apps", "Other apps deactivated"),
          ],
        };
      case "property":
        return {
          id: step.id,
          items: [
            item("laptop", "Laptop / computer received"),
            item("keys", "Keys received"),
            item("uniforms", "Uniforms received"),
            item("id_card", "ID card received"),
            item("other_property", "Other company property received"),
          ],
        };
      case "accommodation":
        return {
          id: step.id,
          items: [
            item("accommodation_keys", "Accommodation keys returned"),
            item("accommodation_cleaning", "Room cleaned and cleared"),
            item(
              "accommodation_other",
              "Other accommodation handover items completed",
            ),
          ],
        };
      case "benefits_cancel":
        return {
          id: step.id,
          items: [
            item("visa", "Visa cancelled (if applicable)"),
            item("work_permit", "Work permit cancelled (if applicable)"),
            item("medical_insurance", "Medical insurance cancelled (if applicable)"),
            item("other_benefits", "Other employment benefits cancelled"),
          ],
        };
      case "final_payment":
        return {
          id: step.id,
          items: [item("final_payment_processed", "Final payment processed")],
        };
      case "goodbye":
        return {
          id: step.id,
          items: [item("goodbye_email_sent", "Last goodbye email sent to employee")],
        };
      default:
        return { id: step.id, items: [] };
    }
  });
}

/** A stage is done when it has items and every item is done. */
export function isChecklistStepDone(
  step: OffboardingChecklistStepState,
): boolean {
  return step.items.length > 0 && step.items.every((row) => row.done);
}

export function checklistProgress(
  steps: OffboardingChecklistStepState[],
  options?: { excludeStepIds?: OffboardingChecklistStepId[] },
): {
  done: number;
  total: number;
} {
  const exclude = new Set(options?.excludeStepIds ?? []);
  const relevant = steps.filter((step) => !exclude.has(step.id));
  const total = relevant.length;
  const done = relevant.filter(isChecklistStepDone).length;
  return { done, total };
}

/** Ensure older session payloads still get the latest step/item shape. */
export function normalizeChecklist(
  existing: OffboardingChecklistStepState[] | null | undefined,
): OffboardingChecklistStepState[] {
  const defaults = createDefaultChecklist();
  if (!existing?.length) return defaults;

  return defaults.map((def) => {
    const prev = existing.find((row) => row.id === def.id);
    if (!prev) return def;
    return {
      id: def.id,
      items: def.items.map((defItem) => {
        const match = prev.items.find((row) => row.id === defItem.id);
        if (!match) return defItem;
        return {
          ...defItem,
          done: Boolean(match.done),
          doneAt: match.doneAt ?? (match.done ? new Date().toISOString() : null),
        };
      }),
    };
  });
}

export function toggleChecklistItem(
  steps: OffboardingChecklistStepState[],
  stepId: OffboardingChecklistStepId,
  itemId: string,
): OffboardingChecklistStepState[] {
  const now = new Date().toISOString();
  return steps.map((step) => {
    if (step.id !== stepId) return step;
    return {
      ...step,
      items: step.items.map((row) => {
        if (row.id !== itemId) return row;
        const done = !row.done;
        return { ...row, done, doneAt: done ? now : null };
      }),
    };
  });
}

export type OffboardingStaffSnapshot = {
  id: string;
  empNo: string;
  fullName: string;
  departmentName: string | null;
  positionName: string | null;
  employmentStatusId: string | null;
  employmentStatusName: string | null;
  joiningDate: string | null;
  terminationDate: string | null;
  terminationType: "resignation" | "termination" | null;
  wagePackage: number | null;
  basicSalary: number | null;
  provisionalEosb: number | null;
  workEmail: string | null;
  personalEmail: string | null;
  /** From staff.company_accommodation — gates the accommodation handover step. */
  inCompanyAccommodation: boolean;
  alBalance: number;
  phBalance: number;
};

export function defaultAutoAdjustments(
  kind: OffboardingTerminationKind,
): OffboardingAutoAdjustments {
  return {
    salaryToLastDay: true,
    annualLeavePayout: true,
    eosGratuity: true,
    publicHolidayBalance: true,
    noticePay: kind === "termination_with_notice",
  };
}

export function estimateDailyRate(wagePackage: number | null): number | null {
  if (wagePackage == null || wagePackage <= 0) return null;
  return Math.round((wagePackage / 30) * 100) / 100;
}

const DEFAULT_NOTICE_DAYS = 30;

export function buildSettlementPreview(input: {
  wagePackage: number | null;
  provisionalEosb: number | null;
  alBalance: number;
  phBalance: number;
  kind: OffboardingTerminationKind;
  leaveHandling: OffboardingLeaveHandling;
  autoAdjustments: OffboardingAutoAdjustments;
}): OffboardingSettlementPreview {
  const dailyRate = estimateDailyRate(input.wagePackage);
  const alDays = Math.max(0, round1(input.alBalance));
  const phDays = Math.max(0, round1(input.phBalance));

  const payLeave = input.leaveHandling === "pay_off";
  const alPayout =
    payLeave && input.autoAdjustments.annualLeavePayout && dailyRate != null
      ? round2(dailyRate * alDays)
      : payLeave && input.autoAdjustments.annualLeavePayout
        ? null
        : 0;
  const phPayout =
    payLeave && input.autoAdjustments.publicHolidayBalance && dailyRate != null
      ? round2(dailyRate * phDays)
      : payLeave && input.autoAdjustments.publicHolidayBalance
        ? null
        : 0;

  const eosGratuity = input.autoAdjustments.eosGratuity
    ? input.provisionalEosb
    : 0;

  const noticePayDays =
    input.autoAdjustments.noticePay &&
    input.kind === "termination_with_notice"
      ? DEFAULT_NOTICE_DAYS
      : 0;
  const noticePay =
    noticePayDays > 0 && dailyRate != null
      ? round2(dailyRate * noticePayDays)
      : noticePayDays > 0
        ? null
        : 0;

  const parts = [alPayout, phPayout, eosGratuity, noticePay];
  const estimatedTotal = parts.every((p) => p != null)
    ? round2(parts.reduce<number>((sum, p) => sum + (p ?? 0), 0))
    : null;

  return {
    dailyRate,
    alDays,
    phDays,
    alPayout,
    phPayout,
    eosGratuity,
    noticePayDays,
    noticePay,
    estimatedTotal,
  };
}

export function terminationKindLabel(kind: OffboardingTerminationKind): string {
  return (
    OFFBOARDING_TERMINATION_KIND_OPTIONS.find((o) => o.value === kind)?.label ??
    kind
  );
}

export function kindFromDirectoryType(
  type: "resignation" | "termination" | null,
): OffboardingTerminationKind | null {
  if (type === "resignation") return "resignation";
  if (type === "termination") return "immediate_termination";
  return null;
}

export function directoryTerminationTypeFromKind(
  kind: OffboardingTerminationKind,
): "resignation" | "termination" {
  return kind === "resignation" ? "resignation" : "termination";
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function newProcessId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `ob-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
