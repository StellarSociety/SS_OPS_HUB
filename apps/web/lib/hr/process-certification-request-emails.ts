import "server-only";

import { writeAuditLog } from "@/lib/audit";
import type { SendAppEmailAttachment } from "@/lib/email/transport/types";
import { recordOutboundStaffEmail } from "@/lib/email/record-staff-email";
import { sendAppEmail } from "@/lib/email/transport";
import { formatDateOnly } from "@/lib/hr/derived";
import { buildHrTemplateEmailHtml } from "@/lib/hr/email-logo";
import {
  inspectStaffEmailAttachments,
  loadStaffEmailAttachments,
  type StaffEmailAttachmentStatus,
} from "@/lib/hr/email-staff-attachments";
import {
  DEFAULT_IDENTITY_EMAIL_ATTACH_DOCUMENTS,
  normalizeEmailStaffDocumentKeys,
} from "@/lib/hr/email-staff-documents";
import {
  DEFAULT_CERTIFICATION_REQUEST_EMAIL_MESSAGE,
  DEFAULT_CERTIFICATION_REQUEST_EMAIL_SUBJECT,
  DEFAULT_HR_CERTIFICATION_REQUEST_EMAIL_SETTINGS,
  HR_MODULE_KEY,
  type CertificationType,
  type HrCertificationRequestEmailSettings,
  type HrEmailStaffDocumentKey,
} from "@/lib/hr/types";
import { createServiceClient } from "@/lib/supabase/service";
import type { SupabaseClient } from "@supabase/supabase-js";

export function mergeCertificationRequestEmailSettings(
  partial: Partial<HrCertificationRequestEmailSettings> | null | undefined,
): HrCertificationRequestEmailSettings {
  const base = DEFAULT_HR_CERTIFICATION_REQUEST_EMAIL_SETTINGS;
  let subject =
    String(partial?.subject ?? "").trim() ||
    DEFAULT_CERTIFICATION_REQUEST_EMAIL_SUBJECT;
  let message =
    String(partial?.message ?? "").trim() ||
    DEFAULT_CERTIFICATION_REQUEST_EMAIL_MESSAGE;

  // Migrate legacy templates (employee-addressed, or missing identity fields).
  const legacyEmployeeTemplate =
    message.includes("{{PROVIDER_DETAILS}}") ||
    (message.includes("Dear {{EMPLOYEE_NAME}}") &&
      !message.includes("{{PROVIDER_CONTACT}}"));
  const missingIdentityFields = !message.includes("{{PASSPORT_NO}}");
  if (legacyEmployeeTemplate || missingIdentityFields) {
    subject = DEFAULT_CERTIFICATION_REQUEST_EMAIL_SUBJECT;
    message = DEFAULT_CERTIFICATION_REQUEST_EMAIL_MESSAGE;
  }

  return {
    enabled:
      typeof partial?.enabled === "boolean" ? partial.enabled : base.enabled,
    fromEmail: String(partial?.fromEmail ?? base.fromEmail).trim(),
    subject,
    message,
    attachDocuments: normalizeEmailStaffDocumentKeys(
      partial?.attachDocuments,
      base.attachDocuments,
    ),
    requireAttachments:
      typeof partial?.requireAttachments === "boolean"
        ? partial.requireAttachments
        : base.requireAttachments,
  };
}

function applyEmailPlaceholders(
  template: string,
  vars: Record<string, string>,
): string {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(vars)) {
    normalized[key.toLowerCase()] = value;
  }
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    return normalized[key.toLowerCase()] ?? "";
  });
}

function formatCertificationsList(certs: CertificationType[]): string {
  if (certs.length === 0) return "• (No certifications selected.)";
  return certs.map((c) => `• ${c.name.trim() || c.label.trim()}`).join("\n");
}

function displayOrDash(value: string | null | undefined): string {
  const trimmed = String(value ?? "").trim();
  return trimmed || "—";
}

function displayDateOrDash(value: string | null | undefined): string {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "—";
  return formatDateOnly(trimmed) || "—";
}

export type CertificationRequestStaff = {
  id: string;
  emp_no: string;
  full_name: string;
  passport_no?: string | null;
  passport_expiry?: string | null;
  eid_no?: string | null;
  eid_expiry?: string | null;
  /** Passport origin — usually nationality name. */
  passport_origin?: string | null;
};

export type CertificationProviderEmailUnit = {
  /** Stable id for drafts / preview tabs: staffId::providerEmail */
  id: string;
  staff: CertificationRequestStaff;
  providerEmail: string;
  providerCompany: string;
  providerContact: string;
  certifications: CertificationType[];
};

export function certificationProviderEmailUnitId(
  staffId: string,
  providerEmail: string,
): string {
  return `${staffId}::${providerEmail.trim().toLowerCase()}`;
}

/**
 * Expand per-employee cert selections into one outbound unit per unique
 * provider email (contact_email on the certification type).
 */
export function buildCertificationProviderEmailUnits(
  staff: CertificationRequestStaff,
  certifications: CertificationType[],
):
  | { ok: true; units: CertificationProviderEmailUnit[] }
  | { ok: false; error: string } {
  if (certifications.length === 0) {
    return { ok: false, error: "Select at least one certification." };
  }

  const missingEmail = certifications.filter((c) => !c.contact_email.trim());
  if (missingEmail.length > 0) {
    const names = missingEmail
      .map((c) => c.label.trim() || c.name)
      .join(", ");
    return {
      ok: false,
      error: `No provider email on certification type(s): ${names}. Add contact email under Certifications → Details.`,
    };
  }

  const byEmail = new Map<string, CertificationType[]>();
  for (const cert of certifications) {
    const email = cert.contact_email.trim().toLowerCase();
    const list = byEmail.get(email) ?? [];
    list.push(cert);
    byEmail.set(email, list);
  }

  const units: CertificationProviderEmailUnit[] = [];
  for (const [emailKey, certs] of byEmail) {
    const primary = certs[0]!;
    const providerEmail = primary.contact_email.trim();
    units.push({
      id: certificationProviderEmailUnitId(staff.id, emailKey),
      staff,
      providerEmail,
      providerCompany: primary.provider_company.trim(),
      providerContact:
        primary.contact_person.trim() ||
        primary.provider_company.trim() ||
        "Provider",
      certifications: certs,
    });
  }

  return { ok: true, units };
}

export function buildCertificationRequestEmailVars(params: {
  staff: CertificationRequestStaff;
  venueName: string | null | undefined;
  userName: string;
  certifications: CertificationType[];
  providerCompany: string;
  providerContact: string;
}): Record<string, string> {
  const names = params.certifications.map(
    (c) => c.name.trim() || c.label.trim(),
  );
  return {
    PROVIDER_CONTACT: params.providerContact.trim() || "Provider",
    PROVIDER_COMPANY: params.providerCompany.trim(),
    EMPLOYEE_NAME: String(params.staff.full_name ?? "").trim() || "Colleague",
    EMP_NO: String(params.staff.emp_no ?? "").trim(),
    CERTIFICATIONS: formatCertificationsList(params.certifications),
    CERTIFICATION_NAMES: names.map((n) => `• ${n}`).join(", "),
    CERTIFICATIONS_COUNT: String(params.certifications.length),
    PASSPORT_NO: displayOrDash(params.staff.passport_no),
    PASSPORT_ORIGIN: displayOrDash(params.staff.passport_origin),
    PASSPORT_EXPIRY: displayDateOrDash(params.staff.passport_expiry),
    EID_NO: displayOrDash(params.staff.eid_no),
    EID_EXPIRY: displayDateOrDash(params.staff.eid_expiry),
    VENUE_NAME: params.venueName?.trim() || "Our team",
    USER_NAME: params.userName.trim() || "Human Resources",
  };
}

export function composeCertificationRequestEmailContent(params: {
  settings: HrCertificationRequestEmailSettings;
  vars: Record<string, string>;
  providerEmail: string;
  draft?: { to?: string; subject?: string; body?: string } | null;
}): { to: string | null; subject: string; body: string } {
  const to =
    String(params.draft?.to ?? "").trim() ||
    params.providerEmail.trim() ||
    null;
  const subject =
    String(params.draft?.subject ?? "").trim() ||
    applyEmailPlaceholders(params.settings.subject, params.vars);
  const body =
    String(params.draft?.body ?? "").trim() ||
    applyEmailPlaceholders(params.settings.message, params.vars);
  return { to, subject, body };
}

export type IdentityAttachmentStatus = StaffEmailAttachmentStatus;

export async function inspectStaffIdentityAttachments(
  supabase: SupabaseClient,
  venueId: string,
  staffId: string,
  keys: readonly HrEmailStaffDocumentKey[] = DEFAULT_IDENTITY_EMAIL_ATTACH_DOCUMENTS,
): Promise<IdentityAttachmentStatus[]> {
  return inspectStaffEmailAttachments(supabase, venueId, staffId, keys);
}

export async function loadStaffIdentityEmailAttachments(params: {
  supabase: SupabaseClient;
  venueId: string;
  staffId: string;
  empNo: string;
  keys?: readonly HrEmailStaffDocumentKey[];
  requireAll?: boolean;
}): Promise<
  | { ok: true; attachments: SendAppEmailAttachment[]; status: IdentityAttachmentStatus[] }
  | { ok: false; error: string; status: IdentityAttachmentStatus[] }
> {
  return loadStaffEmailAttachments({
    supabase: params.supabase,
    venueId: params.venueId,
    staffId: params.staffId,
    empNo: params.empNo,
    keys: params.keys ?? DEFAULT_IDENTITY_EMAIL_ATTACH_DOCUMENTS,
    requireAll: params.requireAll,
  });
}

export async function deliverCertificationRequestEmail(params: {
  venue: {
    id: string;
    name?: string | null;
    slug?: string | null;
    logo_url?: string | null;
  };
  unit: CertificationProviderEmailUnit;
  settings: HrCertificationRequestEmailSettings;
  userName: string;
  actorId: string | null;
  supabase?: SupabaseClient;
  draft?: { to?: string; subject?: string; body?: string } | null;
}): Promise<{ ok: true; to: string } | { ok: false; error: string }> {
  if (!params.settings.enabled) {
    return {
      ok: false,
      error: "Certification request emails are disabled.",
    };
  }

  if (params.unit.certifications.length === 0) {
    return {
      ok: false,
      error: "Select at least one certification to request.",
    };
  }

  const vars = buildCertificationRequestEmailVars({
    staff: params.unit.staff,
    venueName: params.venue.name,
    userName: params.userName,
    certifications: params.unit.certifications,
    providerCompany: params.unit.providerCompany,
    providerContact: params.unit.providerContact,
  });
  const composed = composeCertificationRequestEmailContent({
    settings: params.settings,
    vars,
    providerEmail: params.unit.providerEmail,
    draft: params.draft,
  });
  if (!composed.to) {
    return {
      ok: false,
      error: "No provider email for this certification request.",
    };
  }

  const supabase = params.supabase ?? createServiceClient();

  const identity = await loadStaffIdentityEmailAttachments({
    supabase,
    venueId: params.venue.id,
    staffId: params.unit.staff.id,
    empNo: params.unit.staff.emp_no,
    keys: params.settings.attachDocuments,
    requireAll: params.settings.requireAttachments,
  });
  if (!identity.ok) {
    return { ok: false, error: identity.error };
  }

  try {
    const { html, inlineAttachments } = await buildHrTemplateEmailHtml({
      body: composed.body,
      venue: {
        ...params.venue,
        slug: params.venue.slug ?? "",
      },
    });

    const attachments: SendAppEmailAttachment[] = [
      ...inlineAttachments,
      ...identity.attachments,
    ];

    const sendResult = await sendAppEmail(
      {
        to: composed.to,
        subject: composed.subject,
        html,
        attachments: attachments.length > 0 ? attachments : undefined,
        fromOverride: params.settings.fromEmail || undefined,
      },
      { venueId: params.venue.id, supabase },
    );

    const auditId = await writeAuditLog({
      actor_id: params.actorId,
      action: "certification_request_email.sent",
      module_key: HR_MODULE_KEY,
      entity: "staff",
      entity_id: params.unit.staff.id,
      venue_id: params.venue.id,
      after: {
        to: composed.to,
        providerCompany: params.unit.providerCompany,
        certificationIds: params.unit.certifications.map((c) => c.id),
        certificationNames: params.unit.certifications.map((c) => c.name),
        attachments: identity.status.map((s) => s.fileName).filter(Boolean),
      },
    });

    if (sendResult.messageId && auditId) {
      await recordOutboundStaffEmail({
        supabase,
        venueId: params.venue.id,
        staffId: params.unit.staff.id,
        rfcMessageId: sendResult.messageId,
        subject: composed.subject,
        fromEmail: params.settings.fromEmail || null,
        toEmail: composed.to,
        bodyHtml: html,
        bodyText: composed.body,
        sourceKind: "audit",
        sourceId: auditId,
      });
    }

    return { ok: true, to: composed.to };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not send certification request email.",
    };
  }
}
