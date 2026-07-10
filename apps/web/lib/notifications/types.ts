import type { SupabaseClient } from "@supabase/supabase-js";

export type NotificationSeverity = "info" | "warning" | "critical";

export type NotificationRow = {
  id: string;
  user_id: string;
  venue_id: string | null;
  module_key: string;
  type: string;
  title: string;
  body: string | null;
  entity: string;
  entity_id: string;
  severity: NotificationSeverity;
  due_date: string | null;
  lead_days: number | null;
  read_at: string | null;
  email_sent_at: string | null;
  dedupe_key: string;
  created_at: string;
};

export type ExpiryFieldConfig = {
  field: string;
  label: string;
  renewalMonths?: number;
};

export type ExpirySourceItem = Record<string, unknown> & {
  id: string;
};

export type ExpiryItem = {
  sourceId: string;
  venueId: string;
  displayName: string;
  secondaryLabel?: string;
  field: string;
  label: string;
  expiryDate: string;
  daysUntil: number;
};

export type ExpiryNotificationDraft = {
  venueId: string;
  moduleKey: string;
  type: string;
  entity: string;
  entityId: string;
  field: string;
  title: string;
  body: string;
  dueDate: string;
  leadDays: number;
  severity: NotificationSeverity;
  dedupeKey: string;
  href?: string;
};

export type NotificationRecipient = {
  userId: string;
  email: string;
  fullName: string | null;
};

export type RecipientResolver = (
  supabase: SupabaseClient,
  venueId: string,
) => Promise<NotificationRecipient[]>;

export type NotificationRule = {
  key: string;
  moduleKey: string;
  type: string;
  entity: string;
  leadDays: number[];
  expiryFields: ExpiryFieldConfig[];
  fetchItems: (
    supabase: SupabaseClient,
    venueId: string,
  ) => Promise<ExpirySourceItem[]>;
  buildTitle: (item: ExpiryItem, leadDays: number) => string;
  buildBody: (item: ExpiryItem, leadDays: number) => string;
  resolveRecipients: RecipientResolver;
  getVenueId: (item: ExpirySourceItem) => string;
  getDisplayName: (item: ExpirySourceItem) => string;
  getSecondaryLabel?: (item: ExpirySourceItem) => string | undefined;
};

export const DEFAULT_LEAD_DAYS = [30, 14, 7] as const;

export function buildDedupeKey(parts: {
  userId: string;
  moduleKey: string;
  entity: string;
  entityId: string;
  field: string;
  dueDate: string;
  leadDays: number;
}): string {
  return [
    parts.userId,
    parts.moduleKey,
    parts.entity,
    parts.entityId,
    parts.field,
    parts.dueDate,
    String(parts.leadDays),
  ].join(":");
}

export function severityForDaysUntil(daysUntil: number): NotificationSeverity {
  if (daysUntil < 0 || daysUntil <= 7) return "critical";
  if (daysUntil <= 14) return "warning";
  return "info";
}
