"use server";

import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import {
  getActionAuthContext,
  type ActionAuthContext,
} from "@/lib/auth/action-context";
import { canAdminLookups, canEditStaff, canViewSalary } from "@/lib/hr/permissions";
import {
  DEFAULT_HR_POSITION_SALARY_EMAIL_SETTINGS,
  isPositionSalaryEmailKind,
  mergePositionSalaryEmailSettings,
  POSITION_SALARY_EMAIL_KINDS,
  POSITION_SALARY_EMAIL_KIND_LABELS,
  type HrPositionSalaryEmailSettings,
  type PositionSalaryEmailKind,
  type PositionSalaryEmailRecord,
} from "@/lib/hr/position-salary-email";
import {
  composePositionSalaryLetter,
  deliverPositionSalaryLetter,
  getPositionSalaryEmailSettingsFor,
  loadPositionSalaryChangeContext,
  recordPositionSalaryLetterSent,
  resolveCompanyName,
  toPositionSalaryEmailRecord,
} from "@/lib/hr/process-position-salary-emails";
import { HR_MODULE_KEY, HR_SETTINGS_KEYS } from "@/lib/hr/types";
import { createServiceClient } from "@/lib/supabase/service";

const PROMOTIONS_PATH = "/hr/staff/promotions";
const MAX_SCHEDULE_AHEAD_MS = 90 * 24 * 60 * 60 * 1000;

function flagTrue(raw: FormDataEntryValue | null): boolean {
  const v = String(raw ?? "").toLowerCase();
  return v === "true" || v === "on" || v === "1";
}

function canConfigure(auth: ActionAuthContext): boolean {
  return (
    canEditStaff(auth.permissions, auth.venue.id) ||
    canAdminLookups(auth.permissions, auth.venue.id)
  );
}

/** Letters quote salaries, so sending needs salary access too. */
function sendDenied(auth: ActionAuthContext): string | null {
  if (!canConfigure(auth)) return "No permission to send this email.";
  if (!canViewSalary(auth.permissions, auth.venue.id)) {
    return "You need salary access to send position and salary letters.";
  }
  return null;
}

async function signedInUserName(auth: ActionAuthContext): Promise<string> {
  const { data: profile } = await auth.supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", auth.user.id)
    .maybeSingle();
  return (
    String(profile?.full_name ?? "").trim() ||
    String(profile?.email ?? auth.user.email ?? "").trim() ||
    "Human Resources"
  );
}

export async function getPositionSalaryEmailSettings(): Promise<HrPositionSalaryEmailSettings> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return DEFAULT_HR_POSITION_SALARY_EMAIL_SETTINGS;
  return getPositionSalaryEmailSettingsFor(auth.supabase, auth.venue.id);
}

export async function savePositionSalaryEmailSettings(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { ok: false, error: auth.error };
  if (!canConfigure(auth)) {
    return { ok: false, error: "No permission to save these settings." };
  }

  let templates: unknown = {};
  try {
    templates = JSON.parse(String(formData.get("templates_json") ?? "{}"));
  } catch {
    return { ok: false, error: "Invalid templates payload." };
  }

  const next = mergePositionSalaryEmailSettings({
    enabled: flagTrue(formData.get("enabled")),
    recipientField: String(
      formData.get("recipient_field") ?? "",
    ) as HrPositionSalaryEmailSettings["recipientField"],
    fromEmail: String(formData.get("from_email") ?? ""),
    companyName: String(formData.get("company_name") ?? ""),
    templates: templates as HrPositionSalaryEmailSettings["templates"],
  });

  const service = createServiceClient();
  const { error } = await service.from("hr_venue_settings").upsert(
    {
      venue_id: auth.venue.id,
      key: HR_SETTINGS_KEYS.positionSalaryEmail,
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
    entity_id: HR_SETTINGS_KEYS.positionSalaryEmail,
    venue_id: auth.venue.id,
    after: { enabled: next.enabled, companyName: next.companyName },
  });

  revalidatePath("/hr/settings/emails", "layout");
  revalidatePath(PROMOTIONS_PATH);
  return { ok: true };
}

export type PositionSalaryEmailDraft = {
  kind: PositionSalaryEmailKind;
  label: string;
  to: string;
  subject: string;
  body: string;
  requiresAcknowledgement: boolean;
};

export type PositionSalaryEmailPreview = {
  changeId: string;
  employeeName: string;
  empNo: string;
  effectiveDate: string;
  /** One composed draft per template, so switching templates is instant. */
  drafts: PositionSalaryEmailDraft[];
};

type Loaded =
  | {
      ok: true;
      auth: ActionAuthContext;
      settings: HrPositionSalaryEmailSettings;
      ctx: NonNullable<Awaited<ReturnType<typeof loadPositionSalaryChangeContext>>>;
    }
  | { ok: false; error: string };

async function loadForSend(changeId: string): Promise<Loaded> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { ok: false, error: auth.error };
  const denied = sendDenied(auth);
  if (denied) return { ok: false, error: denied };

  const settings = await getPositionSalaryEmailSettingsFor(
    auth.supabase,
    auth.venue.id,
  );
  if (!settings.enabled) {
    return {
      ok: false,
      error:
        "Position and salary letters are off. Turn them on under Settings → Emails → Other templates → Position & Salary.",
    };
  }
  const ctx = await loadPositionSalaryChangeContext(
    createServiceClient(),
    auth.venue.id,
    changeId,
  );
  if (!ctx) return { ok: false, error: "This change could not be found." };
  return { ok: true, auth, settings, ctx };
}

export async function previewPositionSalaryEmail(input: {
  changeId: string;
}): Promise<
  { ok: true; preview: PositionSalaryEmailPreview } | { ok: false; error: string }
> {
  const loaded = await loadForSend(input.changeId);
  if (!loaded.ok) return loaded;
  const { auth, settings, ctx } = loaded;

  const [companyName, userName] = await Promise.all([
    resolveCompanyName(createServiceClient(), auth.venue, settings),
    signedInUserName(auth),
  ]);

  const drafts = POSITION_SALARY_EMAIL_KINDS.map((kind) => {
    const letter = composePositionSalaryLetter({
      settings,
      kind,
      ctx,
      venueName: auth.venue.name,
      companyName,
      userName,
    });
    return {
      kind,
      label: POSITION_SALARY_EMAIL_KIND_LABELS[kind],
      to: letter.to ?? "",
      subject: letter.subject,
      body: letter.body,
      requiresAcknowledgement: settings.templates[kind].requiresAcknowledgement,
    };
  });

  return {
    ok: true,
    preview: {
      changeId: ctx.changeId,
      employeeName: ctx.employeeName,
      empNo: ctx.empNo,
      effectiveDate: ctx.effectiveDate,
      drafts,
    },
  };
}

type SendInput = {
  changeId: string;
  kind: string;
  to: string;
  subject: string;
  body: string;
};

function validateDraft(
  input: SendInput,
): { ok: true; kind: PositionSalaryEmailKind } | { ok: false; error: string } {
  if (!isPositionSalaryEmailKind(input.kind)) {
    return { ok: false, error: "Choose a template." };
  }
  if (!input.to.trim()) {
    return { ok: false, error: "Enter a destination email address." };
  }
  if (!input.subject.trim()) return { ok: false, error: "Enter a subject." };
  if (!input.body.trim()) return { ok: false, error: "The message is empty." };
  return { ok: true, kind: input.kind };
}

export async function sendPositionSalaryEmail(
  input: SendInput,
): Promise<
  { ok: true; record: PositionSalaryEmailRecord } | { ok: false; error: string }
> {
  const valid = validateDraft(input);
  if (!valid.ok) return valid;
  const loaded = await loadForSend(input.changeId);
  if (!loaded.ok) return loaded;
  const { auth, settings, ctx } = loaded;

  const service = createServiceClient();
  const to = input.to.trim();
  const subject = input.subject.trim();
  const fromEmail = settings.fromEmail || null;
  const requiresAcknowledgement =
    settings.templates[valid.kind].requiresAcknowledgement;

  let delivered: Awaited<ReturnType<typeof deliverPositionSalaryLetter>>;
  try {
    delivered = await deliverPositionSalaryLetter({
      service,
      venue: auth.venue,
      staff: { id: ctx.staffId, fullName: ctx.employeeName, empNo: ctx.empNo },
      kind: valid.kind,
      to,
      fromEmail,
      subject,
      body: input.body,
      requiresAcknowledgement,
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to send email.",
    };
  }

  const sentAt = new Date().toISOString();
  const { data: row, error } = await service
    .from("hr_position_salary_emails")
    .insert({
      venue_id: auth.venue.id,
      staff_id: ctx.staffId,
      change_id: ctx.changeId,
      kind: valid.kind,
      status: "sent",
      provider: delivered.provider,
      to_email: to,
      from_email: fromEmail,
      subject,
      message: input.body,
      requires_acknowledgement: requiresAcknowledgement,
      sent_at: sentAt,
      created_by: auth.user.id,
    })
    .select("id, change_id, kind, status, to_email, subject, sent_at, scheduled_at")
    .single();
  if (error || !row) {
    // The email went out; only the record failed. Report success.
    console.error("[hr] sendPositionSalaryEmail persist:", error?.message);
  }

  await recordPositionSalaryLetterSent({
    service,
    venueId: auth.venue.id,
    staffId: ctx.staffId,
    rowId: row?.id ?? "",
    kind: valid.kind,
    to,
    fromEmail,
    subject,
    body: input.body,
    html: delivered.html,
    messageId: delivered.messageId,
    actorId: auth.user.id,
    scheduled: false,
  });

  revalidatePath(PROMOTIONS_PATH);
  return {
    ok: true,
    record: row
      ? toPositionSalaryEmailRecord(row)
      : {
          id: "",
          changeId: ctx.changeId,
          kind: valid.kind,
          status: "sent",
          to,
          subject,
          sentAt,
          scheduledAt: null,
        },
  };
}

export async function schedulePositionSalaryEmail(
  input: SendInput & { scheduledAt: string },
): Promise<
  { ok: true; record: PositionSalaryEmailRecord } | { ok: false; error: string }
> {
  const valid = validateDraft(input);
  if (!valid.ok) return valid;

  const when = new Date(input.scheduledAt);
  if (Number.isNaN(when.getTime())) {
    return { ok: false, error: "Choose a date and time to schedule." };
  }
  const now = Date.now();
  if (when.getTime() < now + 60_000) {
    return {
      ok: false,
      error: "Schedule time must be at least 1 minute in the future.",
    };
  }
  if (when.getTime() > now + MAX_SCHEDULE_AHEAD_MS) {
    return { ok: false, error: "Schedule time cannot be more than 90 days ahead." };
  }

  const loaded = await loadForSend(input.changeId);
  if (!loaded.ok) return loaded;
  const { auth, settings, ctx } = loaded;

  const service = createServiceClient();
  // One pending letter per change: a new schedule replaces the old one.
  await service
    .from("hr_position_salary_emails")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("venue_id", auth.venue.id)
    .eq("change_id", ctx.changeId)
    .eq("status", "scheduled")
    .eq("provider", "scheduled");

  const { data: row, error } = await service
    .from("hr_position_salary_emails")
    .insert({
      venue_id: auth.venue.id,
      staff_id: ctx.staffId,
      change_id: ctx.changeId,
      kind: valid.kind,
      status: "scheduled",
      provider: "scheduled",
      to_email: input.to.trim(),
      from_email: settings.fromEmail || null,
      subject: input.subject.trim(),
      message: input.body,
      requires_acknowledgement:
        settings.templates[valid.kind].requiresAcknowledgement,
      scheduled_at: when.toISOString(),
      created_by: auth.user.id,
    })
    .select("id, change_id, kind, status, to_email, subject, sent_at, scheduled_at")
    .single();
  if (error || !row) {
    return { ok: false, error: error?.message ?? "Failed to schedule email." };
  }

  await writeAuditLog({
    actor_id: auth.user.id,
    action: "position_salary_email.scheduled",
    module_key: HR_MODULE_KEY,
    entity: "staff",
    entity_id: ctx.staffId,
    venue_id: auth.venue.id,
    after: {
      emailId: row.id,
      kind: valid.kind,
      to: row.to_email,
      scheduledAt: row.scheduled_at,
    },
  });

  revalidatePath(PROMOTIONS_PATH);
  return { ok: true, record: toPositionSalaryEmailRecord(row) };
}

export async function cancelScheduledPositionSalaryEmail(input: {
  emailId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { ok: false, error: auth.error };
  const denied = sendDenied(auth);
  if (denied) return { ok: false, error: denied };

  const { data, error } = await createServiceClient()
    .from("hr_position_salary_emails")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("venue_id", auth.venue.id)
    .eq("id", input.emailId)
    .eq("status", "scheduled")
    .eq("provider", "scheduled")
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) {
    return { ok: false, error: "This email is already being sent or was sent." };
  }

  revalidatePath(PROMOTIONS_PATH);
  return { ok: true };
}
