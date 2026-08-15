import "server-only";

import { writeAuditLog } from "@/lib/audit";
import { recordOutboundStaffEmail } from "@/lib/email/record-staff-email";
import { sendAppEmail } from "@/lib/email/transport";
import { formatAed } from "@/lib/hr/derived";
import { buildHrTemplateEmailHtml } from "@/lib/hr/email-logo";
import { acknowledgementCtaForSend } from "@/lib/hr/acknowledgement-store";
import {
  DEFAULT_HR_UNIFORM_REPLACEMENT_EMAIL_SETTINGS,
  DEFAULT_UNIFORM_REPLACEMENT_EMAIL_MESSAGE,
  DEFAULT_UNIFORM_REPLACEMENT_EMAIL_SUBJECT,
  HR_MODULE_KEY,
  type HrUniformReplacementEmailSettings,
  type PayslipEmailRecipientField,
} from "@/lib/hr/types";
import { createServiceClient } from "@/lib/supabase/service";
import type { SupabaseClient } from "@supabase/supabase-js";

export function mergeUniformReplacementEmailSettings(
  partial: Partial<HrUniformReplacementEmailSettings> | null | undefined,
): HrUniformReplacementEmailSettings {
  const base = DEFAULT_HR_UNIFORM_REPLACEMENT_EMAIL_SETTINGS;
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
      DEFAULT_UNIFORM_REPLACEMENT_EMAIL_SUBJECT,
    message:
      String(partial?.message ?? "").trim() ||
      DEFAULT_UNIFORM_REPLACEMENT_EMAIL_MESSAGE,
    requiresAcknowledgement: partial?.requiresAcknowledgement === true,
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

export function formatUniformsReplacedList(
  lines: { name: string; quantity: number; lineValue: number }[],
): string {
  if (lines.length === 0) {
    return "• (No items listed.)";
  }
  return lines
    .map(
      (line) =>
        `• ${line.name} × ${line.quantity} — ${formatAed(line.lineValue)}`,
    )
    .join("\n");
}

export function buildUniformReplacementEmailVars(params: {
  staff: { full_name: string | null; emp_no: string | null };
  venueName: string | null | undefined;
  userName: string;
  deductionAmount: number;
  lines: { name: string; quantity: number; lineValue: number }[];
}): Record<string, string> {
  return {
    EMPLOYEE_NAME: String(params.staff.full_name ?? "").trim() || "Colleague",
    EMP_NO: String(params.staff.emp_no ?? "").trim(),
    UNIFORMS_REPLACED: formatUniformsReplacedList(params.lines),
    DEDUCTION_AMOUNT: formatAed(params.deductionAmount),
    VENUE_NAME: params.venueName?.trim() || "Our team",
    USER_NAME: params.userName.trim() || "Human Resources",
  };
}

export function composeUniformReplacementEmailContent(params: {
  settings: HrUniformReplacementEmailSettings;
  vars: Record<string, string>;
  staff: { work_email: string | null; personal_email: string | null };
  draft?: { to?: string; subject?: string; body?: string } | null;
}): { to: string | null; subject: string; body: string } {
  const resolvedTo = resolveUniformReplacementRecipient(
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

export function resolveUniformReplacementRecipient(
  field: PayslipEmailRecipientField,
  staff: { work_email: string | null; personal_email: string | null },
): string | null {
  const work = staff.work_email?.trim() || null;
  const personal = staff.personal_email?.trim() || null;
  if (field === "work") return work;
  if (field === "personal") return personal;
  return work || personal;
}

export async function deliverUniformReplacementEmail(params: {
  venue: {
    id: string;
    name?: string | null;
    slug?: string | null;
    logo_url?: string | null;
    icon_url?: string | null;
    favicon_url?: string | null;
  };
  staff: {
    id: string;
    full_name: string | null;
    emp_no: string | null;
    work_email: string | null;
    personal_email: string | null;
  };
  deductionAmount: number;
  lines: { name: string; quantity: number; lineValue: number }[];
  settings: HrUniformReplacementEmailSettings;
  userName: string;
  actorId: string | null;
  supabase?: SupabaseClient;
  draft?: { to?: string; subject?: string; body?: string } | null;
  replacementIds?: string[];
}): Promise<{ ok: true; to: string } | { ok: false; error: string }> {
  if (!params.settings.enabled) {
    return {
      ok: false,
      error:
        "Uniform replacement emails are disabled. Enable them under Settings → Emails → Other templates → Uniform.",
    };
  }

  if (!(params.deductionAmount > 0)) {
    return {
      ok: false,
      error: "No deduction amount to notify for this replacement.",
    };
  }

  const vars = buildUniformReplacementEmailVars({
    staff: params.staff,
    venueName: params.venue.name,
    userName: params.userName,
    deductionAmount: params.deductionAmount,
    lines: params.lines,
  });
  const composed = composeUniformReplacementEmailContent({
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
    const acknowledgement = await acknowledgementCtaForSend({
      requiresAcknowledgement: params.settings.requiresAcknowledgement,
      venueId: params.venue.id,
      staffId: params.staff.id,
      staffName: params.staff.full_name ?? "Unknown",
      empNo: params.staff.emp_no,
      recipientEmail: composed.to,
      emailKind: "uniform_replacement",
      emailKindLabel: "Uniform replacement",
      subject: composed.subject,
    });
    const { html, inlineAttachments } = await buildHrTemplateEmailHtml({
      body: composed.body,
      venue: {
        ...params.venue,
        slug: params.venue.slug ?? "",
      },
      acknowledgement,
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

  if (params.replacementIds && params.replacementIds.length > 0) {
    await supabase
      .from("hr_uniform_replacements")
      .update({ email_sent_at: new Date().toISOString() })
      .in("id", params.replacementIds);
  }

  const auditId = await writeAuditLog({
    actor_id: params.actorId,
    action: "uniform_replacement_email.sent",
    module_key: HR_MODULE_KEY,
    entity: "staff",
    entity_id: params.staff.id,
    venue_id: params.venue.id,
    after: {
      to: composed.to,
      deductionAmount: params.deductionAmount,
      replacementIds: params.replacementIds ?? [],
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
