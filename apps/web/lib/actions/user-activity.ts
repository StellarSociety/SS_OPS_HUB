"use server";

import { getModuleLabel } from "@/lib/modules-catalog";
import { createServiceClient } from "@/lib/supabase/service";

export type ActivityKind =
  | "login"
  | "logout"
  | "module_access"
  | "page_view"
  | "form_create"
  | "form_update"
  | "form_delete"
  | "other";

export type ActivityItem = {
  id: string;
  kind: ActivityKind;
  /** Primary line shown to the reader. */
  label: string;
  /** Optional secondary context (module, page, entity…). */
  detail: string | null;
  created_at: string;
};

const ACCESS_EVENT_KIND: Record<string, ActivityKind> = {
  login: "login",
  logout: "logout",
  module_access: "module_access",
  page_view: "page_view",
};

const ACCESS_EVENT_LABEL: Record<string, string> = {
  login: "Signed in",
  logout: "Signed out",
  module_access: "Opened app",
  page_view: "Viewed page",
};

/** Human-readable name for an audited entity slug (e.g. "venue_daily_sales"). */
function humanizeEntity(entity: string | null): string {
  if (!entity) return "record";
  return entity.replace(/_/g, " ");
}

function auditKind(action: string): ActivityKind {
  switch (action) {
    case "create":
      return "form_create";
    case "update":
      return "form_update";
    case "delete":
      return "form_delete";
    case "login":
      return "login";
    case "logout":
      return "logout";
    default:
      return "other";
  }
}

/**
 * Audit entities whose `entity_id` points at another user (the target of a
 * user-management action). Their timeline row should name that person, not the
 * "App" module.
 */
const USER_ENTITY_LABELS: Record<
  string,
  Partial<Record<"create" | "update" | "delete" | "read", string>>
> = {
  user: {
    create: "Created user",
    update: "Updated user",
    delete: "Deleted user",
  },
  user_invite: { update: "Resent invitation" },
  password_reset: { update: "Sent password reset" },
  password_set: { update: "Set password" },
  password_view: { read: "Viewed password" },
  profile: { update: "Updated user status" },
  profile_email: { update: "Changed login email" },
  profile_name: { update: "Changed name" },
  user_access: { update: "Updated user access" },
  user_access_suspend: { update: "Updated all access" },
  module_suspend: { update: "Updated app access" },
};

function isUserEntity(entity: string | null): boolean {
  return !!entity && entity in USER_ENTITY_LABELS;
}

function readString(
  source: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const value = source?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Best-effort display name for a user-management target, from the audit JSON. */
function targetNameFromAudit(
  after: Record<string, unknown> | null,
  before: Record<string, unknown> | null,
): string | null {
  return (
    readString(after, "full_name") ??
    readString(before, "full_name") ??
    readString(after, "email") ??
    readString(before, "email")
  );
}

function auditLabel(
  action: string,
  entity: string | null,
  after: Record<string, unknown> | null,
): string {
  // User-management actions get friendly, entity-specific labels.
  if (isUserEntity(entity)) {
    const mapped = USER_ENTITY_LABELS[entity!]?.[
      action as "create" | "update" | "delete" | "read"
    ];
    if (mapped) {
      // Refine the "suspend" rows so the direction (suspend vs restore) reads clearly.
      if (entity === "user_access_suspend") {
        const status = readString(after, "status");
        if (status === "disabled") return "Suspended all access";
        if (status === "active") return "Restored all access";
      }
      if (entity === "module_suspend") {
        return after?.suspended === true
          ? "Suspended app access"
          : "Restored app access";
      }
      return mapped;
    }
  }

  const name = humanizeEntity(entity);
  switch (action) {
    case "create":
      return `Created ${name}`;
    case "update":
      return `Updated ${name}`;
    case "delete":
      return `Deleted ${name}`;
    case "login":
      return "Signed in";
    case "logout":
      return "Signed out";
    default:
      return `${action} ${name}`.trim();
  }
}

/**
 * Combined activity feed for a single user, merging lightweight access events
 * (sign-ins, app opens, page views) with audit-log entries (form submissions
 * and record changes). Sorted newest-first. Fails soft to an empty list so the
 * dialog never blocks on a missing table.
 */
export async function getUserActivity(
  userId: string,
  limit = 100,
): Promise<ActivityItem[]> {
  const supabase = createServiceClient();
  const items: ActivityItem[] = [];

  try {
    const { data } = await supabase
      .from("access_events")
      .select("id, module_key, path, event_type, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    for (const e of data ?? []) {
      const row = e as {
        id: string;
        module_key: string | null;
        path: string | null;
        event_type: string;
        created_at: string;
      };
      items.push({
        id: `access:${row.id}`,
        kind: ACCESS_EVENT_KIND[row.event_type] ?? "other",
        label: ACCESS_EVENT_LABEL[row.event_type] ?? row.event_type,
        detail: row.module_key
          ? getModuleLabel(row.module_key)
          : (row.path ?? null),
        created_at: row.created_at,
      });
    }
  } catch {
    // access_events table may not be migrated — ignore
  }

  try {
    const { data } = await supabase
      .from("audit_log")
      .select("id, action, module_key, entity, entity_id, before, after, created_at")
      .eq("actor_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    type AuditRow = {
      id: string;
      action: string;
      module_key: string | null;
      entity: string | null;
      entity_id: string | null;
      before: Record<string, unknown> | null;
      after: Record<string, unknown> | null;
      created_at: string;
    };

    const rows = (data ?? []) as AuditRow[];

    // Resolve names for user-management targets in one round-trip, so rows like
    // "Created user" / "Updated user access" name the affected person.
    const targetIds = Array.from(
      new Set(
        rows
          .filter((r) => isUserEntity(r.entity) && r.entity_id)
          .map((r) => r.entity_id as string),
      ),
    );

    const targetNameById = new Map<string, string>();
    if (targetIds.length > 0) {
      try {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", targetIds);
        for (const p of profiles ?? []) {
          const profile = p as {
            id: string;
            full_name: string | null;
            email: string | null;
          };
          const name = profile.full_name?.trim() || profile.email?.trim();
          if (name) targetNameById.set(profile.id, name);
        }
      } catch {
        // profile lookup is best-effort — fall back to audit JSON below
      }
    }

    for (const row of rows) {
      // Skip sign-in/out here — access_events already covers sessions.
      if (row.action === "login" || row.action === "logout") continue;

      let detail: string | null = row.module_key
        ? getModuleLabel(row.module_key)
        : null;
      if (isUserEntity(row.entity)) {
        detail =
          (row.entity_id ? targetNameById.get(row.entity_id) : null) ??
          targetNameFromAudit(row.after, row.before) ??
          detail;
      }

      items.push({
        id: `audit:${row.id}`,
        kind: auditKind(row.action),
        label: auditLabel(row.action, row.entity, row.after),
        detail,
        created_at: row.created_at,
      });
    }
  } catch {
    // audit_log table may not be migrated — ignore
  }

  items.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  return items.slice(0, limit);
}

export type OnlineSessionItem = {
  id: string;
  started_at: string;
  last_seen_at: string;
  ended_at: string | null;
  /** First moment of this in-app usage window. */
  used_from: string;
  /** Last moment of this in-app usage window (or now if still active). */
  used_until: string;
  /** login = signed in; heartbeat = returned after idle. */
  started_by: "login" | "heartbeat";
  end_reason: "logout" | "idle" | "replaced" | null;
  /** True when last seen within the idle window and not closed. */
  is_active: boolean;
  /** Time actually spent in the app for this window. */
  duration_ms: number;
};

const ONLINE_IDLE_MS = 5 * 60 * 1000;
/**
 * Access events are throttled to once per module per 30 minutes, so a gap
 * shorter than this still counts as one sitting. Heartbeat sessions are
 * already split at 5 minutes and pass through unchanged.
 */
const USAGE_CLUSTER_GAP_MS = 35 * 60 * 1000;

type SessionRow = {
  id: string;
  started_at: string;
  last_seen_at: string;
  ended_at: string | null;
  started_by: "login" | "heartbeat";
  end_reason: "logout" | "idle" | "replaced" | null;
};

function clusterUsageWindows(times: number[]): { start: number; end: number }[] {
  if (times.length === 0) return [];
  const sorted = [...new Set(times)].sort((a, b) => a - b);
  const windows: { start: number; end: number }[] = [];
  let start = sorted[0];
  let end = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    const t = sorted[i];
    if (t - end > USAGE_CLUSTER_GAP_MS) {
      windows.push({ start, end });
      start = t;
    }
    end = t;
  }
  windows.push({ start, end });
  return windows;
}

function toIso(ms: number): string {
  return new Date(ms).toISOString();
}

/**
 * Login / online sessions for a user, newest first. Long historical rows
 * (login → last event days later) are split into the sittings when they
 * were actually using the app.
 */
export async function getUserOnlineSessions(
  userId: string,
  limit = 100,
): Promise<OnlineSessionItem[]> {
  const supabase = createServiceClient();

  try {
    const [sessionsRes, accessRes, auditRes] = await Promise.all([
      supabase
        .from("user_online_sessions")
        .select("id, started_at, last_seen_at, ended_at, started_by, end_reason")
        .eq("user_id", userId)
        .order("started_at", { ascending: false })
        .limit(limit),
      supabase
        .from("access_events")
        .select("created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(2000),
      supabase
        .from("audit_log")
        .select("created_at")
        .eq("actor_id", userId)
        .order("created_at", { ascending: false })
        .limit(2000),
    ]);

    if (sessionsRes.error || !sessionsRes.data) return [];

    const activityTimes = [
      ...((accessRes.data ?? []) as { created_at: string }[]),
      ...((auditRes.data ?? []) as { created_at: string }[]),
    ]
      .map((row) => new Date(row.created_at).getTime())
      .filter((ms) => Number.isFinite(ms));

    const now = Date.now();
    const items: OnlineSessionItem[] = [];

    for (const row of sessionsRes.data as SessionRow[]) {
      const started = new Date(row.started_at).getTime();
      const lastSeen = new Date(row.last_seen_at).getTime();
      const closedAt = row.ended_at ? new Date(row.ended_at).getTime() : null;
      const sessionActive =
        row.ended_at == null && now - lastSeen <= ONLINE_IDLE_MS;
      const hi = sessionActive ? now : (closedAt ?? lastSeen);

      const times = [started, lastSeen];
      if (closedAt != null) times.push(closedAt);
      if (sessionActive) times.push(now);
      for (const t of activityTimes) {
        if (t >= started && t <= hi) times.push(t);
      }

      const windows = clusterUsageWindows(times);
      windows.reverse();

      for (let i = 0; i < windows.length; i++) {
        const window = windows[i];
        const isLastWindow = i === 0;
        const isActive = sessionActive && isLastWindow;
        const usedUntil = isActive ? now : window.end;
        const fromLogin =
          row.started_by === "login" &&
          Math.abs(window.start - started) < 60_000;

        items.push({
          id: windows.length === 1 ? row.id : `${row.id}:${window.start}`,
          started_at: toIso(window.start),
          last_seen_at: toIso(window.end),
          ended_at: isActive ? null : toIso(usedUntil),
          used_from: toIso(window.start),
          used_until: toIso(usedUntil),
          started_by: fromLogin ? "login" : "heartbeat",
          end_reason: isActive
            ? null
            : isLastWindow
              ? (row.end_reason ?? "idle")
              : "idle",
          is_active: isActive,
          duration_ms: Math.max(0, usedUntil - window.start),
        });
      }
    }

    items.sort(
      (a, b) =>
        new Date(b.used_from).getTime() - new Date(a.used_from).getTime(),
    );

    return items.slice(0, limit);
  } catch {
    return [];
  }
}
