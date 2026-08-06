import "server-only";

import { writeAuditLog } from "@/lib/audit";
import { recordOutboundStaffEmail } from "@/lib/email/record-staff-email";
import { sendAppEmail } from "@/lib/email/transport";
import { formatAed, formatDateOnly } from "@/lib/hr/derived";
import { buildHrTemplateEmailHtml } from "@/lib/hr/email-logo";
import {
  DEFAULT_HR_UNIFORM_TERMS_EMAIL_SETTINGS,
  DEFAULT_UNIFORM_TERMS_EMAIL_MESSAGE,
  DEFAULT_UNIFORM_TERMS_EMAIL_SUBJECT,
  HR_MODULE_KEY,
  type HrUniformTermsEmailSettings,
  type PayslipEmailRecipientField,
  type UniformStaffItemRow,
} from "@/lib/hr/types";
import { createServiceClient } from "@/lib/supabase/service";
import type { SupabaseClient } from "@supabase/supabase-js";

export function mergeUniformTermsEmailSettings(
  partial: Partial<HrUniformTermsEmailSettings> | null | undefined,
): HrUniformTermsEmailSettings {
  const base = DEFAULT_HR_UNIFORM_TERMS_EMAIL_SETTINGS;
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
      DEFAULT_UNIFORM_TERMS_EMAIL_SUBJECT,
    message:
      String(partial?.message ?? "").trim() ||
      DEFAULT_UNIFORM_TERMS_EMAIL_MESSAGE,
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

export function formatUniformsOnHandList(
  items: UniformStaffItemRow[],
): string {
  if (items.length === 0) {
    return "• (No uniform pieces currently on hand.)";
  }
  return items
    .map((item) => {
      const name = item.piece?.name?.trim() || "Uniform piece";
      const qty = item.quantity;
      const unit = item.piece?.unit_value ?? 0;
      const lineValue = unit * qty;
      const provided = item.provided_at
        ? ` · provided ${formatDateOnly(item.provided_at)}`
        : "";
      return `• ${name} × ${qty} — ${formatAed(lineValue)}${provided}`;
    })
    .join("\n");
}

export function uniformsOnHandTotal(items: UniformStaffItemRow[]): number {
  return items.reduce((sum, item) => {
    const unit = item.piece?.unit_value ?? 0;
    return sum + unit * item.quantity;
  }, 0);
}

export function buildUniformTermsEmailVars(params: {
  staff: { full_name: string | null; emp_no: string | null };
  venueName: string | null | undefined;
  userName: string;
  items: UniformStaffItemRow[];
}): Record<string, string> {
  const total = uniformsOnHandTotal(params.items);
  return {
    EMPLOYEE_NAME: String(params.staff.full_name ?? "").trim() || "Colleague",
    EMP_NO: String(params.staff.emp_no ?? "").trim(),
    UNIFORMS_ON_HAND: formatUniformsOnHandList(params.items),
    UNIFORMS_TOTAL_VALUE: formatAed(total),
    VENUE_NAME: params.venueName?.trim() || "Our team",
    USER_NAME: params.userName.trim() || "Human Resources",
  };
}

export function composeUniformTermsEmailContent(params: {
  settings: HrUniformTermsEmailSettings;
  vars: Record<string, string>;
  staff: { work_email: string | null; personal_email: string | null };
  draft?: { to?: string; subject?: string; body?: string } | null;
}): { to: string | null; subject: string; body: string } {
  const resolvedTo = resolveUniformTermsRecipient(
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

export function resolveUniformTermsRecipient(
  field: PayslipEmailRecipientField,
  staff: { work_email: string | null; personal_email: string | null },
): string | null {
  const work = staff.work_email?.trim() || null;
  const personal = staff.personal_email?.trim() || null;
  if (field === "work") return work;
  if (field === "personal") return personal;
  return work || personal;
}

export async function deliverUniformTermsEmail(params: {
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
  items: UniformStaffItemRow[];
  settings: HrUniformTermsEmailSettings;
  userName: string;
  actorId: string | null;
  supabase?: SupabaseClient;
  draft?: { to?: string; subject?: string; body?: string } | null;
}): Promise<{ ok: true; to: string } | { ok: false; error: string }> {
  if (!params.settings.enabled) {
    return {
      ok: false,
      error:
        "Uniform T&Cs emails are disabled. Enable them under Settings → Emails → Other templates → Uniform T&Cs.",
    };
  }

  if (params.items.length === 0) {
    return {
      ok: false,
      error: "This employee has no uniform pieces on hand to confirm.",
    };
  }

  const vars = buildUniformTermsEmailVars({
    staff: params.staff,
    venueName: params.venue.name,
    userName: params.userName,
    items: params.items,
  });
  const composed = composeUniformTermsEmailContent({
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

  try {
    const { html, inlineAttachments } = await buildHrTemplateEmailHtml({
      body: composed.body,
      venue: {
        ...params.venue,
        slug: params.venue.slug ?? "",
      },
    });

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

    const auditId = await writeAuditLog({
      actor_id: params.actorId,
      action: "uniform_terms_email.sent",
      module_key: HR_MODULE_KEY,
      entity: "staff",
      entity_id: params.staff.id,
      venue_id: params.venue.id,
      after: {
        to: composed.to,
        itemCount: params.items.length,
        totalValue: uniformsOnHandTotal(params.items),
      },
    });

    if (sendResult.messageId && auditId) {
      await recordOutboundStaffEmail({
        supabase,
        venueId: params.venue.id,
        staffId: params.staff.id,
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
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to send email.",
    };
  }

  return { ok: true, to: composed.to };
}
