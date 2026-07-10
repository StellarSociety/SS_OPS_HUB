import { addMonths, daysUntil } from "@/lib/hr/derived";
import type {
  ExpiryFieldConfig,
  ExpiryItem,
  ExpiryNotificationDraft,
  ExpirySourceItem,
  NotificationRule,
} from "./types";
import { severityForDaysUntil } from "./types";

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
