"use server";

import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { getActionAuthContext } from "@/lib/auth/action-context";
import { canAdminLookups, canEditPayroll } from "@/lib/hr/permissions";
import { mergePayrollFinalApprovalEmailSettings } from "@/lib/hr/payroll/final-approval-email-settings";
import { loadPayrollFinalApprovalEmailSettingsForVenue } from "@/lib/hr/payroll/final-approval-email-settings";
import {
  DEFAULT_HR_PAYROLL_FINAL_APPROVAL_EMAIL_SETTINGS,
  HR_MODULE_KEY,
  HR_SETTINGS_KEYS,
  type HrPayrollFinalApprovalEmailSettings,
  type PayrollEmailTemplate,
} from "@/lib/hr/types";
import { createServiceClient } from "@/lib/supabase/service";

function flagTrue(raw: FormDataEntryValue | null): boolean {
  const v = String(raw ?? "").toLowerCase();
  return v === "true" || v === "on" || v === "1";
}

async function getAuth() {
  const ctx = await getActionAuthContext();
  if ("error" in ctx) return { error: ctx.error } as const;
  return ctx;
}

export async function getPayrollFinalApprovalEmailSettings(): Promise<HrPayrollFinalApprovalEmailSettings> {
  const auth = await getAuth();
  if ("error" in auth) return DEFAULT_HR_PAYROLL_FINAL_APPROVAL_EMAIL_SETTINGS;
  return loadPayrollFinalApprovalEmailSettingsForVenue(
    auth.supabase,
    auth.venue.id,
  );
}

export async function savePayrollFinalApprovalEmailSettings(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const auth = await getAuth();
    if ("error" in auth) return { ok: false, error: auth.error };
    const { user, venue, permissions } = auth;

    if (
      !canAdminLookups(permissions, venue.id) &&
      !canEditPayroll(permissions, venue.id)
    ) {
      return {
        ok: false,
        error: "No permission to save Final Approval email settings.",
      };
    }

    let templatesRaw: unknown = [];
    try {
      templatesRaw = JSON.parse(String(formData.get("templates_json") ?? "[]"));
    } catch {
      return { ok: false, error: "Invalid templates payload." };
    }

    const value = mergePayrollFinalApprovalEmailSettings({
      fromEmail: String(formData.get("from_email") ?? "").trim(),
      templates: templatesRaw as PayrollEmailTemplate[],
      defaultTemplateId: String(
        formData.get("default_template_id") ?? "",
      ).trim(),
      attachPdf: flagTrue(formData.get("attach_pdf")),
      attachExcel: flagTrue(formData.get("attach_excel")),
    });

    if (value.templates.length === 0) {
      return { ok: false, error: "At least one email template is required." };
    }

    const service = createServiceClient();
    const { error } = await service.from("hr_venue_settings").upsert(
      {
        venue_id: venue.id,
        key: HR_SETTINGS_KEYS.payrollFinalApprovalEmail,
        value,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "venue_id,key" },
    );
    if (error) return { ok: false, error: error.message };

    await writeAuditLog({
      actor_id: user.id,
      action: "update",
      module_key: HR_MODULE_KEY,
      entity: "hr_venue_settings",
      entity_id: HR_SETTINGS_KEYS.payrollFinalApprovalEmail,
      venue_id: venue.id,
      after: value,
    });

    revalidatePath("/hr/settings/emails", "layout");
    revalidatePath("/hr/settings/emails/pay/final-approval", "page");
    revalidatePath("/hr/payroll", "page");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error
          ? e.message
          : "Failed to save Final Approval email settings.",
    };
  }
}
