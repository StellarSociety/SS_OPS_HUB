"use server";

import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { getActionAuthContext } from "@/lib/auth/action-context";
import { formatDateOnly } from "@/lib/hr/derived";
import type { MissingDetailStaffInput } from "@/lib/hr/missing-details";
import {
  buildUpdatedDocsRequestEmailVars,
  composeUpdatedDocsRequestEmailContent,
  deliverUpdatedDocsRequestEmail,
  mergeUpdatedDocsRequestEmailSettings,
  type UpdatedDocsExpiryContext,
} from "@/lib/hr/process-updated-docs-request-emails";
import { canAdminLookups, canEditStaff } from "@/lib/hr/permissions";
import { getHrVenueSetting } from "@/lib/hr/store";
import {
  DEFAULT_HR_UPDATED_DOCS_REQUEST_EMAIL_SETTINGS,
  HR_MODULE_KEY,
  HR_SETTINGS_KEYS,
  type HrUpdatedDocsRequestEmailSettings,
  type PayslipEmailRecipientField,
} from "@/lib/hr/types";
import { createServiceClient } from "@/lib/supabase/service";

const STAFF_SELECT =
  "id, emp_no, full_name, photo_url, department_id, position_id, nationality_id, gender, dob, contact_phone, personal_email, work_email, joining_date, contract_kind, passport_no, passport_expiry, eid_no, eid_expiry, visa_expiry, iban, wage_package, home_venue_id";

function flagTrue(raw: FormDataEntryValue | null): boolean {
  const v = String(raw ?? "").toLowerCase();
  return v === "true" || v === "on" || v === "1";
}

function requireSendPermission(
  permissions: Parameters<typeof canEditStaff>[0],
  venueId: string,
): string | null {
  if (canEditStaff(permissions, venueId) || canAdminLookups(permissions, venueId)) {
    return null;
  }
  return "No permission to send this email.";
}

function toStaffInput(row: Record<string, unknown>): MissingDetailStaffInput & {
  work_email: string | null;
  personal_email: string | null;
  home_venue_id: string | null;
} {
  return {
    id: String(row.id),
    emp_no: String(row.emp_no ?? ""),
    full_name: String(row.full_name ?? ""),
    photo_url: (row.photo_url as string | null) ?? null,
    department_id: (row.department_id as string | null) ?? null,
    position_id: (row.position_id as string | null) ?? null,
    nationality_id: (row.nationality_id as string | null) ?? null,
    gender: (row.gender as string | null) ?? null,
    dob: (row.dob as string | null) ?? null,
    contact_phone: (row.contact_phone as string | null) ?? null,
    personal_email: (row.personal_email as string | null) ?? null,
    work_email: (row.work_email as string | null) ?? null,
    joining_date: (row.joining_date as string | null) ?? null,
    contract_kind: (row.contract_kind as string | null) ?? null,
    passport_no: (row.passport_no as string | null) ?? null,
    passport_expiry: (row.passport_expiry as string | null) ?? null,
    eid_no: (row.eid_no as string | null) ?? null,
    eid_expiry: (row.eid_expiry as string | null) ?? null,
    visa_expiry: (row.visa_expiry as string | null) ?? null,
    iban: (row.iban as string | null) ?? null,
    wage_package:
      row.wage_package == null ? null : Number(row.wage_package),
    home_venue_id: (row.home_venue_id as string | null) ?? null,
  };
}

function parseExpiryContext(
  raw: {
    label?: string;
    expiryDate?: string;
    daysUntil?: number;
  } | null | undefined,
): UpdatedDocsExpiryContext | null {
  if (!raw) return null;
  const label = String(raw.label ?? "").trim();
  const expiryDate = String(raw.expiryDate ?? "").trim();
  if (!label || !expiryDate) return null;
  const daysUntil = Number(raw.daysUntil);
  return {
    label,
    expiryDate,
    daysUntil: Number.isFinite(daysUntil) ? daysUntil : 0,
  };
}

export type UpdatedDocsRequestEmailPreview = {
  enabled: boolean;
  staffId: string;
  empNo: string;
  employeeName: string;
  missingCount: number;
  docLabel: string | null;
  expiryDateLabel: string | null;
  daysStatus: string | null;
  to: string;
  subject: string;
  body: string;
};

export async function getUpdatedDocsRequestEmailSettings(): Promise<HrUpdatedDocsRequestEmailSettings> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return DEFAULT_HR_UPDATED_DOCS_REQUEST_EMAIL_SETTINGS;

  const stored = await getHrVenueSetting<
    Partial<HrUpdatedDocsRequestEmailSettings>
  >(
    auth.supabase,
    auth.venue.id,
    HR_SETTINGS_KEYS.updatedDocsRequestEmail,
    {},
  );
  return mergeUpdatedDocsRequestEmailSettings(stored);
}

export async function saveUpdatedDocsRequestEmailSettings(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { ok: false, error: auth.error };

  if (
    !canEditStaff(auth.permissions, auth.venue.id) &&
    !canAdminLookups(auth.permissions, auth.venue.id)
  ) {
    return { ok: false, error: "No permission to save these settings." };
  }

  const recipientRaw = String(formData.get("recipient_field") ?? "").trim();
  const recipientField = (
    ["work", "personal", "work_then_personal"].includes(recipientRaw)
      ? recipientRaw
      : "personal"
  ) as PayslipEmailRecipientField;

  const next = mergeUpdatedDocsRequestEmailSettings({
    enabled: flagTrue(formData.get("enabled")),
    recipientField,
    fromEmail: String(formData.get("from_email") ?? ""),
    subject: String(formData.get("subject") ?? ""),
    message: String(formData.get("message") ?? ""),
  });

  try {
    const service = createServiceClient();
    const { error } = await service.from("hr_venue_settings").upsert(
      {
        venue_id: auth.venue.id,
        key: HR_SETTINGS_KEYS.updatedDocsRequestEmail,
        value: next,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "venue_id,key" },
    );
    if (error) return { ok: false, error: error.message };

    await writeAuditLog({
      actor_id: auth.user.id,
      action: "update",
      module_key: HR_MODULE_KEY,
      entity: "hr_venue_settings",
      entity_id: HR_SETTINGS_KEYS.updatedDocsRequestEmail,
      venue_id: auth.venue.id,
      after: { enabled: next.enabled },
    });

    revalidatePath("/hr/settings/emails", "layout");
    revalidatePath("/hr/settings/emails/other/updated-docs-request", "page");
    revalidatePath("/hr/staff/insights");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error
          ? e.message
          : "Failed to save updated docs request email settings.",
    };
  }
}

export async function previewUpdatedDocsRequestEmail(input: {
  staffId: string;
  expiry?: {
    label: string;
    expiryDate: string;
    daysUntil: number;
  } | null;
}): Promise<
  | { ok: true; preview: UpdatedDocsRequestEmailPreview }
  | { ok: false; error: string }
> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { ok: false, error: auth.error };

  const denied = requireSendPermission(auth.permissions, auth.venue.id);
  if (denied) return { ok: false, error: denied };

  const settings = await getUpdatedDocsRequestEmailSettings();
  if (!settings.enabled) {
    return {
      ok: false,
      error:
        "Updated docs request emails are disabled. Enable them under Settings → Emails → Other templates.",
    };
  }

  const { data: staffRow, error: staffError } = await auth.supabase
    .from("staff")
    .select(STAFF_SELECT)
    .eq("id", input.staffId)
    .maybeSingle();

  if (staffError) return { ok: false, error: staffError.message };
  if (!staffRow) return { ok: false, error: "Staff member not found." };

  const staff = toStaffInput(staffRow as Record<string, unknown>);
  if (
    !auth.venue.is_global &&
    staff.home_venue_id &&
    staff.home_venue_id !== auth.venue.id
  ) {
    return { ok: false, error: "Staff member is not in this venue." };
  }

  const { data: profile } = await auth.supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", auth.user.id)
    .maybeSingle();
  const userName =
    String(profile?.full_name ?? "").trim() ||
    String(profile?.email ?? auth.user.email ?? "").trim() ||
    "User";

  const expiry = parseExpiryContext(input.expiry);
  const vars = buildUpdatedDocsRequestEmailVars({
    staff,
    venueName: auth.venue.name,
    userName,
    expiry,
  });
  const composed = composeUpdatedDocsRequestEmailContent({
    settings,
    vars,
    staff,
  });
  if (!composed.to) {
    return {
      ok: false,
      error: "No recipient email on this staff record for the selected field.",
    };
  }

  const missingCount = Number(vars.MISSING_DETAILS_COUNT) || 0;
  if (missingCount === 0) {
    return {
      ok: false,
      error: "No missing details or expired documents to request for this employee.",
    };
  }

  return {
    ok: true,
    preview: {
      enabled: settings.enabled,
      staffId: staff.id,
      empNo: staff.emp_no,
      employeeName: staff.full_name || "Employee",
      missingCount,
      docLabel: expiry?.label ?? null,
      expiryDateLabel: expiry ? formatDateOnly(expiry.expiryDate) : null,
      daysStatus: vars.DAYS_STATUS || null,
      to: composed.to,
      subject: composed.subject,
      body: composed.body,
    },
  };
}

export async function sendUpdatedDocsRequestEmail(input: {
  staffId: string;
  expiry?: {
    label: string;
    expiryDate: string;
    daysUntil: number;
  } | null;
  draft?: { to: string; subject: string; body: string };
}): Promise<{ ok: true; to: string } | { ok: false; error: string }> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { ok: false, error: auth.error };

  const denied = requireSendPermission(auth.permissions, auth.venue.id);
  if (denied) return { ok: false, error: denied };

  const settings = await getUpdatedDocsRequestEmailSettings();

  const { data: staffRow, error: staffError } = await auth.supabase
    .from("staff")
    .select(STAFF_SELECT)
    .eq("id", input.staffId)
    .maybeSingle();

  if (staffError) return { ok: false, error: staffError.message };
  if (!staffRow) return { ok: false, error: "Staff member not found." };

  const staff = toStaffInput(staffRow as Record<string, unknown>);
  if (
    !auth.venue.is_global &&
    staff.home_venue_id &&
    staff.home_venue_id !== auth.venue.id
  ) {
    return { ok: false, error: "Staff member is not in this venue." };
  }

  const { data: profile } = await auth.supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", auth.user.id)
    .maybeSingle();
  const userName =
    String(profile?.full_name ?? "").trim() ||
    String(profile?.email ?? auth.user.email ?? "").trim() ||
    "User";

  const result = await deliverUpdatedDocsRequestEmail({
    venue: auth.venue,
    staff,
    settings,
    userName,
    actorId: auth.user.id,
    supabase: auth.supabase,
    expiry: parseExpiryContext(input.expiry),
    draft: input.draft ?? null,
  });

  if (result.ok) {
    revalidatePath("/hr/staff/insights");
  }
  return result;
}
