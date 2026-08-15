"use server";

import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { getActionAuthContext } from "@/lib/auth/action-context";
import { canAdminLookups, canEditStaff } from "@/lib/hr/permissions";
import {
  buildAssetTermsEmailVars,
  composeAssetTermsEmailContent,
  deliverAssetTermsEmail,
  mergeAssetTermsEmailSettings,
} from "@/lib/hr/process-asset-terms-emails";
import { getHrVenueSetting } from "@/lib/hr/store";
import {
  DEFAULT_HR_ASSET_TERMS_EMAIL_SETTINGS,
  HR_MODULE_KEY,
  HR_SETTINGS_KEYS,
  type HrAssetTermsEmailSettings,
  type PayslipEmailRecipientField,
  type AssetStaffItemRow,
} from "@/lib/hr/types";
import { listAssetStaffItems } from "@/lib/hr/assets-store";
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

export type AssetTermsEmailPreview = {
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

export type AssetTermsEmailSendRecord = {
  id: string;
  sentAt: string;
  to: string | null;
  itemCount: number | null;
  totalValue: number | null;
  sentBy: string | null;
};

export async function listAssetTermsEmailSends(input: {
  staffId: string;
}): Promise<
  | { ok: true; sends: AssetTermsEmailSendRecord[] }
  | { ok: false; error: string }
> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { ok: false, error: auth.error };

  const denied = requireSendPermission(auth.permissions, auth.venue.id);
  if (denied) return { ok: false, error: denied };

  const staffId = String(input.staffId ?? "").trim();
  if (!staffId) return { ok: false, error: "Staff member not found." };

  try {
    const service = createServiceClient();
    const { data, error } = await service
      .from("audit_log")
      .select("id, actor_id, after, created_at")
      .eq("venue_id", auth.venue.id)
      .eq("entity", "staff")
      .eq("entity_id", staffId)
      .eq("action", "asset_terms_email.sent")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) return { ok: false, error: error.message };

    const rows = data ?? [];
    const actorIds = [
      ...new Set(
        rows
          .map((row) =>
            row.actor_id ? String(row.actor_id).trim() : "",
          )
          .filter(Boolean),
      ),
    ];

    const actorNames = new Map<string, string>();
    if (actorIds.length > 0) {
      const { data: profiles } = await service
        .from("profiles")
        .select("id, full_name, email")
        .in("id", actorIds);
      for (const profile of profiles ?? []) {
        const name =
          String(profile.full_name ?? "").trim() ||
          String(profile.email ?? "").trim();
        if (name) actorNames.set(String(profile.id), name);
      }
    }

    const sends: AssetTermsEmailSendRecord[] = rows.map((row) => {
      const after =
        row.after && typeof row.after === "object" && !Array.isArray(row.after)
          ? (row.after as Record<string, unknown>)
          : {};
      const itemCountRaw = after.itemCount;
      const totalValueRaw = after.totalValue;
      const itemCount =
        typeof itemCountRaw === "number"
          ? itemCountRaw
          : itemCountRaw != null && String(itemCountRaw).trim() !== ""
            ? Number(itemCountRaw)
            : null;
      const totalValue =
        typeof totalValueRaw === "number"
          ? totalValueRaw
          : totalValueRaw != null && String(totalValueRaw).trim() !== ""
            ? Number(totalValueRaw)
            : null;
      const actorId = row.actor_id ? String(row.actor_id) : "";
      return {
        id: String(row.id),
        sentAt: String(row.created_at),
        to: String(after.to ?? "").trim() || null,
        itemCount:
          itemCount != null && Number.isFinite(itemCount) ? itemCount : null,
        totalValue:
          totalValue != null && Number.isFinite(totalValue) ? totalValue : null,
        sentBy: actorId ? (actorNames.get(actorId) ?? null) : null,
      };
    });

    return { ok: true, sends };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error
          ? e.message
          : "Failed to load previous asset T&Cs sends.",
    };
  }
}

export async function getAssetTermsEmailSettings(): Promise<HrAssetTermsEmailSettings> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return DEFAULT_HR_ASSET_TERMS_EMAIL_SETTINGS;

  const stored = await getHrVenueSetting<Partial<HrAssetTermsEmailSettings>>(
    auth.supabase,
    auth.venue.id,
    HR_SETTINGS_KEYS.assetTermsEmail,
    {},
  );
  return mergeAssetTermsEmailSettings(stored);
}

export async function saveAssetTermsEmailSettings(
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

  const next = mergeAssetTermsEmailSettings({
    enabled: flagTrue(formData.get("enabled")),
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
        key: HR_SETTINGS_KEYS.assetTermsEmail,
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
      entity_id: HR_SETTINGS_KEYS.assetTermsEmail,
      venue_id: auth.venue.id,
      after: { enabled: next.enabled },
    });

    revalidatePath("/hr/settings/emails", "layout");
    revalidatePath("/hr/settings/emails/other/asset-terms", "page");
    revalidatePath("/hr/assets/catalog/employees");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error
          ? e.message
          : "Failed to save asset T&Cs email settings.",
    };
  }
}

async function loadStaffAssetItems(
  supabase: Parameters<typeof listAssetStaffItems>[0],
  staffId: string,
): Promise<AssetStaffItemRow[]> {
  return listAssetStaffItems(supabase, { staffId });
}

export async function previewAssetTermsEmail(input: {
  staffId: string;
}): Promise<
  | { ok: true; preview: AssetTermsEmailPreview }
  | { ok: false; error: string }
> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { ok: false, error: auth.error };

  const denied = requireSendPermission(auth.permissions, auth.venue.id);
  if (denied) return { ok: false, error: denied };

  const settings = await getAssetTermsEmailSettings();
  if (!settings.enabled) {
    return {
      ok: false,
      error:
        "Asset T&Cs emails are disabled. Enable them under Settings → Emails → Other templates → Asset T&Cs.",
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

  const items = await loadStaffAssetItems(auth.supabase, staff.id);
  if (items.length === 0) {
    return {
      ok: false,
      error: "This employee has no assets on hand to confirm.",
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

  const vars = buildAssetTermsEmailVars({
    staff,
    venueName: auth.venue.name,
    userName,
    items,
  });
  const composed = composeAssetTermsEmailContent({
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
      totalValueLabel: vars.ASSETS_TOTAL_VALUE,
      to: composed.to,
      subject: composed.subject,
      body: composed.body,
    },
  };
}

export async function sendAssetTermsEmail(input: {
  staffId: string;
  draft?: { to: string; subject: string; body: string };
}): Promise<{ ok: true; to: string } | { ok: false; error: string }> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { ok: false, error: auth.error };

  const denied = requireSendPermission(auth.permissions, auth.venue.id);
  if (denied) return { ok: false, error: denied };

  const settings = await getAssetTermsEmailSettings();

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

  const items = await loadStaffAssetItems(auth.supabase, staff.id);

  const { data: profile } = await auth.supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", auth.user.id)
    .maybeSingle();
  const userName =
    String(profile?.full_name ?? "").trim() ||
    String(profile?.email ?? auth.user.email ?? "").trim() ||
    "User";

  const result = await deliverAssetTermsEmail({
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
    revalidatePath("/hr/assets/catalog/employees");
  }
  return result;
}
