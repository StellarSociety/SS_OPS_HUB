"use server";

import { canViewStaff } from "@/lib/hr/permissions";
import {
  dateRangesOverlap,
  normalizeScheduleLeaveCode,
  scheduleLeaveDisplayName,
} from "@/lib/hr/leave";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveActiveVenue } from "@/lib/venue/active-venue";
import { redirect } from "next/navigation";

export type LeaveActivityKind =
  | "submitted"
  | "recorded"
  | "edited"
  | "approved"
  | "rejected"
  | "cancelled"
  | "deleted"
  | "roster"
  | "other";

export type LeaveActivityItem = {
  id: string;
  kind: LeaveActivityKind;
  label: string;
  detail: string | null;
  actorName: string | null;
  created_at: string;
};

type AuditRow = {
  id: string;
  action: string;
  entity_id: string | null;
  actor_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
};

type RequestRow = {
  id: string;
  request_number: string | null;
  start_date: string;
  end_date: string;
  status: string;
  source: string | null;
  created_at: string;
  created_by: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  cancelled_at: string | null;
  updated_at: string;
  updated_by: string | null;
};

function readString(
  source: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const value = source?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function formatRange(fromDate: string, toDate: string): string {
  if (fromDate === toDate) return fromDate;
  return `${fromDate} → ${toDate}`;
}

function auditMatchesRange(
  after: Record<string, unknown> | null,
  input: {
    staffId: string;
    labelCode: string;
    fromDate: string;
    toDate: string;
  },
): boolean {
  if (!after) return false;
  const staffId = readString(after, "staffId");
  if (staffId && staffId !== input.staffId) return false;
  const fromDate = readString(after, "fromDate");
  const toDate = readString(after, "toDate");
  if (
    fromDate &&
    toDate &&
    !dateRangesOverlap(fromDate, toDate, input.fromDate, input.toDate)
  ) {
    return false;
  }
  const labelCode = readString(after, "labelCode");
  if (
    labelCode &&
    normalizeScheduleLeaveCode(labelCode) !==
      normalizeScheduleLeaveCode(input.labelCode)
  ) {
    return false;
  }
  return Boolean(staffId || fromDate);
}

function describeChange(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): string | null {
  const parts: string[] = [];
  const beforeFrom = readString(before, "fromDate");
  const beforeTo = readString(before, "toDate");
  const afterFrom = readString(after, "fromDate");
  const afterTo = readString(after, "toDate");
  if (
    beforeFrom &&
    beforeTo &&
    afterFrom &&
    afterTo &&
    (beforeFrom !== afterFrom || beforeTo !== afterTo)
  ) {
    parts.push(
      `Dates ${formatRange(beforeFrom, beforeTo)} → ${formatRange(afterFrom, afterTo)}`,
    );
  } else if (afterFrom && afterTo) {
    parts.push(formatRange(afterFrom, afterTo));
  }

  const beforeLabel = readString(before, "labelCode");
  const afterLabel = readString(after, "labelCode");
  if (beforeLabel && afterLabel && beforeLabel !== afterLabel) {
    parts.push(`Type ${beforeLabel} → ${afterLabel}`);
  } else if (afterLabel) {
    parts.push(scheduleLeaveDisplayName(afterLabel));
  }

  const days = after?.days;
  if (typeof days === "number" && Number.isFinite(days)) {
    parts.push(`${days} day${days === 1 ? "" : "s"}`);
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}

function kindFromAudit(
  action: string,
  after: Record<string, unknown> | null,
): LeaveActivityKind {
  const status = readString(after, "status")?.toLowerCase();
  if (action === "create" || status === "recorded") return "recorded";
  if (action === "approve" || status === "approved") return "approved";
  if (action === "reject" || status === "rejected") return "rejected";
  if (action === "delete" || status === "cancelled") return "cancelled";
  if (action === "update") {
    if (status === "approved") return "approved";
    if (status === "rejected") return "rejected";
    if (status === "cancelled") return "cancelled";
    return "edited";
  }
  return "other";
}

function labelFromKind(kind: LeaveActivityKind): string {
  switch (kind) {
    case "submitted":
      return "Submitted";
    case "recorded":
      return "Recorded";
    case "edited":
      return "Edited";
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "cancelled":
      return "Cancelled";
    case "deleted":
      return "Removed from roster";
    case "roster":
      return "Roster updated";
    default:
      return "Updated";
  }
}

async function resolveActorNames(
  service: ReturnType<typeof createServiceClient>,
  ids: string[],
): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const map = new Map<string, string>();
  if (unique.length === 0) return map;
  const { data } = await service
    .from("profiles")
    .select("id, full_name, email")
    .in("id", unique);
  for (const row of data ?? []) {
    const profile = row as {
      id: string;
      full_name: string | null;
      email: string | null;
    };
    const name = profile.full_name?.trim() || profile.email?.trim();
    if (name) map.set(profile.id, name);
  }
  return map;
}

function withinMs(a: string, b: string, ms: number): boolean {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) < ms;
}

/**
 * Full activity timeline for one scheduled leave range: request lifecycle,
 * audit log entries, and roster touch points.
 */
export async function getLeaveRangeActivity(input: {
  requestId?: string | null;
  staffId: string;
  labelCode: string;
  fromDate: string;
  toDate: string;
}): Promise<{ items: LeaveActivityItem[]; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const venue = await resolveActiveVenue(supabase);
  if (!venue) redirect("/select-venue");

  const { data: permissions } = await supabase
    .from("user_permissions")
    .select("*")
    .eq("user_id", user.id);

  if (!canViewStaff(permissions ?? [], venue.id)) {
    return { items: [], error: "You do not have permission to view leave." };
  }

  const service = createServiceClient();
  const labelCode = normalizeScheduleLeaveCode(input.labelCode);
  const items: LeaveActivityItem[] = [];
  const seen = new Set<string>();
  /** Actor ids stored until profile names are resolved. */
  const actorIdByItemId = new Map<string, string>();

  function pushItem(
    item: LeaveActivityItem,
    actorId?: string | null,
  ): void {
    const key = `${item.kind}:${item.created_at}:${actorId ?? ""}:${item.label}:${item.detail ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push(item);
    if (actorId) actorIdByItemId.set(item.id, actorId);
  }

  let requestId = input.requestId?.trim() || null;
  let request: RequestRow | null = null;

  if (requestId) {
    const { data } = await service
      .from("hr_leave_requests")
      .select(
        "id, request_number, start_date, end_date, status, source, created_at, created_by, submitted_at, approved_at, rejected_at, cancelled_at, updated_at, updated_by",
      )
      .eq("id", requestId)
      .eq("venue_id", venue.id)
      .eq("employee_id", input.staffId)
      .maybeSingle();
    request = (data as RequestRow | null) ?? null;
  }

  if (!request) {
    const { data: candidates } = await service
      .from("hr_leave_requests")
      .select(
        "id, request_number, start_date, end_date, status, source, created_at, created_by, submitted_at, approved_at, rejected_at, cancelled_at, updated_at, updated_by",
      )
      .eq("venue_id", venue.id)
      .eq("employee_id", input.staffId)
      .lte("start_date", input.toDate)
      .gte("end_date", input.fromDate)
      .not("status", "eq", "cancelled")
      .order("created_at", { ascending: false })
      .limit(20);

    for (const row of (candidates ?? []) as RequestRow[]) {
      if (
        dateRangesOverlap(
          row.start_date.slice(0, 10),
          row.end_date.slice(0, 10),
          input.fromDate,
          input.toDate,
        )
      ) {
        request = row;
        requestId = row.id;
        break;
      }
    }
  }

  if (request) {
    const reqNo = request.request_number?.trim() || null;
    const rangeDetail = formatRange(
      request.start_date.slice(0, 10),
      request.end_date.slice(0, 10),
    );
    const sourceNote =
      request.source === "schedule"
        ? "From leave calendar / roster"
        : request.source
          ? `Source: ${request.source}`
          : null;

    pushItem(
      {
        id: `request:created:${request.id}`,
        kind: request.submitted_at ? "submitted" : "recorded",
        label: request.submitted_at ? "Submitted" : "Recorded",
        detail: [reqNo, rangeDetail, sourceNote].filter(Boolean).join(" · "),
        actorName: null,
        created_at: request.created_at,
      },
      request.created_by,
    );

    if (request.submitted_at && request.submitted_at !== request.created_at) {
      pushItem(
        {
          id: `request:submitted:${request.id}`,
          kind: "submitted",
          label: "Submitted",
          detail: reqNo,
          actorName: null,
          created_at: request.submitted_at,
        },
        request.updated_by ?? request.created_by,
      );
    }
    if (request.approved_at) {
      pushItem(
        {
          id: `request:approved:${request.id}`,
          kind: "approved",
          label: "Approved",
          detail: rangeDetail,
          actorName: null,
          created_at: request.approved_at,
        },
        request.updated_by,
      );
    }
    if (request.rejected_at) {
      pushItem(
        {
          id: `request:rejected:${request.id}`,
          kind: "rejected",
          label: "Rejected",
          detail: rangeDetail,
          actorName: null,
          created_at: request.rejected_at,
        },
        request.updated_by,
      );
    }
    if (request.cancelled_at) {
      pushItem(
        {
          id: `request:cancelled:${request.id}`,
          kind: "cancelled",
          label: "Cancelled",
          detail: rangeDetail,
          actorName: null,
          created_at: request.cancelled_at,
        },
        request.updated_by,
      );
    }
  }

  const auditIds = new Set<string>();
  if (requestId) {
    const { data } = await service
      .from("audit_log")
      .select("id, action, entity_id, actor_id, before, after, created_at")
      .eq("venue_id", venue.id)
      .eq("entity", "hr_leave_requests")
      .eq("entity_id", requestId)
      .order("created_at", { ascending: true })
      .limit(100);
    for (const row of (data ?? []) as AuditRow[]) {
      auditIds.add(row.id);
      const kind = kindFromAudit(row.action, row.after);
      const nearDuplicate = items.some(
        (item) =>
          item.kind === kind &&
          withinMs(item.created_at, row.created_at, 3000),
      );
      if (
        nearDuplicate &&
        (kind === "recorded" || kind === "approved" || kind === "submitted")
      ) {
        continue;
      }
      pushItem(
        {
          id: `audit:${row.id}`,
          kind,
          label: labelFromKind(kind),
          detail: describeChange(row.before, row.after),
          actorName: null,
          created_at: row.created_at,
        },
        row.actor_id,
      );
    }
  }

  const { data: looseAudits } = await service
    .from("audit_log")
    .select("id, action, entity_id, actor_id, before, after, created_at")
    .eq("venue_id", venue.id)
    .eq("entity", "hr_leave_requests")
    .order("created_at", { ascending: true })
    .limit(200);

  for (const row of (looseAudits ?? []) as AuditRow[]) {
    if (auditIds.has(row.id)) continue;
    if (requestId && row.entity_id === requestId) continue;
    if (!auditMatchesRange(row.after, { ...input, labelCode })) continue;
    const kind = kindFromAudit(row.action, row.after);
    pushItem(
      {
        id: `audit:${row.id}`,
        kind,
        label: labelFromKind(kind),
        detail: describeChange(row.before, row.after),
        actorName: null,
        created_at: row.created_at,
      },
      row.actor_id,
    );
  }

  const { data: scheduleDays } = await service
    .from("hr_schedule_days")
    .select("work_date, label_code, source, updated_by, updated_at")
    .eq("venue_id", venue.id)
    .eq("staff_id", input.staffId)
    .gte("work_date", input.fromDate)
    .lte("work_date", input.toDate)
    .order("updated_at", { ascending: true });

  const rosterBuckets = new Map<
    string,
    {
      updated_at: string;
      updated_by: string | null;
      days: string[];
      source: string | null;
    }
  >();
  for (const day of scheduleDays ?? []) {
    const code = normalizeScheduleLeaveCode(String(day.label_code));
    if (code !== labelCode && String(day.label_code) !== input.labelCode) {
      continue;
    }
    const updatedAt = String(day.updated_at ?? "");
    const bucketKey = `${updatedAt.slice(0, 19)}:${day.updated_by ?? ""}`;
    const existing = rosterBuckets.get(bucketKey);
    const workDate = String(day.work_date).slice(0, 10);
    if (existing) {
      existing.days.push(workDate);
    } else {
      rosterBuckets.set(bucketKey, {
        updated_at: updatedAt,
        updated_by: day.updated_by ? String(day.updated_by) : null,
        days: [workDate],
        source: day.source ? String(day.source) : null,
      });
    }
  }

  for (const [key, bucket] of rosterBuckets) {
    const nearLeaveAction = items.some(
      (item) =>
        (item.kind === "recorded" ||
          item.kind === "edited" ||
          item.kind === "approved") &&
        withinMs(item.created_at, bucket.updated_at, 5000),
    );
    if (nearLeaveAction) continue;

    pushItem(
      {
        id: `roster:${key}`,
        kind: "roster",
        label: "Roster updated",
        detail: [
          `${bucket.days.length} day${bucket.days.length === 1 ? "" : "s"}`,
          scheduleLeaveDisplayName(labelCode),
          bucket.source ? `via ${bucket.source}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        actorName: null,
        created_at: bucket.updated_at,
      },
      bucket.updated_by,
    );
  }

  const names = await resolveActorNames(
    service,
    Array.from(actorIdByItemId.values()),
  );
  for (const item of items) {
    const actorId = actorIdByItemId.get(item.id);
    if (!actorId) continue;
    item.actorName = names.get(actorId) ?? "Unknown user";
  }

  items.sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  return { items };
}
