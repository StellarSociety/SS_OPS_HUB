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

function auditLabel(action: string, entity: string | null): string {
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
      .select("id, action, module_key, entity, created_at")
      .eq("actor_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    for (const e of data ?? []) {
      const row = e as {
        id: string;
        action: string;
        module_key: string | null;
        entity: string | null;
        created_at: string;
      };
      // Skip sign-in/out here — access_events already covers sessions.
      if (row.action === "login" || row.action === "logout") continue;
      items.push({
        id: `audit:${row.id}`,
        kind: auditKind(row.action),
        label: auditLabel(row.action, row.entity),
        detail: row.module_key ? getModuleLabel(row.module_key) : null,
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
