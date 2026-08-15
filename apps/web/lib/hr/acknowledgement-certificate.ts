import {
  DEFAULT_HR_ACKNOWLEDGEMENT_PAGE_SETTINGS,
  HR_EMAIL_ACKNOWLEDGEMENT_STATUS_LABELS,
  type HrAcknowledgementSentEmail,
  type HrEmailAcknowledgementRecord,
  type HrEmailAcknowledgementStatus,
} from "@/lib/hr/acknowledgement";
import {
  acknowledgementMessageHtml,
  acknowledgementMessageText,
} from "@/lib/hr/acknowledgement-email-preview";

const DUBAI_TZ = "Asia/Dubai";

export function certificateVenueHeading(venueName: string): string {
  const name = venueName.trim() || "Venue";
  if (/^orilla$/i.test(name)) return "Orilla Restaurant";
  return name;
}

export type AcknowledgementCertificateContent = {
  venueName: string;
  employeeName: string;
  empNo: string;
  department: string;
  position: string;
  employeeMetaLine: string;
  recipientEmail: string;
  emailKindLabel: string;
  subject: string;
  sentAtLabel: string;
  fromEmail: string;
  toEmail: string;
  messageText: string;
  messageHtml: string;
  status: HrEmailAcknowledgementStatus;
  statusLabel: string;
  respondedAtLabel: string;
  acknowledgedHow: string;
  comments: string;
  generatedAtLabel: string;
};

export function formatCertificateDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const formatted = new Intl.DateTimeFormat("en-GB", {
    timeZone: DUBAI_TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  return `${formatted} GST`;
}

export function formatCertificateEmployeeMeta(
  empNo?: string | null,
  department?: string | null,
  position?: string | null,
): string {
  return [
    empNo?.trim() || "—",
    department?.trim() || "—",
    position?.trim() || "—",
  ].join(" | ");
}

function sanitizeFilenamePart(value: string): string {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ");
}

export function buildAcknowledgementCertificateFilename(input: {
  staffName: string;
  empNo?: string | null;
  sentAt?: string | null;
}): string {
  const name = sanitizeFilenamePart(input.staffName) || "Employee";
  const empNo = sanitizeFilenamePart(input.empNo ?? "") || "NA";
  const sent = input.sentAt ? new Date(input.sentAt) : null;
  const stamp =
    sent && !Number.isNaN(sent.getTime())
      ? new Intl.DateTimeFormat("en-GB", {
          timeZone: DUBAI_TZ,
          day: "2-digit",
          month: "2-digit",
          year: "2-digit",
        }).format(sent).replace(/\//g, "-")
      : "undated";
  return `Acknowledgement Certificate - ${name} - ${empNo} (${stamp}).pdf`;
}

export function buildEmployeeAcknowledgementCertificatesFilename(input: {
  staffName: string;
  empNo?: string | null;
}): string {
  const name = sanitizeFilenamePart(input.staffName) || "Employee";
  const empNo = sanitizeFilenamePart(input.empNo ?? "") || "NA";
  return `Acknowledgement Register - ${name} - ${empNo}.pdf`;
}

export function employeeAcknowledgementProcessNote(): string {
  const ack = DEFAULT_HR_ACKNOWLEDGEMENT_PAGE_SETTINGS.acknowledgeButtonLabel;
  const decline = DEFAULT_HR_ACKNOWLEDGEMENT_PAGE_SETTINGS.declineButtonLabel;
  return `The employee acknowledged each message on the acknowledgement page. They opened the unique link included in the email and selected "${ack}" or "${decline}". The table above records which option was chosen, when it was confirmed, and any comments.`;
}

function acknowledgedHowText(
  record: HrEmailAcknowledgementRecord,
): string {
  const ack = DEFAULT_HR_ACKNOWLEDGEMENT_PAGE_SETTINGS.acknowledgeButtonLabel;
  const decline = DEFAULT_HR_ACKNOWLEDGEMENT_PAGE_SETTINGS.declineButtonLabel;

  if (record.status === "acknowledged") {
    return `The employee opened the unique acknowledgement link included in the email and selected “${ack}” on the acknowledgement page.`;
  }
  if (record.status === "not_acknowledged") {
    return `The employee opened the unique acknowledgement link included in the email and selected “${decline}” on the acknowledgement page.`;
  }
  return `Awaiting the employee to open the unique acknowledgement link included in the email and select “${ack}” or “${decline}”.`;
}

export function buildAcknowledgementCertificateContent(input: {
  venueName: string;
  record: HrEmailAcknowledgementRecord;
  email: HrAcknowledgementSentEmail | null;
  generatedAt?: Date;
  department?: string | null;
  position?: string | null;
}): AcknowledgementCertificateContent {
  const { venueName, record, email } = input;
  const messageHtml = acknowledgementMessageHtml(email);
  const messageText =
    acknowledgementMessageText(email) ||
    "The email body is not stored for this send.";
  const empNo = record.empNo?.trim() || "—";
  const department = input.department?.trim() || "—";
  const position = input.position?.trim() || "—";

  return {
    venueName: certificateVenueHeading(venueName),
    employeeName: record.staffName.trim() || "Unknown",
    empNo,
    department,
    position,
    employeeMetaLine: formatCertificateEmployeeMeta(empNo, department, position),
    recipientEmail:
      email?.to?.trim() || record.recipientEmail?.trim() || "—",
    emailKindLabel: record.emailKindLabel.trim() || "Email",
    subject: record.subject.trim() || "(No subject)",
    sentAtLabel: formatCertificateDateTime(email?.sentAt || record.sentAt),
    fromEmail: email?.from?.trim() || "—",
    toEmail: email?.to?.trim() || record.recipientEmail?.trim() || "—",
    messageText,
    messageHtml:
      messageHtml ||
      "The email body is not stored for this send.",
    status: record.status,
    statusLabel: HR_EMAIL_ACKNOWLEDGEMENT_STATUS_LABELS[record.status],
    respondedAtLabel:
      record.status === "pending"
        ? "Awaiting response"
        : formatCertificateDateTime(record.respondedAt),
    acknowledgedHow: acknowledgedHowText(record),
    comments: record.comments.trim(),
    generatedAtLabel: formatCertificateDateTime(
      (input.generatedAt ?? new Date()).toISOString(),
    ),
  };
}
