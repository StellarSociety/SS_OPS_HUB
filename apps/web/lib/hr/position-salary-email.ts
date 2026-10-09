import type { PayslipEmailRecipientField } from "@/lib/hr/types";

// ---------------------------------------------------------------------------
// Promotion / demotion / increment / decrement letters, sent from
// Staff → Promotions. Templates live in Settings → Emails → Other templates.
// ---------------------------------------------------------------------------

export const POSITION_SALARY_EMAIL_KINDS = [
  "promotion",
  "demotion",
  "increment",
  "decrement",
] as const;

export type PositionSalaryEmailKind =
  (typeof POSITION_SALARY_EMAIL_KINDS)[number];

export const POSITION_SALARY_EMAIL_KIND_LABELS: Record<
  PositionSalaryEmailKind,
  string
> = {
  promotion: "Promotion",
  demotion: "Demotion",
  increment: "Increment",
  decrement: "Decrement",
};

export const POSITION_SALARY_EMAIL_KIND_HINTS: Record<
  PositionSalaryEmailKind,
  string
> = {
  promotion: "Promotion and change of position",
  demotion: "Position adjustment to a lower role",
  increment: "Salary increase confirmation",
  decrement: "Salary decrease confirmation",
};

export function isPositionSalaryEmailKind(
  value: string,
): value is PositionSalaryEmailKind {
  return (POSITION_SALARY_EMAIL_KINDS as readonly string[]).includes(value);
}

export type PositionSalaryEmailTemplate = {
  subject: string;
  message: string;
  requiresAcknowledgement: boolean;
};

export type HrPositionSalaryEmailSettings = {
  enabled: boolean;
  recipientField: PayslipEmailRecipientField;
  fromEmail: string;
  /** Name used for {{COMPANY_NAME}}; blank uses the venue's legal entity. */
  companyName: string;
  templates: Record<PositionSalaryEmailKind, PositionSalaryEmailTemplate>;
};

export const POSITION_SALARY_EMAIL_TEMPLATE_CODES = [
  { code: "{{EMPLOYEE_NAME}}", description: "Employee full name" },
  { code: "{{EMP_NO}}", description: "Employee number" },
  { code: "{{EFFECTIVE_DATE}}", description: "Effective date of the change" },
  { code: "{{CURRENT_POSITION}}", description: "Position before the change" },
  { code: "{{NEW_POSITION}}", description: "Position after the change" },
  { code: "{{CURRENT_SALARY}}", description: "Monthly wage package before" },
  { code: "{{NEW_SALARY}}", description: "Monthly wage package after" },
  { code: "{{COMPANY_NAME}}", description: "Company name (set above)" },
  { code: "{{VENUE_NAME}}", description: "Venue display name" },
  { code: "{{USER_NAME}}", description: "Signed-in user sending this email" },
] as const;

const SIGN_OFF = `Sincerely,

{{USER_NAME}}
Human Resources
{{COMPANY_NAME}}`;

export const DEFAULT_POSITION_SALARY_EMAIL_TEMPLATES: Record<
  PositionSalaryEmailKind,
  PositionSalaryEmailTemplate
> = {
  promotion: {
    subject: "Promotion and Change of Position",
    message: `Dear {{EMPLOYEE_NAME}},

This letter serves to formally inform you of a change in your job position with {{COMPANY_NAME}}, effective {{EFFECTIVE_DATE}}.

Following recent performance reviews and management assessment, we are pleased to recognize your performance, commitment, and contribution to the company. Based on your demonstrated capabilities and suitability for increased responsibilities, management has decided to promote you to the position of {{NEW_POSITION}}.

In your new position, you will assume the responsibilities and duties associated with the role and will be expected to maintain the required standards while continuing to contribute positively to the team and the overall operations of the company.

Your revised salary will be AED {{NEW_SALARY}} per month, effective {{EFFECTIVE_DATE}}. All other terms and conditions of your employment remain unchanged unless otherwise stated.

We congratulate you on your promotion and look forward to your continued commitment, development, and contribution to the company in your new position.

Please acknowledge receipt and understanding of this notice using the button below.

${SIGN_OFF}`,
    requiresAcknowledgement: true,
  },
  demotion: {
    subject: "Position Adjustment",
    message: `Dear {{EMPLOYEE_NAME}},

This letter serves to formally inform you of a change in your job position with {{COMPANY_NAME}}, effective {{EFFECTIVE_DATE}}.

Following recent performance reviews and management assessment, it has been determined that your current performance does not meet the expectations and requirements of your present role as {{CURRENT_POSITION}}. Despite prior feedback and opportunities for improvement, the required standards have not been consistently achieved.

As a result, management has decided to reassign you to the position of {{NEW_POSITION}}. This adjustment is intended to better align your responsibilities with your current performance level and to provide you with the opportunity to improve and demonstrate your capabilities.

Your revised salary will be AED {{NEW_SALARY}} per month, effective {{EFFECTIVE_DATE}}. All other terms and conditions of your employment remain unchanged unless otherwise stated.

We encourage you to treat this as an opportunity to refocus and improve your performance. Continued failure to meet company standards may result in further disciplinary action, up to and including termination of employment.

Please acknowledge receipt and understanding of this notice using the button below.

${SIGN_OFF}`,
    requiresAcknowledgement: true,
  },
  increment: {
    subject: "Salary Increase Confirmation",
    message: `Dear {{EMPLOYEE_NAME}},

We are pleased to inform you that, in recognition of your performance and contributions to the company, your salary has been revised.

Effective {{EFFECTIVE_DATE}}, your monthly salary will be increased from AED {{CURRENT_SALARY}} to AED {{NEW_SALARY}}.

All other terms and conditions of your employment contract remain unchanged and in full effect. This adjustment reflects our appreciation for your efforts and our confidence in your continued performance and commitment.

Please acknowledge receipt and acceptance of this salary revision using the button below.

Congratulations, and we look forward to your continued success with the company.

${SIGN_OFF}`,
    requiresAcknowledgement: true,
  },
  decrement: {
    subject: "Salary Decrease Confirmation",
    message: `Dear {{EMPLOYEE_NAME}},

We wish to inform you that, following a review of your employment terms and business requirements, your monthly salary has been revised.

Effective {{EFFECTIVE_DATE}}, your monthly salary will be revised from AED {{CURRENT_SALARY}} to AED {{NEW_SALARY}}.

This revision has been discussed with you and will be effective from the date mentioned above. Accordingly, your salary for the respective month will be processed based on the revised salary amount. All other terms and conditions of your employment contract shall remain unchanged and continue in full force and effect unless otherwise agreed in writing.

Kindly acknowledge your receipt and acceptance of this salary revision using the button below.

Should you have any questions regarding this revision, please contact the Human Resources department.

${SIGN_OFF}`,
    requiresAcknowledgement: true,
  },
};

export const DEFAULT_HR_POSITION_SALARY_EMAIL_SETTINGS: HrPositionSalaryEmailSettings =
  {
    enabled: true,
    recipientField: "work_then_personal",
    fromEmail: "",
    companyName: "",
    templates: DEFAULT_POSITION_SALARY_EMAIL_TEMPLATES,
  };

export function mergePositionSalaryEmailSettings(
  partial: Partial<HrPositionSalaryEmailSettings> | null | undefined,
): HrPositionSalaryEmailSettings {
  const base = DEFAULT_HR_POSITION_SALARY_EMAIL_SETTINGS;
  const allowed: PayslipEmailRecipientField[] = [
    "work",
    "personal",
    "work_then_personal",
  ];
  const recipientField = partial?.recipientField ?? base.recipientField;
  const stored = (partial?.templates ?? {}) as Partial<
    Record<PositionSalaryEmailKind, Partial<PositionSalaryEmailTemplate>>
  >;
  const templates = {} as HrPositionSalaryEmailSettings["templates"];
  for (const kind of POSITION_SALARY_EMAIL_KINDS) {
    const row = stored[kind] ?? {};
    const fallback = base.templates[kind];
    templates[kind] = {
      subject: String(row.subject ?? "").trim() || fallback.subject,
      message: String(row.message ?? "").trim() || fallback.message,
      requiresAcknowledgement:
        typeof row.requiresAcknowledgement === "boolean"
          ? row.requiresAcknowledgement
          : fallback.requiresAcknowledgement,
    };
  }
  return {
    enabled:
      typeof partial?.enabled === "boolean" ? partial.enabled : base.enabled,
    recipientField: allowed.includes(recipientField)
      ? recipientField
      : base.recipientField,
    fromEmail: String(partial?.fromEmail ?? "").trim(),
    companyName: String(partial?.companyName ?? "").trim(),
    templates,
  };
}

/**
 * Template that best fits a change: a position move is a promotion or a
 * demotion; a salary-only change is an increment or a decrement.
 */
export function suggestPositionSalaryEmailKind(change: {
  changeKind: "position" | "salary" | "both";
  isPromotion: boolean;
  fromWagePackage: number | null;
  toWagePackage: number | null;
}): PositionSalaryEmailKind {
  if (change.changeKind !== "salary") {
    return change.isPromotion ? "promotion" : "demotion";
  }
  const from = change.fromWagePackage ?? 0;
  const to = change.toWagePackage ?? 0;
  return to < from ? "decrement" : "increment";
}

/** Latest letter sent or scheduled for one position / salary change. */
export type PositionSalaryEmailRecord = {
  id: string;
  changeId: string;
  kind: PositionSalaryEmailKind;
  status: "scheduled" | "sent" | "cancelled";
  to: string;
  subject: string;
  sentAt: string | null;
  scheduledAt: string | null;
};
