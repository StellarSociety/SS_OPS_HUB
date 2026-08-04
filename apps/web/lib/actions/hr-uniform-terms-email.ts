"use server";

import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { getActionAuthContext } from "@/lib/auth/action-context";
import { canAdminLookups, canEditStaff } from "@/lib/hr/permissions";
import {
  buildUniformTermsEmailVars,
  composeUniformTermsEmailContent,
  deliverUniformTermsEmail,
  mergeUniformTermsEmailSettings,
} from "@/lib/hr/process-uniform-terms-emails";
import { getHrVenueSetting } from "@/lib/hr/store";
import {
  DEFAULT_HR_UNIFORM_TERMS_EMAIL_SETTINGS,
  HR_MODULE_KEY,
  HR_SETTINGS_KEYS,
  type HrUniformTermsEmailSettings,
  type PayslipEmailRecipientField,
  type UniformStaffItemRow,
} from "@/lib/hr/types";
import { listUniformStaffItems } from "@/lib/hr/uniform-store";
import { createServiceClient } from "@/lib/supabase/service";

const STAFF_SELECT =
  "id, emp_no, full_name, personal_email, work_email, home_venue_id";

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

export type UniformTermsEmailPreview = {
  enabled: boolean;
  staffId: string;
  empNo: string;
  employeeName: string;
  itemCount: number;
  totalValueLabel: string;
  to: string;
  subject: string;
  body: string;
};

export async function getUniformTermsEmailSettings(): Promise<HrUniformTermsEmailSettings> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return DEFAULT_HR_UNIFORM_TERMS_EMAIL_SETTINGS;

  const stored = await getHrVenueSetting<Partial<HrUniformTermsEmailSettings>>(
    auth.supabase,
    auth.venue.id,
    HR_SETTINGS_KEYS.uniformTermsEmail,
    {},
  );
  return mergeUniformTermsEmailSettings(stored);
}

export async function saveUniformTermsEmailSettings(
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

  const next = mergeUniformTermsEmailSettings({
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
        key: HR_SETTINGS_KEYS.uniformTermsEmail,
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
      entity_id: HR_SETTINGS_KEYS.uniformTermsEmail,
      venue_id: auth.venue.id,
      after: { enabled: next.enabled },
    });

    revalidatePath("/hr/settings/emails", "layout");
    revalidatePath("/hr/settings/emails/other/uniform-terms", "page");
    revalidatePath("/hr/assets/uniform/employees");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error
          ? e.message
          : "Failed to save uniform T&Cs email settings.",
    };
  }
}

async function loadStaffUniformItems(
  supabase: Parameters<typeof listUniformStaffItems>[0],
  staffId: string,
): Promise<UniformStaffItemRow[]> {
  const items = await listUniformStaffItems(supabase);
  return items.filter((item) => item.staff_id === staffId);
}

export async function previewUniformTermsEmail(input: {
  staffId: string;
}): Promise<
  | { ok: true; preview: UniformTermsEmailPreview }
  | { ok: false; error: string }
> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { ok: false, error: auth.error };

  const denied = requireSendPermission(auth.permissions, auth.venue.id);
  if (denied) return { ok: false, error: denied };

  const settings = await getUniformTermsEmailSettings();
  if (!settings.enabled) {
    return {
      ok: false,
      error:
        "Uniform T&Cs emails are disabled. Enable them under Settings → Emails → Other templates → Uniform T&Cs.",
    };
  }

  const { data: staffRow, error: staffError } = await auth.supabase
    .from("staff")
    .select(STAFF_SELECT)
    .eq("id", input.staffId)
    .maybeSingle();

  if (staffError) return { ok: false, error: staffError.message };
  if (!staffRow) return { ok: false, error: "Staff member not found." };

  const staff = {
    id: String(staffRow.id),
    emp_no: String(staffRow.emp_no ?? ""),
    full_name: String(staffRow.full_name ?? ""),
    personal_email: (staffRow.personal_email as string | null) ?? null,
    work_email: (staffRow.work_email as string | null) ?? null,
    home_venue_id: (staffRow.home_venue_id as string | null) ?? null,
  };

  if (
    !auth.venue.is_global &&
    staff.home_venue_id &&
    staff.home_venue_id !== auth.venue.id
  ) {
    return { ok: false, error: "Staff member is not in this venue." };
  }

  const items = await loadStaffUniformItems(auth.supabase, staff.id);
  if (items.length === 0) {
    return {
      ok: false,
      error: "This employee has no uniform pieces on hand to confirm.",
    };
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

  const vars = buildUniformTermsEmailVars({
    staff,
    venueName: auth.venue.name,
    userName,
    items,
  });
  const composed = composeUniformTermsEmailContent({
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

  return {
    ok: true,
    preview: {
      enabled: settings.enabled,
      staffId: staff.id,
      empNo: staff.emp_no,
      employeeName: staff.full_name || "Employee",
      itemCount: items.length,
      totalValueLabel: vars.UNIFORMS_TOTAL_VALUE,
      to: composed.to,
      subject: composed.subject,
      body: composed.body,
    },
  };
}

export async function sendUniformTermsEmail(input: {
  staffId: string;
  draft?: { to: string; subject: string; body: string };
}): Promise<{ ok: true; to: string } | { ok: false; error: string }> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { ok: false, error: auth.error };

  const denied = requireSendPermission(auth.permissions, auth.venue.id);
  if (denied) return { ok: false, error: denied };

  const settings = await getUniformTermsEmailSettings();

  const { data: staffRow, error: staffError } = await auth.supabase
    .from("staff")
    .select(STAFF_SELECT)
    .eq("id", input.staffId)
    .maybeSingle();

  if (staffError) return { ok: false, error: staffError.message };
  if (!staffRow) return { ok: false, error: "Staff member not found." };

  const staff = {
    id: String(staffRow.id),
    emp_no: String(staffRow.emp_no ?? ""),
    full_name: String(staffRow.full_name ?? ""),
    personal_email: (staffRow.personal_email as string | null) ?? null,
    work_email: (staffRow.work_email as string | null) ?? null,
    home_venue_id: (staffRow.home_venue_id as string | null) ?? null,
  };

  if (
    !auth.venue.is_global &&
    staff.home_venue_id &&
    staff.home_venue_id !== auth.venue.id
  ) {
    return { ok: false, error: "Staff member is not in this venue." };
  }

  const items = await loadStaffUniformItems(auth.supabase, staff.id);

  const { data: profile } = await auth.supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", auth.user.id)
    .maybeSingle();
  const userName =
    String(profile?.full_name ?? "").trim() ||
    String(profile?.email ?? auth.user.email ?? "").trim() ||
    "User";

  const result = await deliverUniformTermsEmail({
    venue: auth.venue,
    staff,
    items,
    settings,
    userName,
    actorId: auth.user.id,
    supabase: auth.supabase,
    draft: input.draft ?? null,
  });

  if (result.ok) {
    revalidatePath("/hr/assets/uniform/employees");
  }
  return result;
}
