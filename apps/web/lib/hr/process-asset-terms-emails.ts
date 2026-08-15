import "server-only";

import { writeAuditLog } from "@/lib/audit";
import { recordOutboundStaffEmail } from "@/lib/email/record-staff-email";
import { sendAppEmail } from "@/lib/email/transport";
import { formatAed, formatDateOnly } from "@/lib/hr/derived";
import { buildHrTemplateEmailHtml } from "@/lib/hr/email-logo";
import { acknowledgementCtaForSend } from "@/lib/hr/acknowledgement-store";
import {
  DEFAULT_HR_ASSET_TERMS_EMAIL_SETTINGS,
  DEFAULT_ASSET_TERMS_EMAIL_MESSAGE,
  DEFAULT_ASSET_TERMS_EMAIL_SUBJECT,
  HR_MODULE_KEY,
  type HrAssetTermsEmailSettings,
  type PayslipEmailRecipientField,
  type AssetStaffItemRow,
} from "@/lib/hr/types";
import { createServiceClient } from "@/lib/supabase/service";
import type { SupabaseClient } from "@supabase/supabase-js";

export function mergeAssetTermsEmailSettings(
  partial: Partial<HrAssetTermsEmailSettings> | null | undefined,
): HrAssetTermsEmailSettings {
  const base = DEFAULT_HR_ASSET_TERMS_EMAIL_SETTINGS;
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
      DEFAULT_ASSET_TERMS_EMAIL_SUBJECT,
    message:
      String(partial?.message ?? "").trim() ||
      DEFAULT_ASSET_TERMS_EMAIL_MESSAGE,
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

export function formatAssetsOnHandList(
  items: AssetStaffItemRow[],
): string {
  if (items.length === 0) {
    return "• (No assets currently on hand.)";
  }
  return items
    .map((item) => {
      const name = item.name?.trim() || "Asset";
      const serial = item.serial_no?.trim();
      const value = Number(item.asset_value ?? 0);
      const provided = item.assigned_at
        ? ` · issued ${formatDateOnly(item.assigned_at)}`
        : "";
      const serialPart = serial ? ` (${serial})` : "";
      return `• ${name}${serialPart} — ${formatAed(value)}${provided}`;
    })
    .join("\n");
}

export function assetsOnHandTotal(items: AssetStaffItemRow[]): number {
  return items.reduce((sum, item) => sum + Number(item.asset_value ?? 0), 0);
}

export function buildAssetTermsEmailVars(params: {
  staff: { full_name: string | null; emp_no: string | null };
  venueName: string | null | undefined;
  userName: string;
  items: AssetStaffItemRow[];
}): Record<string, string> {
  const total = assetsOnHandTotal(params.items);
  return {
    EMPLOYEE_NAME: String(params.staff.full_name ?? "").trim() || "Colleague",
    EMP_NO: String(params.staff.emp_no ?? "").trim(),
    ASSETS_ON_HAND: formatAssetsOnHandList(params.items),
    ASSETS_TOTAL_VALUE: formatAed(total),
    VENUE_NAME: params.venueName?.trim() || "Our team",
    USER_NAME: params.userName.trim() || "Human Resources",
  };
}

export function composeAssetTermsEmailContent(params: {
  settings: HrAssetTermsEmailSettings;
  vars: Record<string, string>;
  staff: { work_email: string | null; personal_email: string | null };
  draft?: { to?: string; subject?: string; body?: string } | null;
}): { to: string | null; subject: string; body: string } {
  const resolvedTo = resolveAssetTermsRecipient(
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

export function resolveAssetTermsRecipient(
  field: PayslipEmailRecipientField,
  staff: { work_email: string | null; personal_email: string | null },
): string | null {
  const work = staff.work_email?.trim() || null;
  const personal = staff.personal_email?.trim() || null;
  if (field === "work") return work;
  if (field === "personal") return personal;
  return work || personal;
}

export async function deliverAssetTermsEmail(params: {
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
  items: AssetStaffItemRow[];
  settings: HrAssetTermsEmailSettings;
  userName: string;
  actorId: string | null;
  supabase?: SupabaseClient;
  draft?: { to?: string; subject?: string; body?: string } | null;
}): Promise<{ ok: true; to: string } | { ok: false; error: string }> {
  if (!params.settings.enabled) {
    return {
      ok: false,
      error:
        "Asset T&Cs emails are disabled. Enable them under Settings → Emails → Other templates → Asset T&Cs.",
    };
  }

  if (params.items.length === 0) {
    return {
      ok: false,
      error: "This employee has no assets on hand to confirm.",
    };
  }

  const vars = buildAssetTermsEmailVars({
    staff: params.staff,
    venueName: params.venue.name,
    userName: params.userName,
    items: params.items,
  });
  const composed = composeAssetTermsEmailContent({
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
    const acknowledgement = await acknowledgementCtaForSend({
      requiresAcknowledgement: params.settings.requiresAcknowledgement,
      venueId: params.venue.id,
      staffId: params.staff.id,
      staffName: params.staff.full_name ?? "Unknown",
      empNo: params.staff.emp_no,
      recipientEmail: composed.to,
      emailKind: "asset_terms",
      emailKindLabel: "Asset T&Cs",
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
      action: "asset_terms_email.sent",
      module_key: HR_MODULE_KEY,
      entity: "staff",
      entity_id: params.staff.id,
      venue_id: params.venue.id,
      after: {
        to: composed.to,
        itemCount: params.items.length,
        totalValue: assetsOnHandTotal(params.items),
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
