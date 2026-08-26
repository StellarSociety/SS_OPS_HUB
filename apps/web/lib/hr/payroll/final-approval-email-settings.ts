import type { SupabaseClient } from "@supabase/supabase-js";
import { getHrVenueSetting } from "@/lib/hr/store";
import {
  createFinalApprovalEmailTemplate,
  DEFAULT_FINAL_APPROVAL_EMAIL_SUBJECT,
  DEFAULT_FINAL_APPROVAL_EMAIL_TEMPLATE,
  DEFAULT_FINAL_APPROVAL_EMAIL_TEMPLATE_ID,
  DEFAULT_HR_PAYROLL_FINAL_APPROVAL_EMAIL_SETTINGS,
  HR_SETTINGS_KEYS,
  type HrPayrollFinalApprovalEmailSettings,
  type PayrollEmailTemplate,
} from "@/lib/hr/types";

function normalizeTemplates(
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
      createFinalApprovalEmailTemplate({
        id,
        name: String((row as PayrollEmailTemplate).name ?? "Template"),
        subject: String(
          (row as PayrollEmailTemplate).subject ??
            DEFAULT_FINAL_APPROVAL_EMAIL_SUBJECT,
        ),
        message: String((row as PayrollEmailTemplate).message ?? ""),
        requiresAcknowledgement:
          (row as PayrollEmailTemplate).requiresAcknowledgement === true,
      }),
    );
  }

  if (templates.length === 0) {
    const legacySubject = String(legacy?.subject ?? "").trim();
    const legacyMessage = String(legacy?.message ?? "");
    templates.push(
      createFinalApprovalEmailTemplate({
        id: DEFAULT_FINAL_APPROVAL_EMAIL_TEMPLATE_ID,
        name: "Default",
        subject: legacySubject || DEFAULT_FINAL_APPROVAL_EMAIL_SUBJECT,
        message:
          legacyMessage || DEFAULT_FINAL_APPROVAL_EMAIL_TEMPLATE.message,
      }),
    );
  }

  return templates;
}

export function mergePayrollFinalApprovalEmailSettings(
  partial: Partial<HrPayrollFinalApprovalEmailSettings> | null | undefined,
): HrPayrollFinalApprovalEmailSettings {
  const base = DEFAULT_HR_PAYROLL_FINAL_APPROVAL_EMAIL_SETTINGS;
  const templates = normalizeTemplates(partial?.templates);
  const requestedDefault = String(
    partial?.defaultTemplateId ?? base.defaultTemplateId,
  ).trim();
  const defaultTemplateId = templates.some((t) => t.id === requestedDefault)
    ? requestedDefault
    : templates[0]!.id;

  return {
    fromEmail: String(partial?.fromEmail ?? base.fromEmail).trim(),
    templates,
    defaultTemplateId,
    attachPdf:
      typeof partial?.attachPdf === "boolean"
        ? partial.attachPdf
        : base.attachPdf,
    attachExcel:
      typeof partial?.attachExcel === "boolean"
        ? partial.attachExcel
        : base.attachExcel,
  };
}

export async function loadPayrollFinalApprovalEmailSettingsForVenue(
  supabase: SupabaseClient,
  venueId: string,
): Promise<HrPayrollFinalApprovalEmailSettings> {
  const stored = await getHrVenueSetting<
    Partial<HrPayrollFinalApprovalEmailSettings>
  >(supabase, venueId, HR_SETTINGS_KEYS.payrollFinalApprovalEmail, {});
  return mergePayrollFinalApprovalEmailSettings(stored);
}
