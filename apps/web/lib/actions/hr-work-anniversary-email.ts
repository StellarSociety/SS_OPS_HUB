"use server";

import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { getActionAuthContext } from "@/lib/auth/action-context";
import {
  buildWorkAnniversaryEmailVars,
  composeWorkAnniversaryEmailContent,
  deliverWorkAnniversaryEmail,
  mergeWorkAnniversaryEmailSettings,
} from "@/lib/hr/process-work-anniversary-emails";
import { canAdminLookups, canEditStaff } from "@/lib/hr/permissions";
import { formatDateOnly } from "@/lib/hr/derived";
import { getHrVenueSetting } from "@/lib/hr/store";
import {
  DEFAULT_HR_WORK_ANNIVERSARY_EMAIL_SETTINGS,
  HR_MODULE_KEY,
  HR_SETTINGS_KEYS,
  type HrWorkAnniversaryEmailSettings,
  type PayslipEmailRecipientField,
} from "@/lib/hr/types";
import { createServiceClient } from "@/lib/supabase/service";

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

export type WorkAnniversaryEmailPreview = {
  enabled: boolean;
  staffId: string;
  empNo: string;
  employeeName: string;
  years: number;
  anniversaryDate: string;
  anniversaryDateLabel: string;
  to: string;
  subject: string;
  body: string;
};

export async function getWorkAnniversaryEmailSettings(): Promise<HrWorkAnniversaryEmailSettings> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return DEFAULT_HR_WORK_ANNIVERSARY_EMAIL_SETTINGS;

  const stored = await getHrVenueSetting<
    Partial<HrWorkAnniversaryEmailSettings>
  >(
    auth.supabase,
    auth.venue.id,
    HR_SETTINGS_KEYS.workAnniversaryEmail,
    {},
  );
  return mergeWorkAnniversaryEmailSettings(stored);
}

export async function saveWorkAnniversaryEmailSettings(
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
      : "work_then_personal"
  ) as PayslipEmailRecipientField;

  const enabled = flagTrue(formData.get("enabled"));
  const next = mergeWorkAnniversaryEmailSettings({
    enabled,
    autoSendOnAnniversary:
      enabled && flagTrue(formData.get("auto_send_on_anniversary")),
    recipientField,
    fromEmail: String(formData.get("from_email") ?? ""),
    subject: String(formData.get("subject") ?? ""),
    message: String(formData.get("message") ?? ""),
    requiresAcknowledgement: flagTrue(formData.get("requires_acknowledgement")),
  });

  try {
    const service = createServiceClient();
    const { error } = await service.from("hr_venue_settings").upsert(
      {
        venue_id: auth.venue.id,
        key: HR_SETTINGS_KEYS.workAnniversaryEmail,
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
      entity_id: HR_SETTINGS_KEYS.workAnniversaryEmail,
      venue_id: auth.venue.id,
      after: {
        enabled: next.enabled,
        autoSendOnAnniversary: next.autoSendOnAnniversary,
      },
    });

    revalidatePath("/hr/settings/emails", "layout");
    revalidatePath("/hr/settings/emails/other/work-anniversary", "page");
    revalidatePath("/hr/staff/insights");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error
          ? e.message
          : "Failed to save work anniversary email settings.",
    };
  }
}

export async function previewWorkAnniversaryEmail(input: {
  staffId: string;
  years: number;
  anniversaryDate: string;
}): Promise<
  { ok: true; preview: WorkAnniversaryEmailPreview } | { ok: false; error: string }
> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { ok: false, error: auth.error };

  const denied = requireSendPermission(auth.permissions, auth.venue.id);
  if (denied) return { ok: false, error: denied };

  const settings = await getWorkAnniversaryEmailSettings();
  if (!settings.enabled) {
    return {
      ok: false,
      error:
        "Work anniversary emails are disabled. Enable them under Settings → Emails → Other templates.",
    };
  }

  const { data: staff, error: staffError } = await auth.supabase
    .from("staff")
    .select(
      "id, emp_no, full_name, work_email, personal_email, home_venue_id",
    )
    .eq("id", input.staffId)
    .maybeSingle();

  if (staffError) return { ok: false, error: staffError.message };
  if (!staff) return { ok: false, error: "Staff member not found." };
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

  const years = Math.max(1, Math.floor(Number(input.years) || 0));
  const vars = buildWorkAnniversaryEmailVars({
    staff: {
      emp_no: (staff.emp_no as string | null) ?? null,
      full_name: (staff.full_name as string | null) ?? null,
    },
    venueName: auth.venue.name,
    years,
    anniversaryDate: input.anniversaryDate,
    userName,
  });
  const composed = composeWorkAnniversaryEmailContent({
    settings,
    vars,
    staff: {
      work_email: (staff.work_email as string | null) ?? null,
      personal_email: (staff.personal_email as string | null) ?? null,
    },
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
      empNo: String(staff.emp_no ?? "").trim(),
      employeeName: String(staff.full_name ?? "").trim() || "Employee",
      years,
      anniversaryDate: input.anniversaryDate,
      anniversaryDateLabel: formatDateOnly(input.anniversaryDate),
      to: composed.to,
      subject: composed.subject,
      body: composed.body,
    },
  };
}

export async function sendWorkAnniversaryEmail(input: {
  staffId: string;
  years: number;
  anniversaryDate: string;
  draft?: { to: string; subject: string; body: string };
}): Promise<{ ok: true; to: string } | { ok: false; error: string }> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { ok: false, error: auth.error };

  const denied = requireSendPermission(auth.permissions, auth.venue.id);
  if (denied) return { ok: false, error: denied };

  const settings = await getWorkAnniversaryEmailSettings();

  const { data: staff, error: staffError } = await auth.supabase
    .from("staff")
    .select(
      "id, emp_no, full_name, work_email, personal_email, home_venue_id",
    )
    .eq("id", input.staffId)
    .maybeSingle();

  if (staffError) return { ok: false, error: staffError.message };
  if (!staff) return { ok: false, error: "Staff member not found." };
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

  return deliverWorkAnniversaryEmail({
    venue: auth.venue,
    staff: {
      id: staff.id,
      emp_no: (staff.emp_no as string | null) ?? null,
      full_name: (staff.full_name as string | null) ?? null,
      work_email: (staff.work_email as string | null) ?? null,
      personal_email: (staff.personal_email as string | null) ?? null,
    },
    settings,
    years: input.years,
    anniversaryDate: input.anniversaryDate,
    userName,
    actorId: auth.user.id,
    supabase: auth.supabase,
    draft: input.draft ?? null,
  });
}
