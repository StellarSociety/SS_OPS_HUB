"use server";

import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { getActionAuthContext } from "@/lib/auth/action-context";
import { canAdminLookups, canEditStaff } from "@/lib/hr/permissions";
import {
  buildUniformReplacementEmailVars,
  composeUniformReplacementEmailContent,
  deliverUniformReplacementEmail,
  mergeUniformReplacementEmailSettings,
} from "@/lib/hr/process-uniform-replacement-emails";
import { getHrVenueSetting } from "@/lib/hr/store";
import {
  DEFAULT_HR_UNIFORM_REPLACEMENT_EMAIL_SETTINGS,
  HR_MODULE_KEY,
  HR_SETTINGS_KEYS,
  type HrUniformReplacementEmailSettings,
  type PayslipEmailRecipientField,
} from "@/lib/hr/types";
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

export type UniformReplacementEmailPreview = {
  enabled: boolean;
  staffId: string;
  empNo: string;
  employeeName: string;
  deductionAmountLabel: string;
  to: string;
  subject: string;
  body: string;
  replacementIds: string[];
};

export async function getUniformReplacementEmailSettings(): Promise<HrUniformReplacementEmailSettings> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return DEFAULT_HR_UNIFORM_REPLACEMENT_EMAIL_SETTINGS;

  const stored = await getHrVenueSetting<
    Partial<HrUniformReplacementEmailSettings>
  >(
    auth.supabase,
    auth.venue.id,
    HR_SETTINGS_KEYS.uniformReplacementEmail,
    {},
  );
  return mergeUniformReplacementEmailSettings(stored);
}

export async function saveUniformReplacementEmailSettings(
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

  const next = mergeUniformReplacementEmailSettings({
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
        key: HR_SETTINGS_KEYS.uniformReplacementEmail,
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
      entity_id: HR_SETTINGS_KEYS.uniformReplacementEmail,
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
          : "Failed to save uniform replacement email settings.",
    };
  }
}

async function loadReplacementLines(
  supabase: ReturnType<typeof createServiceClient>,
  replacementIds: string[],
): Promise<{ name: string; quantity: number; lineValue: number }[]> {
  if (replacementIds.length === 0) return [];
  const { data } = await supabase
    .from("hr_uniform_replacements")
    .select(
      `
      quantity,
      unit_value,
      piece:hr_uniform_pieces(name)
    `,
    )
    .in("id", replacementIds);

  return (data ?? []).map((row) => {
    const pieceRaw = row.piece as
      | { name: string }
      | { name: string }[]
      | null;
    const piece = Array.isArray(pieceRaw) ? pieceRaw[0] : pieceRaw;
    const qty = Number(row.quantity ?? 0);
    const unit = Number(row.unit_value ?? 0);
    return {
      name: String(piece?.name ?? "Uniform piece"),
      quantity: qty,
      lineValue: unit * qty,
    };
  });
}

export async function previewUniformReplacementEmail(input: {
  staffId: string;
  replacementIds: string[];
  deductionAmount: number;
}): Promise<
  | { ok: true; preview: UniformReplacementEmailPreview }
  | { ok: false; error: string }
> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { ok: false, error: auth.error };

  const denied = requireSendPermission(auth.permissions, auth.venue.id);
  if (denied) return { ok: false, error: denied };

  const settings = await getUniformReplacementEmailSettings();
  if (!settings.enabled) {
    return {
      ok: false,
      error:
        "Uniform replacement emails are disabled. Enable them under Settings → Emails → Other templates → Uniform.",
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

  const service = createServiceClient();
  const lines = await loadReplacementLines(service, input.replacementIds);
  const deductionAmount =
    input.deductionAmount > 0
      ? input.deductionAmount
      : lines.reduce((sum, line) => sum + line.lineValue, 0);

  if (!(deductionAmount > 0)) {
    return {
      ok: false,
      error: "No deduction amount to notify for this replacement.",
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

  const vars = buildUniformReplacementEmailVars({
    staff,
    venueName: auth.venue.name,
    userName,
    deductionAmount,
    lines,
  });
  const composed = composeUniformReplacementEmailContent({
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
      deductionAmountLabel: vars.DEDUCTION_AMOUNT,
      to: composed.to,
      subject: composed.subject,
      body: composed.body,
      replacementIds: input.replacementIds,
    },
  };
}

export async function sendUniformReplacementEmail(input: {
  staffId: string;
  replacementIds: string[];
  deductionAmount: number;
  draft?: { to: string; subject: string; body: string };
}): Promise<{ ok: true; to: string } | { ok: false; error: string }> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { ok: false, error: auth.error };

  const denied = requireSendPermission(auth.permissions, auth.venue.id);
  if (denied) return { ok: false, error: denied };

  const settings = await getUniformReplacementEmailSettings();

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

  const service = createServiceClient();
  const lines = await loadReplacementLines(service, input.replacementIds);
  const deductionAmount =
    input.deductionAmount > 0
      ? input.deductionAmount
      : lines.reduce((sum, line) => sum + line.lineValue, 0);

  const { data: profile } = await auth.supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", auth.user.id)
    .maybeSingle();
  const userName =
    String(profile?.full_name ?? "").trim() ||
    String(profile?.email ?? auth.user.email ?? "").trim() ||
    "User";

  const result = await deliverUniformReplacementEmail({
    venue: auth.venue,
    staff,
    deductionAmount,
    lines,
    settings,
    userName,
    actorId: auth.user.id,
    supabase: auth.supabase,
    draft: input.draft ?? null,
    replacementIds: input.replacementIds,
  });

  if (result.ok) {
    revalidatePath("/hr/assets/uniform/employees");
  }
  return result;
}
