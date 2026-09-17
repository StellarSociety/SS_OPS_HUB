import type { NotificationRule } from "./types";
import { hrExpiryRule } from "./rules/hr-expiry";

const notificationRules: NotificationRule[] = [hrExpiryRule];

export function getNotificationRules(): NotificationRule[] {
  return notificationRules;
}

export function getNotificationRule(key: string): NotificationRule | undefined {
  return notificationRules.find((r) => r.key === key);
}

/** Placeholder for future notification preferences settings surface. */
export const notificationSettingsMeta = {
  key: "notifications",
  label: "Notifications",
  description:
    "In-app alerts, email reminders, and device notifications on the installed app.",
  status: "live" as const,
};
