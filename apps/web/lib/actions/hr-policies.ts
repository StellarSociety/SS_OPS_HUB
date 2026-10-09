"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import {
  getActionAuthContext,
  type ActionAuthContext,
} from "@/lib/auth/action-context";
import { recordOutboundStaffEmail } from "@/lib/email/record-staff-email";
import { sendAppEmail } from "@/lib/email/transport";
import { acknowledgementCtaForSend } from "@/lib/hr/acknowledgement-store";
import { buildHrTemplateEmailHtml } from "@/lib/hr/email-logo";
import {
  canAdminLookups,
  canEditStaff,
  canViewStaff,
  hasHrFeatureAccess,
} from "@/lib/hr/permissions";
import {
  mergeHrPolicySettings,
  parsePolicyEmailKind,
  policyEmailKind,
  type HrPolicySettings,
  type PolicyAckCounts,
  type PolicyRecipientRecord,
  type PolicyStaffOption,
  type PolicySummary,
  type PolicyTemplate,
} from "@/lib/hr/policies";
import {
  applyPolicyHtmlPlaceholders,
  legacyPolicyMessageToHtml,
  policyHtmlIsEmpty,
  policyHtmlToEmailHtml,
  policyHtmlToText,
  sanitizePolicyHtml,
} from "@/lib/hr/policy-html";
import { getHrVenueSetting } from "@/lib/hr/store";
import { HR_MODULE_KEY, HR_SETTINGS_KEYS } from "@/lib/hr/types";
import { createServiceClient } from "@/lib/supabase/service";

const POLICIES_PATH = "/hr/communications/policies";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

function canView(auth: ActionAuthContext): boolean {
  return (
    hasHrFeatureAccess(auth.permissions, "communications", auth.venue.id) ||
    canViewStaff(auth.permissions, auth.venue.id)
  );
}

function canManage(auth: ActionAuthContext): boolean {
  return (
    canEditStaff(auth.permissions, auth.venue.id) ||
    canAdminLookups(auth.permissions, auth.venue.id)
  );
}

async function loadSettings(auth: ActionAuthContext): Promise<HrPolicySettings> {
  const stored = await getHrVenueSetting<Partial<HrPolicySettings>>(
    createServiceClient(),
    auth.venue.id,
    HR_SETTINGS_KEYS.policyTemplates,
    {},
  );
  const settings = mergeHrPolicySettings(stored);
  return {
    ...settings,
    // Clients always get sanitized HTML, whatever format it was saved in.
    policies: settings.policies.map((policy) => ({
      ...policy,
      message:
        policy.format === "html"
          ? sanitizePolicyHtml(policy.message)
          : legacyPolicyMessageToHtml(policy.message),
      format: "html" as const,
    })),
  };
}

async function storeSettings(
  auth: ActionAuthContext,
  value: HrPolicySettings,
): Promise<string | null> {
  const { error } = await createServiceClient()
    .from("hr_venue_settings")
    .upsert(
      {
        venue_id: auth.venue.id,
        key: HR_SETTINGS_KEYS.policyTemplates,
        value,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "venue_id,key" },
    );
  return error?.message ?? null;
}

type AckRow = {
  id: string;
  staff_id: string | null;
  staff_name: string;
  emp_no: string | null;
  recipient_email: string | null;
  email_kind: string;
  status: string;
  comments: string | null;
  sent_at: string;
  responded_at: string | null;
  reminder_count: number | null;
};

async function loadPolicyAckRows(
  venueId: string,
  policyId?: string,
): Promise<AckRow[]> {
  const rows: AckRow[] = [];
  for (let page = 0; ; page += 1000) {
    const { data, error } = await createServiceClient()
      .from("hr_email_acknowledgements")
      .select(
        "id, staff_id, staff_name, emp_no, recipient_email, email_kind, status, comments, sent_at, responded_at, reminder_count",
      )
      .eq("venue_id", venueId)
      .like("email_kind", policyId ? `policy:${policyId}:%` : "policy:%")
      .order("sent_at", { ascending: false })
      .range(page, page + 999);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as AckRow[]));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

function toRecord(row: AckRow): PolicyRecipientRecord {
  const status =
    row.status === "acknowledged" || row.status === "not_acknowledged"
      ? row.status
      : "pending";
  return {
    id: row.id,
    staffId: row.staff_id,
    staffName: row.staff_name,
    empNo: row.emp_no,
    recipientEmail: row.recipient_email,
    version: parsePolicyEmailKind(row.email_kind)?.version ?? 1,
    status,
    comments: row.comments ?? "",
    sentAt: row.sent_at,
    respondedAt: row.responded_at,
    reminderCount: Number(row.reminder_count) || 0,
  };
}

/**
 * Counts for the current version, one response per employee: the latest
 * email to each person decides their status.
 */
function countCurrent(
  records: PolicyRecipientRecord[],
  version: number,
): PolicyAckCounts {
  const latest = new Map<string, PolicyRecipientRecord>();
  for (const record of records) {
    if (record.version !== version) continue;
    const key = record.staffId ?? record.recipientEmail ?? record.id;
    const seen = latest.get(key);
    if (!seen || seen.sentAt < record.sentAt) latest.set(key, record);
  }
  const counts: PolicyAckCounts = {
    sent: latest.size,
    acknowledged: 0,
    pending: 0,
    declined: 0,
  };
  for (const record of latest.values()) {
    if (record.status === "acknowledged") counts.acknowledged += 1;
    else if (record.status === "not_acknowledged") counts.declined += 1;
    else counts.pending += 1;
  }
  return counts;
}

export async function listPolicies(): Promise<
  Result<{ policies: PolicySummary[]; canManage: boolean }>
> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { ok: false, error: auth.error };
  if (!canView(auth)) return { ok: false, error: "No permission to view policies." };

  const [settings, rows] = await Promise.all([
    loadSettings(auth),
    loadPolicyAckRows(auth.venue.id),
  ]);
  const byPolicy = new Map<string, PolicyRecipientRecord[]>();
  for (const row of rows) {
    const parsed = parsePolicyEmailKind(row.email_kind);
    if (!parsed) continue;
    const list = byPolicy.get(parsed.policyId) ?? [];
    list.push(toRecord(row));
    byPolicy.set(parsed.policyId, list);
  }

  const policies = settings.policies
    .map((policy) => {
      const records = byPolicy.get(policy.id) ?? [];
      return {
        ...policy,
        current: countCurrent(records, policy.version),
        totalSent: records.length,
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));

  return { ok: true, policies, canManage: canManage(auth) };
}

export async function getPolicyDetail(policyId: string): Promise<
  Result<{
    policy: PolicySummary;
    records: PolicyRecipientRecord[];
    staff: PolicyStaffOption[];
    canManage: boolean;
  }>
> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { ok: false, error: auth.error };
  if (!canView(auth)) return { ok: false, error: "No permission to view policies." };

  const settings = await loadSettings(auth);
  const policy = settings.policies.find((p) => p.id === policyId);
  if (!policy) return { ok: false, error: "Policy not found." };

  const service = createServiceClient();
  const [rows, { data: staffRows }] = await Promise.all([
    loadPolicyAckRows(auth.venue.id, policy.id),
    service
      .from("staff")
      .select(
        "id, emp_no, full_name, work_email, personal_email, photo_url, department:departments(name), position:positions(name), employment_status:employment_statuses(name)",
      )
      .eq("home_venue_id", auth.venue.id)
      .eq("org_chart_only", false)
      .order("emp_no"),
  ]);

  const records = rows.map(toRecord);
  const one = <T,>(value: T | T[] | null | undefined): T | null =>
    (Array.isArray(value) ? value[0] : value) ?? null;

  const staff: PolicyStaffOption[] = (staffRows ?? [])
    .filter((row) => {
      const status = one(row.employment_status as { name?: string } | null);
      return !/terminat|resign|left|inactive/i.test(String(status?.name ?? ""));
    })
    .map((row) => ({
      id: String(row.id),
      empNo: String(row.emp_no ?? ""),
      fullName: String(row.full_name ?? "").trim() || "Employee",
      department: one(row.department as { name?: string } | null)?.name ?? null,
      position: one(row.position as { name?: string } | null)?.name ?? null,
      email: resolveRecipient(settings.recipientField, {
        work_email: row.work_email as string | null,
        personal_email: row.personal_email as string | null,
      }),
      photoUrl: (row.photo_url as string | null) ?? null,
    }));

  return {
    ok: true,
    policy: {
      ...policy,
      current: countCurrent(records, policy.version),
      totalSent: records.length,
    },
    records,
    staff,
    canManage: canManage(auth),
  };
}

export async function savePolicy(input: {
  id?: string | null;
  title: string;
  description: string;
  subject: string;
  message: string;
}): Promise<Result<{ policy: PolicyTemplate }>> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { ok: false, error: auth.error };
  if (!canManage(auth)) return { ok: false, error: "No permission to edit policies." };

  const title = input.title.trim();
  const subject = input.subject.trim();
  const message = sanitizePolicyHtml(input.message);
  if (!title) return { ok: false, error: "Give the policy a title." };
  if (!subject) return { ok: false, error: "Enter an email subject." };
  if (policyHtmlIsEmpty(message)) {
    return { ok: false, error: "The policy text is empty." };
  }

  const settings = await loadSettings(auth);
  const now = new Date().toISOString();
  const existing = input.id
    ? settings.policies.find((p) => p.id === input.id)
    : undefined;
  if (input.id && !existing) return { ok: false, error: "Policy not found." };

  const contentChanged =
    existing != null &&
    (existing.subject !== subject ||
      // Formatting-only edits keep the version; wording changes start a new one.
      policyHtmlToText(existing.message) !== policyHtmlToText(message));
  const policy: PolicyTemplate = existing
    ? {
        ...existing,
        title,
        description: input.description.trim(),
        subject,
        message,
        format: "html",
        // New wording needs a fresh acknowledgement, but only once sent.
        version: contentChanged ? existing.version + 1 : existing.version,
        updatedAt: now,
      }
    : {
        id: randomUUID(),
        title,
        description: input.description.trim(),
        subject,
        message,
        format: "html",
        version: 1,
        archived: false,
        createdAt: now,
        updatedAt: now,
      };

  if (existing && contentChanged) {
    // Unsent wording can change without starting a new version.
    const sentCurrent = await loadPolicyAckRows(auth.venue.id, existing.id).then(
      (rows) =>
        rows.some(
          (row) => parsePolicyEmailKind(row.email_kind)?.version === existing.version,
        ),
    );
    if (!sentCurrent) policy.version = existing.version;
  }

  const policies = existing
    ? settings.policies.map((p) => (p.id === policy.id ? policy : p))
    : [...settings.policies, policy];
  const error = await storeSettings(auth, { ...settings, policies });
  if (error) return { ok: false, error };

  await writeAuditLog({
    actor_id: auth.user.id,
    action: existing ? "update" : "create",
    module_key: HR_MODULE_KEY,
    entity: "hr_policy_template",
    entity_id: policy.id,
    venue_id: auth.venue.id,
    after: { title: policy.title, version: policy.version },
  });

  revalidatePath(POLICIES_PATH, "layout");
  return { ok: true, policy };
}

export async function setPolicyArchived(input: {
  id: string;
  archived: boolean;
}): Promise<Result> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { ok: false, error: auth.error };
  if (!canManage(auth)) return { ok: false, error: "No permission to edit policies." };

  const settings = await loadSettings(auth);
  if (!settings.policies.some((p) => p.id === input.id)) {
    return { ok: false, error: "Policy not found." };
  }
  const policies = settings.policies.map((p) =>
    p.id === input.id
      ? { ...p, archived: input.archived, updatedAt: new Date().toISOString() }
      : p,
  );
  const error = await storeSettings(auth, { ...settings, policies });
  if (error) return { ok: false, error };

  revalidatePath(POLICIES_PATH, "layout");
  return { ok: true };
}

/** Only policies never sent can be deleted; sent ones are archived instead. */
export async function deletePolicy(id: string): Promise<Result> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { ok: false, error: auth.error };
  if (!canManage(auth)) return { ok: false, error: "No permission to edit policies." };

  const rows = await loadPolicyAckRows(auth.venue.id, id);
  if (rows.length > 0) {
    return {
      ok: false,
      error: "This policy has been sent, so it keeps its records. Archive it instead.",
    };
  }
  const settings = await loadSettings(auth);
  const error = await storeSettings(auth, {
    ...settings,
    policies: settings.policies.filter((p) => p.id !== id),
  });
  if (error) return { ok: false, error };

  revalidatePath(POLICIES_PATH, "layout");
  return { ok: true };
}

export async function savePolicyDeliverySettings(input: {
  recipientField: HrPolicySettings["recipientField"];
  fromEmail: string;
}): Promise<Result> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { ok: false, error: auth.error };
  if (!canManage(auth)) return { ok: false, error: "No permission to edit policies." };

  const settings = await loadSettings(auth);
  const next = mergeHrPolicySettings({
    ...settings,
    recipientField: input.recipientField,
    fromEmail: input.fromEmail,
  });
  const error = await storeSettings(auth, next);
  if (error) return { ok: false, error };

  revalidatePath(POLICIES_PATH, "layout");
  return { ok: true };
}

export async function getPolicyDeliverySettings(): Promise<
  Pick<HrPolicySettings, "recipientField" | "fromEmail">
> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { recipientField: "work_then_personal", fromEmail: "" };
  const { recipientField, fromEmail } = await loadSettings(auth);
  return { recipientField, fromEmail };
}

function resolveRecipient(
  field: HrPolicySettings["recipientField"],
  staff: { work_email: string | null; personal_email: string | null },
): string | null {
  const work = staff.work_email?.trim() || null;
  const personal = staff.personal_email?.trim() || null;
  if (field === "work") return work;
  if (field === "personal") return personal;
  return work ?? personal;
}

function applyPlaceholders(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    return vars[key.toUpperCase()] ?? "";
  });
}

function todayLabel(): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());
}

/**
 * Email the current version of a policy to one employee with an
 * acknowledgement button. The client calls this once per employee so it can
 * show progress.
 */
export async function sendPolicyToEmployee(input: {
  policyId: string;
  staffId: string;
}): Promise<Result<{ to: string }>> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { ok: false, error: auth.error };
  if (!canManage(auth)) return { ok: false, error: "No permission to send policies." };

  const settings = await loadSettings(auth);
  const policy = settings.policies.find((p) => p.id === input.policyId);
  if (!policy) return { ok: false, error: "Policy not found." };
  if (policy.archived) return { ok: false, error: "This policy is archived." };

  const service = createServiceClient();
  const [{ data: staff }, { data: profile }] = await Promise.all([
    service
      .from("staff")
      .select(
        "id, emp_no, full_name, work_email, personal_email, home_venue_id, department:departments(name), position:positions(name)",
      )
      .eq("id", input.staffId)
      .maybeSingle(),
    auth.supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", auth.user.id)
      .maybeSingle(),
  ]);
  if (!staff) return { ok: false, error: "Employee not found." };
  if (
    !auth.venue.is_global &&
    staff.home_venue_id &&
    staff.home_venue_id !== auth.venue.id
  ) {
    return { ok: false, error: "Employee is not in this venue." };
  }

  const to = resolveRecipient(settings.recipientField, {
    work_email: staff.work_email as string | null,
    personal_email: staff.personal_email as string | null,
  });
  if (!to) return { ok: false, error: "No email on this staff record." };

  const one = <T,>(value: T | T[] | null | undefined): T | null =>
    (Array.isArray(value) ? value[0] : value) ?? null;
  const employeeName = String(staff.full_name ?? "").trim() || "Employee";
  const vars: Record<string, string> = {
    EMPLOYEE_NAME: employeeName,
    EMP_NO: String(staff.emp_no ?? "").trim(),
    POSITION: one(staff.position as { name?: string } | null)?.name ?? "",
    DEPARTMENT: one(staff.department as { name?: string } | null)?.name ?? "",
    POLICY_TITLE: policy.title,
    VENUE_NAME: auth.venue.name,
    USER_NAME:
      String(profile?.full_name ?? "").trim() ||
      String(profile?.email ?? auth.user.email ?? "").trim() ||
      "Human Resources",
    TODAY: todayLabel(),
  };
  const subject = applyPlaceholders(policy.subject, vars);
  const bodyHtml = policyHtmlToEmailHtml(
    applyPolicyHtmlPlaceholders(policy.message, vars),
  );
  const body = policyHtmlToText(bodyHtml);

  let ackToken: string | null = null;
  try {
    const acknowledgement = await acknowledgementCtaForSend({
      requiresAcknowledgement: true,
      venueId: auth.venue.id,
      staffId: staff.id,
      staffName: employeeName,
      empNo: (staff.emp_no as string | null) ?? null,
      recipientEmail: to,
      emailKind: policyEmailKind(policy.id, policy.version),
      emailKindLabel: policy.title,
      subject,
    });
    if (!acknowledgement) {
      return { ok: false, error: "Could not create the acknowledgement link." };
    }
    ackToken = acknowledgement.token;
    const { html, inlineAttachments } = await buildHrTemplateEmailHtml({
      body,
      bodyHtml,
      venue: auth.venue,
      acknowledgement,
    });
    const sent = await sendAppEmail(
      {
        to,
        subject,
        html,
        attachments: inlineAttachments.length > 0 ? inlineAttachments : undefined,
        fromOverride: settings.fromEmail || undefined,
      },
      { venueId: auth.venue.id, supabase: service },
    );
    ackToken = null;

    const auditId = await writeAuditLog({
      actor_id: auth.user.id,
      action: "policy_email.sent",
      module_key: HR_MODULE_KEY,
      entity: "staff",
      entity_id: staff.id,
      venue_id: auth.venue.id,
      after: {
        policyId: policy.id,
        policyTitle: policy.title,
        version: policy.version,
        to,
      },
    });
    if (sent.messageId && auditId) {
      await recordOutboundStaffEmail({
        supabase: service,
        venueId: auth.venue.id,
        staffId: staff.id,
        rfcMessageId: sent.messageId,
        subject,
        fromEmail: settings.fromEmail || null,
        toEmail: to,
        bodyHtml: html,
        bodyText: body,
        sourceKind: "audit",
        sourceId: auditId,
      });
    }
  } catch (err) {
    if (ackToken) {
      // Not delivered: drop the pending record so it does not count as sent.
      await service
        .from("hr_email_acknowledgements")
        .delete()
        .eq("token", ackToken)
        .eq("status", "pending");
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to send email.",
    };
  }

  return { ok: true, to };
}

/** Refresh the policy pages after a batch send finishes. */
export async function revalidatePolicies(): Promise<void> {
  revalidatePath(POLICIES_PATH, "layout");
  revalidatePath("/hr/communications/acknowledgements", "layout");
}
