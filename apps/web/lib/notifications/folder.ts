import type { NotificationRow, NotificationSeverity } from "./types";

export type NotificationFolder = "inbox" | "alerts" | "archive";

const ALERT_SEVERITIES = new Set<NotificationSeverity>(["warning", "critical"]);

export function isAlertNotification(
  n: Pick<NotificationRow, "severity">,
): boolean {
  return ALERT_SEVERITIES.has(n.severity);
}

export function isArchivedNotification(
  n: Pick<NotificationRow, "archived_at">,
): boolean {
  return Boolean(n.archived_at);
}

export function notificationMatchesFolder(
  n: Pick<NotificationRow, "severity" | "archived_at">,
  folder: NotificationFolder,
): boolean {
  const archived = isArchivedNotification(n);
  if (folder === "archive") return archived;
  if (archived) return false;
  if (folder === "alerts") return isAlertNotification(n);
  return true;
}
