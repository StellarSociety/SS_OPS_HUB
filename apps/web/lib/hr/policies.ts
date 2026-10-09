import type { HrEmailAcknowledgementStatus } from "@/lib/hr/acknowledgement";
import type { PayslipEmailRecipientField } from "@/lib/hr/types";

// ---------------------------------------------------------------------------
// Policy templates: venue policies emailed to employees, each collecting its
// own acknowledgements. Policies live in hr_venue_settings (`policy_templates`);
// responses are hr_email_acknowledgements rows with email_kind
// `policy:<policyId>:v<version>`.
// ---------------------------------------------------------------------------

export type PolicyTemplate = {
  id: string;
  title: string;
  /** Short internal summary shown on the policy card. */
  description: string;
  subject: string;
  /** Rich HTML from the policy editor ("html"), or the older plain format. */
  message: string;
  format: "html" | "text";
  /** Bumped whenever the subject or message changes. */
  version: number;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type HrPolicySettings = {
  recipientField: PayslipEmailRecipientField;
  fromEmail: string;
  policies: PolicyTemplate[];
};

export const DEFAULT_HR_POLICY_SETTINGS: HrPolicySettings = {
  recipientField: "work_then_personal",
  fromEmail: "",
  policies: [],
};

export const POLICY_TEMPLATE_CODES = [
  { code: "{{EMPLOYEE_NAME}}", description: "Employee full name" },
  { code: "{{EMP_NO}}", description: "Employee number" },
  { code: "{{POSITION}}", description: "Employee position" },
  { code: "{{DEPARTMENT}}", description: "Employee department" },
  { code: "{{POLICY_TITLE}}", description: "This policy's title" },
  { code: "{{VENUE_NAME}}", description: "Venue display name" },
  { code: "{{USER_NAME}}", description: "Signed-in user sending this email" },
  { code: "{{TODAY}}", description: "Date the email is sent" },
] as const;

export const DEFAULT_POLICY_MESSAGE = `<p>Dear {{EMPLOYEE_NAME}},</p><p>Please read the {{POLICY_TITLE}} below carefully.</p><h2>Purpose</h2><p>[Policy text]</p><p>Once you have read and understood this policy, please confirm using the button below.</p><p>Sincerely,</p><p>{{USER_NAME}}<br>Human Resources<br>{{VENUE_NAME}}</p>`;

const POLICY_KIND_PREFIX = "policy:";

export function policyEmailKind(policyId: string, version: number): string {
  return `${POLICY_KIND_PREFIX}${policyId}:v${version}`;
}

/** Policy id and version from an acknowledgement email_kind, if it is one. */
export function parsePolicyEmailKind(
  kind: string,
): { policyId: string; version: number } | null {
  if (!kind.startsWith(POLICY_KIND_PREFIX)) return null;
  const [policyId, versionPart] = kind.slice(POLICY_KIND_PREFIX.length).split(":");
  if (!policyId) return null;
  const version = Number(String(versionPart ?? "").replace(/^v/, ""));
  return { policyId, version: Number.isFinite(version) && version > 0 ? version : 1 };
}

export function mergeHrPolicySettings(
  partial: Partial<HrPolicySettings> | null | undefined,
): HrPolicySettings {
  const allowed: PayslipEmailRecipientField[] = [
    "work",
    "personal",
    "work_then_personal",
  ];
  const recipientField = partial?.recipientField ?? "work_then_personal";
  const policies: PolicyTemplate[] = [];
  const seen = new Set<string>();
  for (const raw of Array.isArray(partial?.policies) ? partial.policies : []) {
    if (!raw || typeof raw !== "object") continue;
    const id = String(raw.id ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const now = new Date(0).toISOString();
    policies.push({
      id,
      title: String(raw.title ?? "").trim() || "Untitled policy",
      description: String(raw.description ?? "").trim(),
      subject: String(raw.subject ?? "").trim(),
      message: String(raw.message ?? ""),
      format: raw.format === "html" ? "html" : "text",
      version: Math.max(1, Math.floor(Number(raw.version) || 1)),
      archived: raw.archived === true,
      createdAt: String(raw.createdAt ?? now),
      updatedAt: String(raw.updatedAt ?? raw.createdAt ?? now),
    });
  }
  return {
    recipientField: allowed.includes(recipientField)
      ? recipientField
      : "work_then_personal",
    fromEmail: String(partial?.fromEmail ?? "").trim(),
    policies,
  };
}

export type PolicyAckCounts = {
  sent: number;
  acknowledged: number;
  pending: number;
  declined: number;
};

export type PolicySummary = PolicyTemplate & {
  /** Responses to the current version. */
  current: PolicyAckCounts;
  /** Emails sent for any version. */
  totalSent: number;
};

export type PolicyRecipientRecord = {
  id: string;
  staffId: string | null;
  staffName: string;
  empNo: string | null;
  recipientEmail: string | null;
  version: number;
  status: HrEmailAcknowledgementStatus;
  comments: string;
  sentAt: string;
  respondedAt: string | null;
  reminderCount: number;
};

/** One employee the policy can be sent to. */
export type PolicyStaffOption = {
  id: string;
  empNo: string;
  fullName: string;
  department: string | null;
  position: string | null;
  email: string | null;
  photoUrl: string | null;
};
