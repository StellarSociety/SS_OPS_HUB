import type { SupabaseClient } from "@supabase/supabase-js";
import { getHrVenueSetting } from "@/lib/hr/store";
import {
  createPayrollEmailTemplate,
  DEFAULT_HR_PAYROLL_APPROVALS_SETTINGS,
  DEFAULT_PAYROLL_EMAIL_SUBJECT,
  DEFAULT_PAYROLL_EMAIL_TEMPLATE,
  DEFAULT_PAYROLL_EMAIL_TEMPLATE_ID,
  HR_SETTINGS_KEYS,
  type HrPayrollApprovalsSettings,
  type PayrollEmailTemplate,
} from "@/lib/hr/types";

function normalizePayrollEmailTemplates(
  raw: unknown,
  legacy?: { subject?: string; message?: string },
): PayrollEmailTemplate[] {
  const list = Array.isArray(raw) ? raw : [];
  const templates: PayrollEmailTemplate[] = [];
  const seen = new Set<string>();

  for (const row of list) {
    if (!row || typeof row !== "object") continue;
    const id = String((row as PayrollEmailTemplate).id ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    templates.push(
      createPayrollEmailTemplate({
        id,
        name: String((row as PayrollEmailTemplate).name ?? "Template"),
        subject: String(
          (row as PayrollEmailTemplate).subject ?? DEFAULT_PAYROLL_EMAIL_SUBJECT,
        ),
        message: String((row as PayrollEmailTemplate).message ?? ""),
      }),
    );
  }

  if (templates.length === 0) {
    const legacySubject = String(legacy?.subject ?? "").trim();
    const legacyMessage = String(legacy?.message ?? "");
    templates.push(
      createPayrollEmailTemplate({
        id: DEFAULT_PAYROLL_EMAIL_TEMPLATE_ID,
        name: "Default",
        subject: legacySubject || DEFAULT_PAYROLL_EMAIL_SUBJECT,
        message: legacyMessage || DEFAULT_PAYROLL_EMAIL_TEMPLATE.message,
      }),
    );
  }

  return templates;
}

export function mergePayrollApprovalsSettings(
  partial:
    | (Partial<HrPayrollApprovalsSettings> & {
        email?: Partial<HrPayrollApprovalsSettings["email"]> & {
          subject?: string;
          message?: string;
        };
      })
    | null
    | undefined,
): HrPayrollApprovalsSettings {
  const base = DEFAULT_HR_PAYROLL_APPROVALS_SETTINGS;
  const emailPartial: Partial<HrPayrollApprovalsSettings["email"]> & {
    subject?: string;
    message?: string;
  } = partial?.email ?? {};
  const templates = normalizePayrollEmailTemplates(emailPartial.templates, {
    subject: emailPartial.subject,
    message: emailPartial.message,
  });
  const requestedDefault = String(
    emailPartial.defaultTemplateId ?? base.email.defaultTemplateId,
  ).trim();
  const defaultTemplateId = templates.some((t) => t.id === requestedDefault)
    ? requestedDefault
    : templates[0]!.id;

  return {
    hrReviewApproverUserIds:
      partial?.hrReviewApproverUserIds ?? base.hrReviewApproverUserIds,
    finalApprovalApproverUserIds:
      partial?.finalApprovalApproverUserIds ??
      base.finalApprovalApproverUserIds,
    reopenUserIds: partial?.reopenUserIds ?? base.reopenUserIds,
    email: {
      fromEmail:
        String(emailPartial.fromEmail ?? base.email.fromEmail).trim() ||
        base.email.fromEmail,
      toEmails:
        Array.isArray(emailPartial.toEmails) && emailPartial.toEmails.length > 0
          ? emailPartial.toEmails.map((e) => e.trim()).filter(Boolean)
          : base.email.toEmails,
      templates,
      defaultTemplateId,
      attachPayrollExport: Boolean(
        emailPartial.attachPayrollExport ?? base.email.attachPayrollExport,
      ),
      attachGlExport: Boolean(
        emailPartial.attachGlExport ?? base.email.attachGlExport,
      ),
      attachOther: Boolean(emailPartial.attachOther ?? base.email.attachOther),
      autoSendOnFinalApproval:
        typeof emailPartial.autoSendOnFinalApproval === "boolean"
          ? emailPartial.autoSendOnFinalApproval
          : base.email.autoSendOnFinalApproval,
    },
  };
}

/** Load approvals settings for a known venue (safe for RSC pages). */
export async function loadPayrollApprovalsSettingsForVenue(
  supabase: SupabaseClient,
  venueId: string,
): Promise<HrPayrollApprovalsSettings> {
  const stored = await getHrVenueSetting<Partial<HrPayrollApprovalsSettings>>(
    supabase,
    venueId,
    HR_SETTINGS_KEYS.payrollApprovals,
    {},
  );
  return mergePayrollApprovalsSettings(stored);
}
