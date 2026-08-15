"use server";

import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { getActionAuthContext } from "@/lib/auth/action-context";
import { recordOutboundStaffEmail } from "@/lib/email/record-staff-email";
import {
  resolveVenueFromEmail,
  sendAppEmail,
} from "@/lib/email/transport";
import {
  acknowledgementPublicUrl,
  acknowledgementReminderBody,
  acknowledgementReminderLabel,
  acknowledgementReminderSubject,
  DEFAULT_HR_ACKNOWLEDGEMENT_PAGE_SETTINGS,
  DEFAULT_HR_ACKNOWLEDGEMENT_REMINDER_SETTINGS,
  mergeAcknowledgementPageSettings,
  mergeAcknowledgementReminderSettings,
  resolveAcknowledgementButtonLabel,
  type AcknowledgementSendHistory,
  type AcknowledgementSendHistoryItem,
  type HrAcknowledgementPageSettings,
  type HrAcknowledgementReminderSettings,
  type HrAcknowledgementSentEmail,
  type HrEmailAcknowledgementRecord,
} from "@/lib/hr/acknowledgement";
import {
  getAcknowledgementRecordById,
  incrementAcknowledgementReminderCount,
  listAcknowledgementRecordsForVenue,
  loadAcknowledgementPageSettings,
  loadAcknowledgementReminderSettings,
  loadAcknowledgementSentEmail,
  submitAcknowledgementRecord,
} from "@/lib/hr/acknowledgement-store";
import { buildHrTemplateEmailHtml } from "@/lib/hr/email-logo";
import { canAdminLookups, canEditStaff, canViewStaff } from "@/lib/hr/permissions";
import { HR_MODULE_KEY, HR_SETTINGS_KEYS } from "@/lib/hr/types";
import { createServiceClient } from "@/lib/supabase/service";

async function getAuth() {
  const ctx = await getActionAuthContext();
  if ("error" in ctx) return { error: ctx.error } as const;
  return ctx;
}

export async function getAcknowledgementPageSettings(): Promise<HrAcknowledgementPageSettings> {
  const auth = await getAuth();
  if ("error" in auth) return DEFAULT_HR_ACKNOWLEDGEMENT_PAGE_SETTINGS;
  return loadAcknowledgementPageSettings(auth.supabase, auth.venue.id);
}

export async function saveAcknowledgementPageSettings(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const auth = await getAuth();
    if ("error" in auth) return { ok: false, error: auth.error };
    const { user, venue, permissions } = auth;

    if (
      !canEditStaff(permissions, venue.id) &&
      !canAdminLookups(permissions, venue.id)
    ) {
      return { ok: false, error: "No permission to save these settings." };
    }

    const value = mergeAcknowledgementPageSettings({
      heading: String(formData.get("heading") ?? ""),
      intro: String(formData.get("intro") ?? ""),
      emailButtonLabel: String(formData.get("email_button_label") ?? ""),
      acknowledgeButtonLabel: String(
        formData.get("acknowledge_button_label") ?? "",
      ),
      declineButtonLabel: String(formData.get("decline_button_label") ?? ""),
      commentsPrompt: String(formData.get("comments_prompt") ?? ""),
      submittedHeading: String(formData.get("submitted_heading") ?? ""),
      submittedMessage: String(formData.get("submitted_message") ?? ""),
    });

    const service = createServiceClient();
    const { error } = await service.from("hr_venue_settings").upsert(
      {
        venue_id: venue.id,
        key: HR_SETTINGS_KEYS.acknowledgementPage,
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
      entity_id: HR_SETTINGS_KEYS.acknowledgementPage,
      venue_id: venue.id,
      after: { heading: value.heading },
    });

    revalidatePath("/hr/settings/emails", "layout");
    revalidatePath("/hr/settings/emails/acknowledgements", "page");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error
          ? e.message
          : "Failed to save acknowledgement page settings.",
    };
  }
}

export async function getAcknowledgementReminderSettings(): Promise<HrAcknowledgementReminderSettings> {
  const auth = await getAuth();
  if ("error" in auth) return DEFAULT_HR_ACKNOWLEDGEMENT_REMINDER_SETTINGS;
  return loadAcknowledgementReminderSettings(auth.supabase, auth.venue.id);
}

export async function saveAcknowledgementReminderSettings(
  input: Partial<HrAcknowledgementReminderSettings>,
): Promise<
  | { ok: true; settings: HrAcknowledgementReminderSettings }
  | { ok: false; error: string }
> {
  try {
    const auth = await getAuth();
    if ("error" in auth) return { ok: false, error: auth.error };
    const { user, venue, permissions } = auth;

    if (
      !canEditStaff(permissions, venue.id) &&
      !canAdminLookups(permissions, venue.id)
    ) {
      return { ok: false, error: "No permission to save these settings." };
    }

    const value = mergeAcknowledgementReminderSettings(input);
    const service = createServiceClient();
    const { error } = await service.from("hr_venue_settings").upsert(
      {
        venue_id: venue.id,
        key: HR_SETTINGS_KEYS.acknowledgementReminders,
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
      entity_id: HR_SETTINGS_KEYS.acknowledgementReminders,
      venue_id: venue.id,
      after: value,
    });

    revalidatePath("/hr/communications/acknowledgements", "layout");
    return { ok: true, settings: value };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error
          ? e.message
          : "Failed to save acknowledgement reminder settings.",
    };
  }
}

export async function listEmailAcknowledgements(): Promise<
  HrEmailAcknowledgementRecord[]
> {
  const auth = await getAuth();
  if ("error" in auth) return [];
  if (!canViewStaff(auth.permissions, auth.venue.id)) return [];
  return listAcknowledgementRecordsForVenue(auth.supabase, auth.venue.id);
}

export async function getAcknowledgementSentEmail(
  recordId: string,
): Promise<
  | { ok: true; email: HrAcknowledgementSentEmail }
  | { ok: false; error: string }
> {
  const auth = await getAuth();
  if ("error" in auth) return { ok: false, error: auth.error };
  if (!canViewStaff(auth.permissions, auth.venue.id)) {
    return { ok: false, error: "No permission to view this email." };
  }
  const email = await loadAcknowledgementSentEmail(
    auth.supabase,
    auth.venue.id,
    recordId,
  );
  if (!email) return { ok: false, error: "Sent email not found." };
  return { ok: true, email };
}

export async function getAcknowledgementSentEmails(
  recordIds: string[],
): Promise<
  | { ok: true; emails: Record<string, HrAcknowledgementSentEmail | null> }
  | { ok: false; error: string }
> {
  const auth = await getAuth();
  if ("error" in auth) return { ok: false, error: auth.error };
  if (!canViewStaff(auth.permissions, auth.venue.id)) {
    return { ok: false, error: "No permission to view these emails." };
  }
  const ids = [...new Set(recordIds.map((id) => String(id ?? "").trim()).filter(Boolean))];
  const emails: Record<string, HrAcknowledgementSentEmail | null> = {};
  await Promise.all(
    ids.map(async (id) => {
      emails[id] = await loadAcknowledgementSentEmail(
        auth.supabase,
        auth.venue.id,
        id,
      );
    }),
  );
  return { ok: true, emails };
}

export async function submitPublicEmailAcknowledgement(input: {
  token: string;
  decision: "acknowledged" | "not_acknowledged";
  comments: string;
}): Promise<
  | { ok: true; record: HrEmailAcknowledgementRecord }
  | { ok: false; error: string }
> {
  return submitAcknowledgementRecord({
    token: input.token,
    status: input.decision,
    comments: input.comments,
  });
}

export async function sendAcknowledgementReminder(
  recordId: string,
): Promise<
  | { ok: true; to: string; reminderCount: number }
  | { ok: false; error: string }
> {
  try {
    const auth = await getAuth();
    if ("error" in auth) return { ok: false, error: auth.error };
    const { user, venue, permissions, supabase } = auth;

    if (
      !canEditStaff(permissions, venue.id) &&
      !canAdminLookups(permissions, venue.id)
    ) {
      return { ok: false, error: "No permission to send acknowledgement reminders." };
    }

    const record = await getAcknowledgementRecordById(
      supabase,
      venue.id,
      recordId,
    );
    if (!record) return { ok: false, error: "Acknowledgement record not found." };
    if (record.status !== "pending") {
      return {
        ok: false,
        error: "This employee has already responded. A reminder is not needed.",
      };
    }

    const to = record.recipientEmail?.trim() || "";
    if (!to) {
      return {
        ok: false,
        error: "This acknowledgement has no employee email to remind.",
      };
    }

    const service = createServiceClient();
    const [page, fromEmail] = await Promise.all([
      loadAcknowledgementPageSettings(service, venue.id),
      resolveVenueFromEmail(service, venue.id),
    ]);
    const venueName = String(venue.name ?? "").trim();
    const reminderNumber = record.reminderCount + 1;
    const subject = acknowledgementReminderSubject(
      record.subject,
      reminderNumber,
    );
    const body = acknowledgementReminderBody({
      employeeName: record.staffName,
      subject: record.subject,
      venueName,
      reminderNumber,
    });
    const { html, inlineAttachments } = await buildHrTemplateEmailHtml({
      body,
      venue: {
        id: venue.id,
        slug: venue.slug ?? "",
        name: venueName,
      },
      acknowledgement: {
        url: acknowledgementPublicUrl(record.token),
        buttonLabel: resolveAcknowledgementButtonLabel(page.emailButtonLabel, {
          employeeName: record.staffName,
          employeeEmail: to,
          subject: record.subject,
          venueName,
        }),
      },
    });

    const sendResult = await sendAppEmail(
      {
        to,
        subject,
        html,
        attachments:
          inlineAttachments.length > 0 ? inlineAttachments : undefined,
        fromOverride: fromEmail || undefined,
      },
      { venueId: venue.id, supabase: service },
    );

    const reminderCount = await incrementAcknowledgementReminderCount(
      service,
      venue.id,
      record.id,
      record.reminderCount,
    );

    const auditId = await writeAuditLog({
      actor_id: user.id,
      action: "acknowledgement.reminder_sent",
      module_key: HR_MODULE_KEY,
      entity: "hr_email_acknowledgements",
      entity_id: record.id,
      venue_id: venue.id,
      after: {
        to,
        subject,
        originalSubject: record.subject,
        reminderCount,
      },
    });

    if (sendResult.messageId && auditId && record.staffId) {
      await recordOutboundStaffEmail({
        supabase: service,
        venueId: venue.id,
        staffId: record.staffId,
        rfcMessageId: sendResult.messageId,
        subject,
        fromEmail: fromEmail || null,
        toEmail: to,
        bodyHtml: html,
        bodyText: body,
        sourceKind: "audit",
        sourceId: auditId,
      });
    }

    revalidatePath("/hr/communications/acknowledgements", "layout");
    return { ok: true, to, reminderCount };
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof Error ? e.message : "Failed to send the reminder email.",
    };
  }
}

export async function getAcknowledgementSendHistory(
  recordId: string,
): Promise<
  | { ok: true; history: AcknowledgementSendHistory }
  | { ok: false; error: string }
> {
  const auth = await getAuth();
  if ("error" in auth) return { ok: false, error: auth.error };
  if (!canViewStaff(auth.permissions, auth.venue.id)) {
    return { ok: false, error: "No permission to view these emails." };
  }

  const record = await getAcknowledgementRecordById(
    auth.supabase,
    auth.venue.id,
    recordId,
  );
  if (!record) return { ok: false, error: "Acknowledgement record not found." };

  const service = createServiceClient();
  const original = await loadAcknowledgementSentEmail(
    auth.supabase,
    auth.venue.id,
    record.id,
  );

  const items: AcknowledgementSendHistoryItem[] = [
    {
      id: `original:${record.id}`,
      kind: "original",
      label: "Original send",
      sentAt: original?.sentAt || record.sentAt,
      to: original?.to || record.recipientEmail,
      from: original?.from ?? null,
      subject: original?.subject || record.subject,
      bodyHtml: original?.html ?? null,
      bodyText: original?.text ?? null,
    },
  ];

  const { data: audits } = await service
    .from("audit_log")
    .select("id, after, created_at")
    .eq("venue_id", auth.venue.id)
    .eq("action", "acknowledgement.reminder_sent")
    .eq("entity", "hr_email_acknowledgements")
    .eq("entity_id", record.id)
    .order("created_at", { ascending: true });

  const auditRows = audits ?? [];
  const auditIds = auditRows.map((row) => String(row.id));
  const messagesBySource = new Map<
    string,
    { from: string | null; html: string | null; text: string | null }
  >();

  if (auditIds.length > 0) {
    const { data: messages } = await service
      .from("hr_email_messages")
      .select("source_id, from_email, body_html, body_text")
      .eq("venue_id", auth.venue.id)
      .eq("source_kind", "audit")
      .in("source_id", auditIds);
    for (const message of messages ?? []) {
      const sourceId = String(message.source_id ?? "").trim();
      if (!sourceId) continue;
      messagesBySource.set(sourceId, {
        from: String(message.from_email ?? "").trim() || null,
        html: String(message.body_html ?? "").trim() || null,
        text: String(message.body_text ?? "").trim() || null,
      });
    }
  }

  auditRows.forEach((row, index) => {
    const after =
      row.after && typeof row.after === "object" && !Array.isArray(row.after)
        ? (row.after as Record<string, unknown>)
        : {};
    const storedCount = Number(after.reminderCount);
    const reminderNumber =
      Number.isFinite(storedCount) && storedCount > 0
        ? Math.floor(storedCount)
        : index + 1;
    const stored = messagesBySource.get(String(row.id));
    items.push({
      id: String(row.id),
      kind: "reminder",
      label: acknowledgementReminderLabel(reminderNumber),
      sentAt: String(row.created_at ?? ""),
      to: String(after.to ?? "").trim() || record.recipientEmail,
      from: stored?.from ?? original?.from ?? null,
      subject:
        String(after.subject ?? "").trim() ||
        acknowledgementReminderSubject(record.subject, reminderNumber),
      bodyHtml: stored?.html ?? null,
      bodyText: stored?.text ?? null,
    });
  });

  return {
    ok: true,
    history: {
      staffName: record.staffName,
      emailKindLabel: record.emailKindLabel,
      reminderCount: record.reminderCount,
      items,
    },
  };
}
