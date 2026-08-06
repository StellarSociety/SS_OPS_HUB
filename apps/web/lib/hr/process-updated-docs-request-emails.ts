import "server-only";

import { writeAuditLog } from "@/lib/audit";
import { recordOutboundStaffEmail } from "@/lib/email/record-staff-email";
import { sendAppEmail } from "@/lib/email/transport";
import { formatDateOnly } from "@/lib/hr/derived";
import { buildHrTemplateEmailHtml } from "@/lib/hr/email-logo";
import {
  getMissingDetailLabels,
  type MissingDetailStaffInput,
} from "@/lib/hr/missing-details";
import {
  DEFAULT_HR_UPDATED_DOCS_REQUEST_EMAIL_SETTINGS,
  DEFAULT_UPDATED_DOCS_REQUEST_EMAIL_MESSAGE,
  DEFAULT_UPDATED_DOCS_REQUEST_EMAIL_SUBJECT,
  HR_MODULE_KEY,
  type HrUpdatedDocsRequestEmailSettings,
  type PayslipEmailRecipientField,
} from "@/lib/hr/types";
import { createServiceClient } from "@/lib/supabase/service";
import type { SupabaseClient } from "@supabase/supabase-js";

export type UpdatedDocsExpiryContext = {
  label: string;
  expiryDate: string;
  daysUntil: number;
};

export function mergeUpdatedDocsRequestEmailSettings(
  partial: Partial<HrUpdatedDocsRequestEmailSettings> | null | undefined,
): HrUpdatedDocsRequestEmailSettings {
  const base = DEFAULT_HR_UPDATED_DOCS_REQUEST_EMAIL_SETTINGS;
  const recipientField = (partial?.recipientField ??
    base.recipientField) as PayslipEmailRecipientField;
  const allowed: PayslipEmailRecipientField[] = [
    "work",
    "personal",
    "work_then_personal",
  ];
  return {
    enabled:
      typeof partial?.enabled === "boolean" ? partial.enabled : base.enabled,
    recipientField: allowed.includes(recipientField)
      ? recipientField
      : base.recipientField,
    fromEmail: String(partial?.fromEmail ?? base.fromEmail).trim(),
    subject:
      String(partial?.subject ?? "").trim() ||
      DEFAULT_UPDATED_DOCS_REQUEST_EMAIL_SUBJECT,
    message:
      String(partial?.message ?? "").trim() ||
      DEFAULT_UPDATED_DOCS_REQUEST_EMAIL_MESSAGE,
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

function daysStatusLabel(daysUntil: number): string {
  if (daysUntil < 0) {
    const n = Math.abs(daysUntil);
    return `${n} day${n === 1 ? "" : "s"} overdue`;
  }
  if (daysUntil === 0) return "expires today";
  return `in ${daysUntil} day${daysUntil === 1 ? "" : "s"}`;
}

function formatMissingDetailsList(labels: string[]): string {
  if (labels.length === 0) {
    return "• (No additional missing profile fields were detected.)";
  }
  return labels.map((label) => `• ${label}`).join("\n");
}

/**
 * Build the request list: expiry-driven update (when provided) plus any
 * currently missing profile fields for this employee.
 */
export function buildUpdatedDocsRequestItems(params: {
  staff: MissingDetailStaffInput;
  expiry?: UpdatedDocsExpiryContext | null;
}): string[] {
  const items: string[] = [];
  const missing = getMissingDetailLabels(params.staff);

  if (params.expiry) {
    const expiryLine = `Updated ${params.expiry.label} (expiry ${formatDateOnly(params.expiry.expiryDate)} — ${daysStatusLabel(params.expiry.daysUntil)})`;
    items.push(expiryLine);
    for (const label of missing) {
      // Avoid duplicating the same document label when the expiry field is also empty.
      const normalized = label.toLowerCase();
      const expiryLabel = params.expiry.label.toLowerCase();
      if (
        normalized === expiryLabel ||
        normalized.includes(expiryLabel) ||
        expiryLabel.includes(normalized.replace(/\.$/, ""))
      ) {
        continue;
      }
      items.push(label);
    }
    return items;
  }

  return missing;
}

export function buildUpdatedDocsRequestEmailVars(params: {
  staff: MissingDetailStaffInput;
  venueName: string | null | undefined;
  userName: string;
  expiry?: UpdatedDocsExpiryContext | null;
}): Record<string, string> {
  const requestItems = buildUpdatedDocsRequestItems({
    staff: params.staff,
    expiry: params.expiry,
  });
  const expiry = params.expiry;

  return {
    EMPLOYEE_NAME: String(params.staff.full_name ?? "").trim() || "Colleague",
    EMP_NO: String(params.staff.emp_no ?? "").trim(),
    MISSING_DETAILS: formatMissingDetailsList(requestItems),
    MISSING_DETAILS_COUNT: String(requestItems.length),
    DOC_LABEL: expiry?.label?.trim() || "",
    EXPIRY_DATE: expiry ? formatDateOnly(expiry.expiryDate) : "",
    DAYS_STATUS: expiry ? daysStatusLabel(expiry.daysUntil) : "",
    VENUE_NAME: params.venueName?.trim() || "Our team",
    USER_NAME: params.userName.trim() || "Human Resources",
  };
}

export function composeUpdatedDocsRequestEmailContent(params: {
  settings: HrUpdatedDocsRequestEmailSettings;
  vars: Record<string, string>;
  staff: { work_email: string | null; personal_email: string | null };
  draft?: { to?: string; subject?: string; body?: string } | null;
}): { to: string | null; subject: string; body: string } {
  const resolvedTo = resolveUpdatedDocsRequestRecipient(
    params.settings.recipientField,
    params.staff,
  );
  const to = String(params.draft?.to ?? "").trim() || resolvedTo;
  const subject =
    String(params.draft?.subject ?? "").trim() ||
    applyEmailPlaceholders(params.settings.subject, params.vars);
  const body =
    String(params.draft?.body ?? "").trim() ||
    applyEmailPlaceholders(params.settings.message, params.vars);
  return { to, subject, body };
}

export function resolveUpdatedDocsRequestRecipient(
  field: PayslipEmailRecipientField,
  staff: { work_email: string | null; personal_email: string | null },
): string | null {
  const work = staff.work_email?.trim() || null;
  const personal = staff.personal_email?.trim() || null;
  if (field === "work") return work;
  if (field === "personal") return personal;
  return work || personal;
}

export async function deliverUpdatedDocsRequestEmail(params: {
  venue: {
    id: string;
    name?: string | null;
    slug?: string | null;
    logo_url?: string | null;
    icon_url?: string | null;
    favicon_url?: string | null;
  };
  staff: MissingDetailStaffInput & {
    work_email: string | null;
    personal_email: string | null;
  };
  settings: HrUpdatedDocsRequestEmailSettings;
  userName: string;
  actorId: string | null;
  supabase?: SupabaseClient;
  expiry?: UpdatedDocsExpiryContext | null;
  draft?: { to?: string; subject?: string; body?: string } | null;
}): Promise<{ ok: true; to: string } | { ok: false; error: string }> {
  if (!params.settings.enabled) {
    return {
      ok: false,
      error:
        "Updated docs request emails are disabled. Enable them under Settings → Emails → Other templates.",
    };
  }

  const requestItems = buildUpdatedDocsRequestItems({
    staff: params.staff,
    expiry: params.expiry,
  });
  if (requestItems.length === 0) {
    return {
      ok: false,
      error: "No missing details or expired documents to request for this employee.",
    };
  }

  const vars = buildUpdatedDocsRequestEmailVars({
    staff: params.staff,
    venueName: params.venue.name,
    userName: params.userName,
    expiry: params.expiry,
  });
  const composed = composeUpdatedDocsRequestEmailContent({
    settings: params.settings,
    vars,
    staff: params.staff,
    draft: params.draft,
  });
  if (!composed.to) {
    return {
      ok: false,
      error: "No recipient email on this staff record for the selected field.",
    };
  }

  const supabase = params.supabase ?? createServiceClient();

  let sendMessageId: string | null = null;
  let sentHtml = "";

  try {
    const { html, inlineAttachments } = await buildHrTemplateEmailHtml({
      body: composed.body,
      venue: {
        ...params.venue,
        slug: params.venue.slug ?? "",
      },
    });
    sentHtml = html;

    const sendResult = await sendAppEmail(
      {
        to: composed.to,
        subject: composed.subject,
        html,
        attachments:
          inlineAttachments.length > 0 ? inlineAttachments : undefined,
        fromOverride: params.settings.fromEmail || undefined,
      },
      { venueId: params.venue.id, supabase },
    );
    sendMessageId = sendResult.messageId;
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to send email.",
    };
  }

  const auditId = await writeAuditLog({
    actor_id: params.actorId,
    action: "updated_docs_request_email.sent",
    module_key: HR_MODULE_KEY,
    entity: "staff",
    entity_id: params.staff.id,
    venue_id: params.venue.id,
    after: {
      to: composed.to,
      missingCount: requestItems.length,
      docLabel: params.expiry?.label ?? null,
      expiryDate: params.expiry?.expiryDate ?? null,
    },
  });

  if (sendMessageId && auditId) {
    await recordOutboundStaffEmail({
      supabase,
      venueId: params.venue.id,
      staffId: params.staff.id,
      rfcMessageId: sendMessageId,
      subject: composed.subject,
      fromEmail: params.settings.fromEmail || null,
      toEmail: composed.to,
      bodyHtml: sentHtml,
      bodyText: composed.body,
      sourceKind: "audit",
      sourceId: auditId,
    });
  }

  return { ok: true, to: composed.to };
}
