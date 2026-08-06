"use server";

import { unstable_cache } from "next/cache";
import { getActionAuthContext } from "@/lib/auth/action-context";
import { formatPayrollMonthLabel } from "@/lib/hr/payroll/period";
import { canAdminLookups, canViewStaff } from "@/lib/hr/permissions";
import { boardingEmailActionLabel, parseBoardingEmailAction } from "@/lib/hr/types";
import { createServiceClient } from "@/lib/supabase/service";

export type StaffCommunicationKind =
  | "boarding_email"
  | "payslip_email"
  | "work_anniversary_email"
  | "updated_docs_request_email"
  | "uniform_terms_email"
  | "uniform_replacement_email"
  | "hub_invite_email"
  | "inbound_reply";

export type StaffCommunicationItem = {
  id: string;
  kind: StaffCommunicationKind;
  /** Short label shown as the row title. */
  title: string;
  status: string | null;
  subject: string | null;
  to: string | null;
  /** ISO timestamp used for sorting and display. */
  occurredAt: string;
  meta: Record<string, unknown> | null;
  /** Total messages in the thread (outbound + replies). 0/1 means no replies stored. */
  threadSize: number;
  threadId: string | null;
};

export type StaffCommunicationDetail = StaffCommunicationItem & {
  fromEmail: string | null;
  message: string | null;
  provider: string | null;
  templateName: string | null;
  /** True when a stored message body is available to display. */
  hasMessageBody: boolean;
  detailNote: string | null;
  /** Direction when loaded from hr_email_messages. */
  direction: "outbound" | "inbound" | null;
};

export type StaffThreadMessageHeader = {
  id: string;
  direction: "outbound" | "inbound";
  subject: string | null;
  fromEmail: string | null;
  to: string | null;
  occurredAt: string;
};

function asIso(value: string | null | undefined, fallback?: string): string {
  const raw = String(value ?? "").trim();
  if (raw) return raw;
  return fallback ?? new Date(0).toISOString();
}

function kindLabel(kind: StaffCommunicationKind): string {
  switch (kind) {
    case "boarding_email":
      return "Boarding email";
    case "payslip_email":
      return "Payslip email";
    case "work_anniversary_email":
      return "Work anniversary";
    case "updated_docs_request_email":
      return "Updated docs request";
    case "uniform_terms_email":
      return "Uniform terms";
    case "uniform_replacement_email":
      return "Uniform replacement";
    case "hub_invite_email":
      return "Hub invite";
    case "inbound_reply":
      return "Reply";
  }
}

function auditActionToKind(action: string): StaffCommunicationKind | null {
  switch (action) {
    case "work_anniversary_email.sent":
      return "work_anniversary_email";
    case "updated_docs_request_email.sent":
      return "updated_docs_request_email";
    case "uniform_terms_email.sent":
      return "uniform_terms_email";
    case "uniform_replacement_email.sent":
      return "uniform_replacement_email";
    default:
      return null;
  }
}

function auditTitle(
  kind: StaffCommunicationKind,
  after: Record<string, unknown>,
): string {
  if (kind === "work_anniversary_email") {
    const years = after.years != null ? Number(after.years) : null;
    return years
      ? `Work anniversary · ${years} year${years === 1 ? "" : "s"}`
      : kindLabel(kind);
  }
  if (kind === "updated_docs_request_email") {
    const docLabel = String(after.docLabel ?? "").trim();
    return docLabel ? `Updated docs · ${docLabel}` : kindLabel(kind);
  }
  if (kind === "uniform_terms_email") {
    const count = after.itemCount != null ? Number(after.itemCount) : null;
    return count != null && Number.isFinite(count)
      ? `Uniform terms · ${count} item${count === 1 ? "" : "s"}`
      : kindLabel(kind);
  }
  if (kind === "uniform_replacement_email") {
    return kindLabel(kind);
  }
  if (kind === "hub_invite_email") {
    return after.resent ? "Hub invite resent" : "Hub invite";
  }
  return kindLabel(kind);
}

function parseCommunicationId(id: string): {
  kind: "boarding" | "payslip" | "audit" | "invite" | "msg";
  sourceId: string;
} | null {
  const [prefix, ...rest] = id.split(":");
  const sourceId = rest.join(":").trim();
  if (!sourceId) return null;
  if (
    prefix === "boarding" ||
    prefix === "payslip" ||
    prefix === "audit" ||
    prefix === "invite" ||
    prefix === "msg"
  ) {
    return { kind: prefix, sourceId };
  }
  return null;
}

function sourceKey(
  kind: "boarding" | "payslip" | "audit" | "invite",
  sourceId: string,
): string {
  return `${kind}:${sourceId}`;
}

async function requireCommsAuth() {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { error: auth.error } as const;
  if (
    !canViewStaff(auth.permissions, auth.venue.id) &&
    !canAdminLookups(auth.permissions, auth.venue.id)
  ) {
    return { error: "No permission to view communications." } as const;
  }
  return auth;
}

function loadThreadMetaFromRows(
  rows: Array<{
    id?: string;
    thread_id?: string;
    direction?: string;
    source_kind?: string | null;
    source_id?: string | null;
  }>,
): Map<string, { threadId: string; threadSize: number; outboundMessageId: string }> {
  const map = new Map<
    string,
    { threadId: string; threadSize: number; outboundMessageId: string }
  >();

  const sizeByThread = new Map<string, number>();
  for (const row of rows) {
    const threadId = String(row.thread_id ?? "").trim();
    if (!threadId) continue;
    sizeByThread.set(threadId, (sizeByThread.get(threadId) ?? 0) + 1);
  }

  for (const row of rows) {
    if (row.direction !== "outbound") continue;
    const sourceKind = String(row.source_kind ?? "").trim();
    const sourceId = String(row.source_id ?? "").trim();
    const threadId = String(row.thread_id ?? "").trim();
    if (!sourceKind || !sourceId || !threadId) continue;
    if (
      sourceKind !== "boarding" &&
      sourceKind !== "payslip" &&
      sourceKind !== "audit" &&
      sourceKind !== "invite"
    ) {
      continue;
    }
    map.set(sourceKey(sourceKind, sourceId), {
      threadId,
      threadSize: sizeByThread.get(threadId) ?? 1,
      outboundMessageId: String(row.id),
    });
  }

  return map;
}

function attachThreadMeta(
  item: Omit<StaffCommunicationItem, "threadSize" | "threadId"> & {
    sourceKind: "boarding" | "payslip" | "audit" | "invite";
    sourceId: string;
  },
  threadMeta: Map<
    string,
    { threadId: string; threadSize: number; outboundMessageId: string }
  >,
): StaffCommunicationItem {
  const meta = threadMeta.get(sourceKey(item.sourceKind, item.sourceId));
  const { sourceKind: _sk, sourceId: _sid, ...rest } = item;
  return {
    ...rest,
    threadSize: meta?.threadSize ?? 0,
    threadId: meta?.threadId ?? null,
  };
}

type ListRpcPayload = {
  boarding?: Array<Record<string, unknown>>;
  payslips?: Array<Record<string, unknown>>;
  audits?: Array<Record<string, unknown>>;
  invites?: Array<Record<string, unknown>>;
  threads?: Array<{
    id?: string;
    thread_id?: string;
    direction?: string;
    source_kind?: string | null;
    source_id?: string | null;
  }>;
};

const fetchStaffCommunicationRows = unstable_cache(
  async (venueId: string, staffId: string): Promise<ListRpcPayload> => {
    const service = createServiceClient();
    const { data, error } = await service.rpc("list_staff_communication_rows", {
      p_venue_id: venueId,
      p_staff_id: staffId,
    });
    if (error) throw new Error(error.message);
    return (data ?? {}) as ListRpcPayload;
  },
  ["list-staff-communication-rows-v1"],
  { revalidate: 20 },
);

export async function listStaffCommunications(input: {
  staffId: string;
}): Promise<
  | { ok: true; items: StaffCommunicationItem[] }
  | { ok: false; error: string }
> {
  try {
    const auth = await requireCommsAuth();
    if ("error" in auth) return { ok: false, error: auth.error };

    const staffId = String(input.staffId ?? "").trim();
    if (!staffId) return { ok: false, error: "Staff member not found." };

    const venueId = auth.venue.id;
    let payload: ListRpcPayload;
    try {
      payload = await fetchStaffCommunicationRows(venueId, staffId);
    } catch (err) {
      return {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : "Failed to load communications trail.",
      };
    }

    const threadMeta = loadThreadMetaFromRows(payload.threads ?? []);
    const items: StaffCommunicationItem[] = [];

    for (const row of payload.boarding ?? []) {
      const action = parseBoardingEmailAction(String(row.action ?? ""));
      const status = String(row.status ?? "").trim() || null;
      const occurredAt = asIso(
        status === "scheduled"
          ? (row.scheduled_at as string | null)
          : ((row.sent_at as string | null) ??
              (row.recorded_at as string | null)),
        row.recorded_at as string,
      );
      items.push(
        attachThreadMeta(
          {
            id: `boarding:${row.id}`,
            kind: "boarding_email",
            title: boardingEmailActionLabel(action),
            status,
            subject: String(row.subject ?? "").trim() || null,
            to: String(row.to_email ?? "").trim() || null,
            occurredAt,
            meta: { action },
            sourceKind: "boarding",
            sourceId: String(row.id),
          },
          threadMeta,
        ),
      );
    }

    for (const row of payload.payslips ?? []) {
      const monthRaw = String(row.payroll_month ?? "").trim();
      const month = monthRaw ? formatPayrollMonthLabel(monthRaw) : "";
      const version = Number(row.version) || 1;
      const status = String(row.email_status ?? "").trim() || null;
      items.push(
        attachThreadMeta(
          {
            id: `payslip:${row.id}`,
            kind: "payslip_email",
            title: month
              ? `Payslip · ${month}${version > 1 ? ` (v${version})` : ""}`
              : `Payslip${version > 1 ? ` v${version}` : ""}`,
            status,
            subject: null,
            to: null,
            occurredAt: asIso(
              row.email_sent_at as string | null,
              row.created_at as string,
            ),
            meta: {
              emailError: row.email_error ?? null,
              payrollMonth: monthRaw || null,
              version,
            },
            sourceKind: "payslip",
            sourceId: String(row.id),
          },
          threadMeta,
        ),
      );
    }

    for (const row of payload.audits ?? []) {
      const action = String(row.action ?? "");
      const kind = auditActionToKind(action);
      if (!kind) continue;
      const after =
        row.after && typeof row.after === "object" && !Array.isArray(row.after)
          ? (row.after as Record<string, unknown>)
          : {};
      items.push(
        attachThreadMeta(
          {
            id: `audit:${row.id}`,
            kind,
            title: auditTitle(kind, after),
            status: "sent",
            subject: null,
            to: String(after.to ?? "").trim() || null,
            occurredAt: asIso(row.created_at as string),
            meta: after,
            sourceKind: "audit",
            sourceId: String(row.id),
          },
          threadMeta,
        ),
      );
    }

    const seenInviteIds = new Set<string>();
    for (const row of payload.invites ?? []) {
      const id = String(row.id ?? "");
      if (!id || seenInviteIds.has(id)) continue;
      seenInviteIds.add(id);

      const after =
        row.after && typeof row.after === "object" && !Array.isArray(row.after)
          ? (row.after as Record<string, unknown>)
          : {};
      if (
        String(row.entity ?? "") === "user" &&
        String(after.method ?? "") === "direct_password"
      ) {
        continue;
      }
      const email = String(after.email ?? "").trim();
      if (!email && String(row.entity ?? "") === "user") continue;

      const resent =
        String(row.entity ?? "") === "user_invite" || Boolean(after.resent);
      items.push(
        attachThreadMeta(
          {
            id: `invite:${id}`,
            kind: "hub_invite_email",
            title: auditTitle("hub_invite_email", { ...after, resent }),
            status: after.emailError ? "failed" : "sent",
            subject: resent
              ? "Your SS Operational Hub invitation"
              : "You're invited to the SS Operational Hub",
            to: email || null,
            occurredAt: asIso(row.created_at as string),
            meta: { ...after, resent },
            sourceKind: "invite",
            sourceId: id,
          },
          threadMeta,
        ),
      );
    }

    items.sort(
      (a, b) =>
        new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
    );

    return { ok: true, items };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Failed to load communications trail.",
    };
  }
}

async function resolveThreadForSource(params: {
  service: ReturnType<typeof createServiceClient>;
  venueId: string;
  sourceKind: "boarding" | "payslip" | "audit" | "invite";
  sourceId: string;
}): Promise<{ threadId: string | null; threadSize: number }> {
  // Multiple outbound Message-IDs can share the same source — take any one.
  const { data: outboundRows } = await params.service
    .from("hr_email_messages")
    .select("thread_id")
    .eq("venue_id", params.venueId)
    .eq("source_kind", params.sourceKind)
    .eq("source_id", params.sourceId)
    .eq("direction", "outbound")
    .limit(1);

  const outbound = outboundRows?.[0] ?? null;
  const threadId = outbound?.thread_id
    ? String(outbound.thread_id)
    : null;
  if (!threadId) return { threadId: null, threadSize: 0 };

  const { count } = await params.service
    .from("hr_email_messages")
    .select("id", { count: "exact", head: true })
    .eq("thread_id", threadId);

  return { threadId, threadSize: count ?? 1 };
}

export async function getStaffCommunicationDetail(input: {
  id: string;
}): Promise<
  | { ok: true; detail: StaffCommunicationDetail }
  | { ok: false; error: string }
> {
  try {
    const auth = await requireCommsAuth();
    if ("error" in auth) return { ok: false, error: auth.error };

    const parsed = parseCommunicationId(String(input.id ?? "").trim());
    if (!parsed) return { ok: false, error: "Communication not found." };

    const service = createServiceClient();
    const venueId = auth.venue.id;

    if (parsed.kind === "msg") {
      const { data, error } = await service
        .from("hr_email_messages")
        .select(
          "id, thread_id, direction, subject, from_email, to_email, body_html, body_text, occurred_at, source_kind, source_id",
        )
        .eq("venue_id", venueId)
        .eq("id", parsed.sourceId)
        .maybeSingle();
      if (error) return { ok: false, error: error.message };
      if (!data) return { ok: false, error: "Communication not found." };

      const direction =
        data.direction === "inbound" ? "inbound" : "outbound";
      const body =
        String(data.body_html ?? "").trim() ||
        String(data.body_text ?? "").trim() ||
        null;
      const { count } = await service
        .from("hr_email_messages")
        .select("id", { count: "exact", head: true })
        .eq("thread_id", data.thread_id);

      const sourceKind = String(data.source_kind ?? "").trim();
      let kind: StaffCommunicationKind =
        direction === "inbound" ? "inbound_reply" : "boarding_email";
      if (direction === "outbound") {
        if (sourceKind === "payslip") kind = "payslip_email";
        else if (sourceKind === "invite") kind = "hub_invite_email";
        else if (sourceKind === "audit") kind = "work_anniversary_email";
        else kind = "boarding_email";
      }

      return {
        ok: true,
        detail: {
          id: `msg:${data.id}`,
          kind,
          title:
            direction === "inbound"
              ? "Reply"
              : String(data.subject ?? "").trim() || "Email",
          status: direction === "inbound" ? "received" : "sent",
          subject: String(data.subject ?? "").trim() || null,
          to: String(data.to_email ?? "").trim() || null,
          occurredAt: asIso(data.occurred_at as string),
          meta: {
            sourceKind: data.source_kind,
            sourceId: data.source_id,
          },
          threadSize: count ?? 1,
          threadId: String(data.thread_id),
          fromEmail: String(data.from_email ?? "").trim() || null,
          message: body,
          provider: null,
          templateName: null,
          hasMessageBody: Boolean(body),
          detailNote: body
            ? null
            : "No message body on file for this thread message.",
          direction,
        },
      };
    }

    if (parsed.kind === "boarding") {
      const { data, error } = await service
        .from("hr_boarding_emails")
        .select(
          "id, action, status, to_email, from_email, subject, message, template_name, provider, recorded_at, sent_at, scheduled_at",
        )
        .eq("venue_id", venueId)
        .eq("id", parsed.sourceId)
        .maybeSingle();
      if (error) return { ok: false, error: error.message };
      if (!data) return { ok: false, error: "Communication not found." };

      const action = parseBoardingEmailAction(String(data.action ?? ""));
      const status = String(data.status ?? "").trim() || null;
      const message = String(data.message ?? "");
      const occurredAt = asIso(
        status === "scheduled"
          ? (data.scheduled_at as string | null)
          : ((data.sent_at as string | null) ??
              (data.recorded_at as string | null)),
        data.recorded_at as string,
      );
      const thread = await resolveThreadForSource({
        service,
        venueId,
        sourceKind: "boarding",
        sourceId: String(data.id),
      });

      return {
        ok: true,
        detail: {
          id: `boarding:${data.id}`,
          kind: "boarding_email",
          title: boardingEmailActionLabel(action),
          status,
          subject: String(data.subject ?? "").trim() || null,
          to: String(data.to_email ?? "").trim() || null,
          occurredAt,
          meta: { action },
          ...thread,
          fromEmail: String(data.from_email ?? "").trim() || null,
          message: message.trim() || null,
          provider: String(data.provider ?? "").trim() || null,
          templateName: String(data.template_name ?? "").trim() || null,
          hasMessageBody: Boolean(message.trim()),
          detailNote: null,
          direction: "outbound",
        },
      };
    }

    if (parsed.kind === "payslip") {
      const { data, error } = await service
        .from("hr_payslips")
        .select(
          "id, version, email_status, email_sent_at, email_error, created_at, run:hr_payroll_runs(payroll_month)",
        )
        .eq("venue_id", venueId)
        .eq("id", parsed.sourceId)
        .maybeSingle();
      if (error) return { ok: false, error: error.message };
      if (!data) return { ok: false, error: "Communication not found." };

      const runRaw = data.run as
        | { payroll_month?: string | null }
        | { payroll_month?: string | null }[]
        | null;
      const run = Array.isArray(runRaw) ? (runRaw[0] ?? null) : runRaw;
      const monthRaw = String(run?.payroll_month ?? "").trim();
      const month = monthRaw ? formatPayrollMonthLabel(monthRaw) : "";
      const version = Number(data.version) || 1;
      const status = String(data.email_status ?? "").trim() || null;
      const emailError = String(data.email_error ?? "").trim() || null;
      const thread = await resolveThreadForSource({
        service,
        venueId,
        sourceKind: "payslip",
        sourceId: String(data.id),
      });

      // Prefer stored outbound body from hr_email_messages when present.
      let message: string | null = emailError
        ? `Delivery issue: ${emailError}`
        : null;
      let hasMessageBody = Boolean(emailError);
      let detailNote: string | null =
        "Payslip emails attach a PDF payslip. The full email body is not stored in the communications trail.";

      if (thread.threadId) {
        const { data: outboundMsg } = await service
          .from("hr_email_messages")
          .select("body_html, body_text")
          .eq("thread_id", thread.threadId)
          .eq("direction", "outbound")
          .maybeSingle();
        const stored =
          String(outboundMsg?.body_html ?? "").trim() ||
          String(outboundMsg?.body_text ?? "").trim();
        if (stored) {
          message = stored;
          hasMessageBody = true;
          detailNote = null;
        }
      }

      return {
        ok: true,
        detail: {
          id: `payslip:${data.id}`,
          kind: "payslip_email",
          title: month
            ? `Payslip · ${month}${version > 1 ? ` (v${version})` : ""}`
            : `Payslip${version > 1 ? ` v${version}` : ""}`,
          status,
          subject: month ? `Payslip for ${month}` : "Payslip email",
          to: null,
          occurredAt: asIso(
            data.email_sent_at as string | null,
            data.created_at as string,
          ),
          meta: {
            emailError,
            payrollMonth: monthRaw || null,
            version,
          },
          ...thread,
          fromEmail: null,
          message,
          provider: null,
          templateName: null,
          hasMessageBody,
          detailNote,
          direction: "outbound",
        },
      };
    }

    if (parsed.kind === "invite") {
      const { data, error } = await service
        .from("audit_log")
        .select("id, action, entity, after, created_at")
        .eq("id", parsed.sourceId)
        .maybeSingle();
      if (error) return { ok: false, error: error.message };
      if (!data) return { ok: false, error: "Communication not found." };

      const after =
        data.after && typeof data.after === "object" && !Array.isArray(data.after)
          ? (data.after as Record<string, unknown>)
          : {};
      const resent =
        String(data.entity ?? "") === "user_invite" || Boolean(after.resent);
      const thread = await resolveThreadForSource({
        service,
        venueId,
        sourceKind: "invite",
        sourceId: String(data.id),
      });

      let message: string | null = null;
      let hasMessageBody = false;
      let detailNote: string | null =
        "Invite emails are sent via the auth provider. The full message body is not retained unless a thread copy was stored.";

      if (thread.threadId) {
        const { data: outboundMsg } = await service
          .from("hr_email_messages")
          .select("body_html, body_text")
          .eq("thread_id", thread.threadId)
          .eq("direction", "outbound")
          .maybeSingle();
        const stored =
          String(outboundMsg?.body_html ?? "").trim() ||
          String(outboundMsg?.body_text ?? "").trim();
        if (stored) {
          message = stored;
          hasMessageBody = true;
          detailNote = null;
        }
      }

      return {
        ok: true,
        detail: {
          id: `invite:${data.id}`,
          kind: "hub_invite_email",
          title: auditTitle("hub_invite_email", { ...after, resent }),
          status: after.emailError ? "failed" : "sent",
          subject: resent
            ? "Your SS Operational Hub invitation"
            : "You're invited to the SS Operational Hub",
          to: String(after.email ?? "").trim() || null,
          occurredAt: asIso(data.created_at as string),
          meta: { ...after, resent },
          ...thread,
          fromEmail: null,
          message,
          provider: "resend",
          templateName: null,
          hasMessageBody,
          detailNote,
          direction: "outbound",
        },
      };
    }

    // audit (staff entity emails)
    const { data, error } = await service
      .from("audit_log")
      .select("id, action, after, created_at")
      .eq("id", parsed.sourceId)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "Communication not found." };

    const action = String(data.action ?? "");
    const kind = auditActionToKind(action);
    if (!kind) return { ok: false, error: "Communication not found." };

    const after =
      data.after && typeof data.after === "object" && !Array.isArray(data.after)
        ? (data.after as Record<string, unknown>)
        : {};
    const thread = await resolveThreadForSource({
      service,
      venueId,
      sourceKind: "audit",
      sourceId: String(data.id),
    });

    let message: string | null = null;
    let hasMessageBody = false;
    let detailNote: string | null =
      "Delivery was logged, but the full message body was not retained for this email type.";

    if (thread.threadId) {
      const { data: outboundMsg } = await service
        .from("hr_email_messages")
        .select("body_html, body_text")
        .eq("thread_id", thread.threadId)
        .eq("direction", "outbound")
        .maybeSingle();
      const stored =
        String(outboundMsg?.body_html ?? "").trim() ||
        String(outboundMsg?.body_text ?? "").trim();
      if (stored) {
        message = stored;
        hasMessageBody = true;
        detailNote = null;
      }
    }

    return {
      ok: true,
      detail: {
        id: `audit:${data.id}`,
        kind,
        title: auditTitle(kind, after),
        status: "sent",
        subject: null,
        to: String(after.to ?? "").trim() || null,
        occurredAt: asIso(data.created_at as string),
        meta: after,
        ...thread,
        fromEmail: null,
        message,
        provider: null,
        templateName: null,
        hasMessageBody,
        detailNote,
        direction: "outbound",
      },
    };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Failed to load communication details.",
    };
  }
}

export async function getStaffCommunicationThread(input: {
  communicationId: string;
}): Promise<
  | {
      ok: true;
      threadId: string;
      messages: StaffThreadMessageHeader[];
    }
  | { ok: false; error: string }
> {
  try {
    const auth = await requireCommsAuth();
    if ("error" in auth) return { ok: false, error: auth.error };

    const parsed = parseCommunicationId(String(input.communicationId ?? "").trim());
    if (!parsed) return { ok: false, error: "Communication not found." };

    const service = createServiceClient();
    const venueId = auth.venue.id;

    let threadId: string | null = null;

    if (parsed.kind === "msg") {
      const { data } = await service
        .from("hr_email_messages")
        .select("thread_id")
        .eq("venue_id", venueId)
        .eq("id", parsed.sourceId)
        .maybeSingle();
      threadId = data?.thread_id ? String(data.thread_id) : null;
    } else {
      const sourceKind =
        parsed.kind === "boarding" ||
        parsed.kind === "payslip" ||
        parsed.kind === "audit" ||
        parsed.kind === "invite"
          ? parsed.kind
          : null;
      if (!sourceKind) return { ok: false, error: "Communication not found." };
      const resolved = await resolveThreadForSource({
        service,
        venueId,
        sourceKind,
        sourceId: parsed.sourceId,
      });
      threadId = resolved.threadId;
    }

    if (!threadId) {
      return { ok: false, error: "No thread recorded for this email yet." };
    }

    const { data, error } = await service
      .from("hr_email_messages")
      .select("id, direction, subject, from_email, to_email, occurred_at")
      .eq("venue_id", venueId)
      .eq("thread_id", threadId)
      .order("occurred_at", { ascending: true });

    if (error) return { ok: false, error: error.message };

    const messages: StaffThreadMessageHeader[] = (data ?? []).map((row) => ({
      id: String(row.id),
      direction: row.direction === "inbound" ? "inbound" : "outbound",
      subject: String(row.subject ?? "").trim() || null,
      fromEmail: String(row.from_email ?? "").trim() || null,
      to: String(row.to_email ?? "").trim() || null,
      occurredAt: asIso(row.occurred_at as string),
    }));

    return { ok: true, threadId, messages };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error ? err.message : "Failed to load email thread.",
    };
  }
}

export async function getStaffCommunicationThreadMessage(input: {
  messageId: string;
}): Promise<
  | { ok: true; detail: StaffCommunicationDetail }
  | { ok: false; error: string }
> {
  return getStaffCommunicationDetail({
    id: `msg:${String(input.messageId ?? "").trim()}`,
  });
}
