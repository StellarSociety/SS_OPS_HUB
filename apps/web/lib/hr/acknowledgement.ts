import { publicAppUrl } from "@/lib/public-app-url";

/**
 * Email acknowledgement page template + record shapes.
 * Page copy lives in hr_venue_settings (`acknowledgement_page`).
 * Records live in public.hr_email_acknowledgements.
 */

export type HrEmailAcknowledgementStatus =
  | "pending"
  | "acknowledged"
  | "not_acknowledged";

export const HR_EMAIL_ACKNOWLEDGEMENT_STATUS_LABELS: Record<
  HrEmailAcknowledgementStatus,
  string
> = {
  pending: "Pending",
  acknowledged: "Acknowledged",
  not_acknowledged: "Not acknowledged",
};

export type HrAcknowledgementPageSettings = {
  heading: string;
  intro: string;
  emailButtonLabel: string;
  acknowledgeButtonLabel: string;
  declineButtonLabel: string;
  commentsPrompt: string;
  submittedHeading: string;
  submittedMessage: string;
};

export const ACKNOWLEDGEMENT_PAGE_TEMPLATE_CODES = [
  { code: "{{EMPLOYEE_NAME}}", description: "Recipient full name" },
  { code: "{{EMPLOYEE_EMAIL}}", description: "Recipient email address" },
  { code: "{{SUBJECT}}", description: "Subject of the email they received" },
  { code: "{{VENUE_NAME}}", description: "Venue / company display name" },
] as const;

export const DEFAULT_HR_ACKNOWLEDGEMENT_PAGE_SETTINGS: HrAcknowledgementPageSettings =
  {
    heading: "Please acknowledge",
    intro: `Dear {{EMPLOYEE_NAME}},

Please confirm that you have read and understood the information below.`,
    emailButtonLabel: "Click here to verify",
    acknowledgeButtonLabel: "I Acknowledge",
    declineButtonLabel: "I do not Acknowledge",
    commentsPrompt: "Please tell us why you do not acknowledge.",
    submittedHeading: "Thank you",
    submittedMessage:
      "Your response has been recorded. You can close this page.",
  };

export type HrEmailAcknowledgementRecord = {
  id: string;
  token: string;
  venueId: string;
  staffId: string | null;
  staffName: string;
  empNo: string | null;
  recipientEmail: string | null;
  emailKind: string;
  emailKindLabel: string;
  subject: string;
  status: HrEmailAcknowledgementStatus;
  comments: string;
  sentAt: string;
  respondedAt: string | null;
  reminderCount: number;
};

export type HrAcknowledgementSentEmail = {
  to: string | null;
  from: string | null;
  subject: string;
  sentAt: string;
  html: string | null;
  text: string | null;
  staffName: string;
  emailKindLabel: string;
};

export type AcknowledgementSendHistoryItem = {
  id: string;
  kind: "original" | "reminder";
  label: string;
  sentAt: string;
  to: string | null;
  from: string | null;
  subject: string;
  bodyHtml: string | null;
  bodyText: string | null;
};

export type AcknowledgementSendHistory = {
  staffName: string;
  emailKindLabel: string;
  reminderCount: number;
  items: AcknowledgementSendHistoryItem[];
};

export type HrAcknowledgementReminderSettings = {
  firstReminderDay: number;
  secondReminderDay: number;
  dailyAfterSecond: boolean;
  subject: string;
  body: string;
};

export const ACKNOWLEDGEMENT_REMINDER_TEMPLATE_CODES = [
  { code: "{{EMPLOYEE_NAME}}", description: "Recipient full name" },
  { code: "{{EMPLOYEE_EMAIL}}", description: "Recipient email address" },
  { code: "{{SUBJECT}}", description: "Original email subject" },
  { code: "{{VENUE_NAME}}", description: "Venue / company display name" },
  { code: "{{REMINDER_LABEL}}", description: "1st Reminder, 2nd Reminder, …" },
  { code: "{{REMINDER_NUMBER}}", description: "Reminder number (1, 2, 3, …)" },
] as const;

export const DEFAULT_HR_ACKNOWLEDGEMENT_REMINDER_SETTINGS: HrAcknowledgementReminderSettings =
  {
    firstReminderDay: 5,
    secondReminderDay: 7,
    dailyAfterSecond: true,
    subject: "{{REMINDER_LABEL}}: please acknowledge — {{SUBJECT}}",
    body: `Dear {{EMPLOYEE_NAME}},

This is your {{REMINDER_LABEL}}. You have not yet responded to the acknowledgement request for:

{{SUBJECT}}

Acknowledgement is necessary and mandatory. Please open the button below and confirm that you have read and understood the message.

Thank you,
{{VENUE_NAME}}`,
  };

function clampReminderDay(value: unknown, fallback: number): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, 365);
}

export function mergeAcknowledgementReminderSettings(
  partial: Partial<HrAcknowledgementReminderSettings> | null | undefined,
): HrAcknowledgementReminderSettings {
  const firstReminderDay = clampReminderDay(
    partial?.firstReminderDay,
    DEFAULT_HR_ACKNOWLEDGEMENT_REMINDER_SETTINGS.firstReminderDay,
  );
  let secondReminderDay = clampReminderDay(
    partial?.secondReminderDay,
    DEFAULT_HR_ACKNOWLEDGEMENT_REMINDER_SETTINGS.secondReminderDay,
  );
  if (secondReminderDay <= firstReminderDay) {
    secondReminderDay = Math.min(365, firstReminderDay + 1);
  }
  return {
    firstReminderDay,
    secondReminderDay,
    dailyAfterSecond: partial?.dailyAfterSecond !== false,
    subject:
      String(partial?.subject ?? "").trim() ||
      DEFAULT_HR_ACKNOWLEDGEMENT_REMINDER_SETTINGS.subject,
    body:
      String(partial?.body ?? "").trim() ||
      DEFAULT_HR_ACKNOWLEDGEMENT_REMINDER_SETTINGS.body,
  };
}

export function readRequiresAcknowledgement(value: unknown): boolean {
  return value === true;
}

export function mergeAcknowledgementPageSettings(
  partial: Partial<HrAcknowledgementPageSettings> | null | undefined,
): HrAcknowledgementPageSettings {
  const base = DEFAULT_HR_ACKNOWLEDGEMENT_PAGE_SETTINGS;
  return {
    heading:
      String(partial?.heading ?? "").trim() || base.heading,
    intro: String(partial?.intro ?? "").trim() || base.intro,
    emailButtonLabel:
      String(partial?.emailButtonLabel ?? "").trim() || base.emailButtonLabel,
    acknowledgeButtonLabel:
      String(partial?.acknowledgeButtonLabel ?? "").trim() ||
      base.acknowledgeButtonLabel,
    declineButtonLabel:
      String(partial?.declineButtonLabel ?? "").trim() ||
      base.declineButtonLabel,
    commentsPrompt:
      String(partial?.commentsPrompt ?? "").trim() || base.commentsPrompt,
    submittedHeading:
      String(partial?.submittedHeading ?? "").trim() || base.submittedHeading,
    submittedMessage:
      String(partial?.submittedMessage ?? "").trim() || base.submittedMessage,
  };
}

export function applyAcknowledgementPlaceholders(
  template: string,
  vars: {
    employeeName?: string;
    employeeEmail?: string;
    subject?: string;
    venueName?: string;
    reminderLabel?: string;
    reminderNumber?: string | number;
  },
): string {
  const normalized: Record<string, string> = {
    employee_name: String(vars.employeeName ?? "").trim(),
    employee_email: String(vars.employeeEmail ?? "").trim(),
    subject: String(vars.subject ?? "").trim(),
    venue_name: String(vars.venueName ?? "").trim(),
    reminder_label: String(vars.reminderLabel ?? "").trim(),
    reminder_number: String(vars.reminderNumber ?? "").trim(),
  };
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    return normalized[key.toLowerCase()] ?? "";
  });
}

export function resolveAcknowledgementButtonLabel(
  template: string,
  vars: {
    employeeName?: string;
    employeeEmail?: string;
    subject?: string;
    venueName?: string;
  },
): string {
  const source =
    String(template ?? "").trim() ||
    DEFAULT_HR_ACKNOWLEDGEMENT_PAGE_SETTINGS.emailButtonLabel;
  const resolved = applyAcknowledgementPlaceholders(source, vars)
    .replace(/\s+/g, " ")
    .trim();
  return (
    resolved || DEFAULT_HR_ACKNOWLEDGEMENT_PAGE_SETTINGS.emailButtonLabel
  );
}

export function acknowledgementPublicUrl(token: string): string {
  return `${publicAppUrl()}/acknowledge/${encodeURIComponent(token)}`;
}

export function formatReminderOrdinal(count: number): string {
  const n = Math.max(1, Math.floor(count));
  const remainder = n % 100;
  if (remainder >= 11 && remainder <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export function acknowledgementReminderLabel(count: number): string {
  return `${formatReminderOrdinal(count)} Reminder`;
}

export function acknowledgementReminderSubject(
  originalSubject: string,
  reminderNumber: number,
  settings?: Partial<HrAcknowledgementReminderSettings> | null,
): string {
  const merged = mergeAcknowledgementReminderSettings(settings);
  const subject = originalSubject.trim() || "(No subject)";
  const resolved = applyAcknowledgementPlaceholders(merged.subject, {
    subject,
    reminderLabel: acknowledgementReminderLabel(reminderNumber),
    reminderNumber,
  })
    .replace(/\s+/g, " ")
    .trim();
  return (
    resolved ||
    `${acknowledgementReminderLabel(reminderNumber)}: please acknowledge — ${subject}`
  );
}

export function acknowledgementReminderBody(params: {
  employeeName: string;
  employeeEmail?: string;
  subject: string;
  venueName: string;
  reminderNumber: number;
  settings?: Partial<HrAcknowledgementReminderSettings> | null;
}): string {
  const merged = mergeAcknowledgementReminderSettings(params.settings);
  const resolved = applyAcknowledgementPlaceholders(merged.body, {
    employeeName: params.employeeName.trim() || "Team member",
    employeeEmail: params.employeeEmail,
    subject: params.subject.trim() || "the message we sent you",
    venueName: params.venueName,
    reminderLabel: acknowledgementReminderLabel(params.reminderNumber),
    reminderNumber: params.reminderNumber,
  }).trim();
  if (resolved) return resolved;

  const name = params.employeeName.trim() || "Team member";
  const subject = params.subject.trim() || "the message we sent you";
  const venue = params.venueName.trim();
  const label = acknowledgementReminderLabel(params.reminderNumber);
  return [
    `Dear ${name},`,
    "",
    `This is your ${label}. You have not yet responded to the acknowledgement request for:`,
    "",
    subject,
    "",
    "Acknowledgement is necessary and mandatory. Please open the button below and confirm that you have read and understood the message.",
    venue ? "" : null,
    venue ? `Thank you,\n${venue}` : "Thank you.",
  ]
    .filter((line) => line !== null)
    .join("\n");
}

export function buildAcknowledgementButtonHtml(params: {
  url: string;
  buttonLabel: string;
  backgroundColor?: string;
}): string {
  const label = escapeHtml(params.buttonLabel || "Click here to verify");
  const href = escapeHtml(params.url);
  const bg = /^#[0-9a-fA-F]{6}$/.test(params.backgroundColor ?? "")
    ? params.backgroundColor!
    : "#818a40";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;width:100%;margin-top:8px;">
  <tr>
    <td align="center" style="padding:20px 0 8px;font-family:Arial,Helvetica,sans-serif;">
      <a href="${href}" target="_blank" rel="noopener noreferrer" style="display:inline-block;background:${bg};color:#ffffff;padding:12px 22px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:bold;line-height:1.2;">${label}</a>
    </td>
  </tr>
</table>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function parseAcknowledgementStatus(
  value: unknown,
): HrEmailAcknowledgementStatus {
  if (value === "acknowledged" || value === "not_acknowledged") return value;
  return "pending";
}

function field(row: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

export function parseAcknowledgementRecord(
  raw: unknown,
): HrEmailAcknowledgementRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const token = field(row, "token");
  const venueId = field(row, "venueId", "venue_id");
  if (!token || !venueId) return null;
  const id = field(row, "id") || token;
  return {
    id,
    token,
    venueId,
    staffId: field(row, "staffId", "staff_id") || null,
    staffName: field(row, "staffName", "staff_name") || "Unknown",
    empNo: field(row, "empNo", "emp_no") || null,
    recipientEmail: field(row, "recipientEmail", "recipient_email") || null,
    emailKind: field(row, "emailKind", "email_kind") || "email",
    emailKindLabel:
      field(row, "emailKindLabel", "email_kind_label") ||
      field(row, "emailKind", "email_kind") ||
      "Email",
    subject: field(row, "subject") || "(No subject)",
    status: parseAcknowledgementStatus(row.status),
    comments: String(row.comments ?? ""),
    sentAt:
      field(row, "sentAt", "sent_at") || new Date().toISOString(),
    respondedAt: field(row, "respondedAt", "responded_at") || null,
    reminderCount: Math.max(
      0,
      Math.floor(Number(row.reminderCount ?? row.reminder_count ?? 0)) || 0,
    ),
  };
}
