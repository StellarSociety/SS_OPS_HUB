"use server";

import { getActionAuthContext } from "@/lib/auth/action-context";
import { formatPayrollMonthLabel } from "@/lib/hr/payroll/period";
import { canAdminLookups, canViewStaff } from "@/lib/hr/permissions";
import { boardingEmailActionLabel, parseBoardingEmailAction } from "@/lib/hr/types";
import { createServiceClient } from "@/lib/supabase/service";

export type StaffCommunicationKind =
  | "boarding_email"
  | "payslip_email"
  | "work_anniversary_email"
  | "updated_docs_request_email";

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
};

export type StaffCommunicationDetail = StaffCommunicationItem & {
  fromEmail: string | null;
  message: string | null;
  provider: string | null;
  templateName: string | null;
  /** True when a stored message body is available to display. */
  hasMessageBody: boolean;
  detailNote: string | null;
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
  }
}

function parseCommunicationId(id: string): {
  kind: "boarding" | "payslip" | "audit";
  sourceId: string;
} | null {
  const [prefix, ...rest] = id.split(":");
  const sourceId = rest.join(":").trim();
  if (!sourceId) return null;
  if (prefix === "boarding" || prefix === "payslip" || prefix === "audit") {
    return { kind: prefix, sourceId };
  }
  return null;
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

    const service = createServiceClient();
    const venueId = auth.venue.id;

    const [boardingResult, payslipsResult, auditResult] = await Promise.all([
      service
        .from("hr_boarding_emails")
        .select(
          "id, action, status, to_email, subject, recorded_at, sent_at, scheduled_at",
        )
        .eq("venue_id", venueId)
        .eq("staff_id", staffId)
        .order("recorded_at", { ascending: false })
        .limit(100),
      service
        .from("hr_payslips")
        .select(
          "id, version, email_status, email_sent_at, email_error, created_at, run:hr_payroll_runs(payroll_month)",
        )
        .eq("venue_id", venueId)
        .eq("staff_id", staffId)
        .in("email_status", ["sent", "failed", "queued", "bounced"])
        .order("email_sent_at", { ascending: false, nullsFirst: false })
        .limit(100),
      service
        .from("audit_log")
        .select("id, action, after, created_at")
        .eq("venue_id", venueId)
        .eq("entity", "staff")
        .eq("entity_id", staffId)
        .in("action", [
          "work_anniversary_email.sent",
          "updated_docs_request_email.sent",
        ])
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    if (boardingResult.error) {
      return { ok: false, error: boardingResult.error.message };
    }
    if (payslipsResult.error) {
      return { ok: false, error: payslipsResult.error.message };
    }
    if (auditResult.error) {
      return { ok: false, error: auditResult.error.message };
    }

    const items: StaffCommunicationItem[] = [];

    for (const row of boardingResult.data ?? []) {
      const action = parseBoardingEmailAction(String(row.action ?? ""));
      const status = String(row.status ?? "").trim() || null;
      const occurredAt = asIso(
        status === "scheduled"
          ? (row.scheduled_at as string | null)
          : ((row.sent_at as string | null) ?? (row.recorded_at as string | null)),
        row.recorded_at as string,
      );
      items.push({
        id: `boarding:${row.id}`,
        kind: "boarding_email",
        title: boardingEmailActionLabel(action),
        status,
        subject: String(row.subject ?? "").trim() || null,
        to: String(row.to_email ?? "").trim() || null,
        occurredAt,
        meta: { action },
      });
    }

    for (const row of payslipsResult.data ?? []) {
      const runRaw = row.run as
        | { payroll_month?: string | null }
        | { payroll_month?: string | null }[]
        | null;
      const run = Array.isArray(runRaw) ? (runRaw[0] ?? null) : runRaw;
      const monthRaw = String(run?.payroll_month ?? "").trim();
      const month = monthRaw ? formatPayrollMonthLabel(monthRaw) : "";
      const version = Number(row.version) || 1;
      const status = String(row.email_status ?? "").trim() || null;
      items.push({
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
      });
    }

    for (const row of auditResult.data ?? []) {
      const action = String(row.action ?? "");
      const after =
        row.after && typeof row.after === "object" && !Array.isArray(row.after)
          ? (row.after as Record<string, unknown>)
          : {};
      const kind: StaffCommunicationKind =
        action === "updated_docs_request_email.sent"
          ? "updated_docs_request_email"
          : "work_anniversary_email";
      const years = after.years != null ? Number(after.years) : null;
      const docLabel = String(after.docLabel ?? "").trim();
      items.push({
        id: `audit:${row.id}`,
        kind,
        title:
          kind === "work_anniversary_email"
            ? years
              ? `Work anniversary · ${years} year${years === 1 ? "" : "s"}`
              : kindLabel(kind)
            : docLabel
              ? `Updated docs · ${docLabel}`
              : kindLabel(kind),
        status: "sent",
        subject: null,
        to: String(after.to ?? "").trim() || null,
        occurredAt: asIso(row.created_at as string),
        meta: after,
      });
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
          fromEmail: String(data.from_email ?? "").trim() || null,
          message: message.trim() || null,
          provider: String(data.provider ?? "").trim() || null,
          templateName: String(data.template_name ?? "").trim() || null,
          hasMessageBody: Boolean(message.trim()),
          detailNote: null,
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
          fromEmail: null,
          message: emailError
            ? `Delivery issue: ${emailError}`
            : null,
          provider: null,
          templateName: null,
          hasMessageBody: Boolean(emailError),
          detailNote:
            "Payslip emails attach a PDF payslip. The full email body is not stored in the communications trail.",
        },
      };
    }

    const { data, error } = await service
      .from("audit_log")
      .select("id, action, after, created_at")
      .eq("venue_id", venueId)
      .eq("entity", "staff")
      .eq("id", parsed.sourceId)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "Communication not found." };

    const action = String(data.action ?? "");
    const after =
      data.after && typeof data.after === "object" && !Array.isArray(data.after)
        ? (data.after as Record<string, unknown>)
        : {};
    const kind: StaffCommunicationKind =
      action === "updated_docs_request_email.sent"
        ? "updated_docs_request_email"
        : "work_anniversary_email";
    const years = after.years != null ? Number(after.years) : null;
    const docLabel = String(after.docLabel ?? "").trim();

    return {
      ok: true,
      detail: {
        id: `audit:${data.id}`,
        kind,
        title:
          kind === "work_anniversary_email"
            ? years
              ? `Work anniversary · ${years} year${years === 1 ? "" : "s"}`
              : kindLabel(kind)
            : docLabel
              ? `Updated docs · ${docLabel}`
              : kindLabel(kind),
        status: "sent",
        subject: null,
        to: String(after.to ?? "").trim() || null,
        occurredAt: asIso(data.created_at as string),
        meta: after,
        fromEmail: null,
        message: null,
        provider: null,
        templateName: null,
        hasMessageBody: false,
        detailNote:
          "Delivery was logged, but the full message body was not retained for this email type.",
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
