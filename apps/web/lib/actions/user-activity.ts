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
  Partial<Record<"create" | "update" | "delete", string>>
> = {
  user: {
    create: "Created user",
    update: "Updated user",
    delete: "Deleted user",
  },
  user_invite: { update: "Resent invitation" },
  password_reset: { update: "Sent password reset" },
  password_set: { update: "Set password" },
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
      action as "create" | "update" | "delete"
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
