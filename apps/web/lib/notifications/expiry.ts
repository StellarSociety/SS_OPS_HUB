import { addMonths, daysUntil } from "@/lib/hr/derived";
import type {
  ExpiryFieldConfig,
  ExpiryItem,
  ExpiryNotificationDraft,
  ExpirySourceItem,
  NotificationRule,
} from "./types";
import { severityForDaysUntil } from "./types";

function relationName(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const name = (value as { name?: unknown }).name;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

function optionalIsoDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function staffDetailFields(item: ExpirySourceItem): Pick<
  ExpiryItem,
  | "photoUrl"
  | "departmentName"
  | "positionName"
  | "employeeStatusName"
  | "workingStatusName"
  | "nationalityName"
  | "dob"
  | "joiningDate"
  | "terminationDate"
> {
  return {
    photoUrl:
      typeof item.photo_url === "string" && item.photo_url.trim()
        ? item.photo_url.trim()
        : null,
    departmentName: relationName(item.department),
    positionName: relationName(item.position),
    employeeStatusName: relationName(item.employment_status),
    workingStatusName: relationName(item.working_status),
    nationalityName: relationName(item.nationality),
    dob: optionalIsoDate(item.dob),
    joiningDate: optionalIsoDate(item.joining_date),
    terminationDate: optionalIsoDate(item.termination_date),
  };
}

export function computeExpiryItems(
  items: ExpirySourceItem[],
  expiryFields: ExpiryFieldConfig[],
  options: {
    getVenueId: (item: ExpirySourceItem) => string;
    getDisplayName: (item: ExpirySourceItem) => string;
    getSecondaryLabel?: (item: ExpirySourceItem) => string | undefined;
    maxLeadDays: number;
  },
): ExpiryItem[] {
  const results: ExpiryItem[] = [];

  for (const item of items) {
    for (const config of expiryFields) {
      const raw = item[config.field] as string | null | undefined;
      if (!raw) continue;

      let expiryDate = raw;
      if (config.renewalMonths) {
        expiryDate = addMonths(raw, config.renewalMonths)
          .toISOString()
          .slice(0, 10);
      }

      const until = daysUntil(expiryDate);
      if (until == null || until > options.maxLeadDays) continue;

      results.push({
        sourceId: item.id,
        venueId: options.getVenueId(item),
        displayName: options.getDisplayName(item),
        secondaryLabel: options.getSecondaryLabel?.(item),
        ...staffDetailFields(item),
        field: config.field,
        label: config.label,
        expiryDate,
        daysUntil: until,
      });
    }
  }

  return results.sort((a, b) => a.daysUntil - b.daysUntil);
}

export function buildExpiryNotificationDrafts(
  rule: NotificationRule,
  expiryItems: ExpiryItem[],
): ExpiryNotificationDraft[] {
  const drafts: ExpiryNotificationDraft[] = [];
  const maxLead = Math.max(...rule.leadDays);

  for (const item of expiryItems) {
    if (item.daysUntil > maxLead) continue;

    for (const leadDays of rule.leadDays) {
      if (item.daysUntil > leadDays) continue;

      const title = rule.buildTitle(item, leadDays);
      const body = rule.buildBody(item, leadDays);

      drafts.push({
        venueId: item.venueId,
        moduleKey: rule.moduleKey,
        type: rule.type,
        entity: rule.entity,
        entityId: item.sourceId,
        field: item.field,
        title,
        body,
        dueDate: item.expiryDate,
        leadDays,
        severity: severityForDaysUntil(item.daysUntil),
        dedupeKey: `${rule.moduleKey}:${rule.entity}:${item.sourceId}:${item.field}:${item.expiryDate}:${leadDays}`,
        href: `/hr/${item.sourceId}`,
      });
    }
  }

  return drafts;
}
