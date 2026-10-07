import type { NotificationRow } from "./types";

/** Notifications page tabs (besides All and Archive). */
export type NotificationCategory =
  "people" | "approvals" | "candidates" | "others";

export const NOTIFICATION_CATEGORY_LABELS: Record<
  NotificationCategory,
  string
> = {
  people: "People",
  approvals: "Approvals",
  candidates: "Candidates",
  others: "Others",
};

const APPROVAL_ENTITIES = new Set([
  "payroll_run",
  "schedule_week",
  "sentiment_review",
]);

/**
 * Sort a notification into a page tab from its module/type/entity, so new
 * notification types land in the right tab without per-type wiring:
 * - Candidates: hiring applications and anything else from Hiring.
 * - Approvals: approval / review / justification workflows (payroll,
 *   schedules, attendance, guest review reports).
 * - People: staff records — document expiries, anniversaries, birthdays.
 * - Others: everything else (app updates, system notices).
 */
export function notificationCategory(
  n: Pick<NotificationRow, "module_key" | "type" | "entity">,
): NotificationCategory {
  const type = n.type.toLowerCase();
  const entity = n.entity.toLowerCase();

  if (type.startsWith("hiring_") || entity.startsWith("hiring")) {
    return "candidates";
  }
  if (
    APPROVAL_ENTITIES.has(entity) ||
    /approv|review|justification|changes_requested/.test(type)
  ) {
    return "approvals";
  }
  if (
    entity === "staff" ||
    /expir|anniversary|birthday|probation|boarding/.test(type)
  ) {
    return "people";
  }
  return "others";
}
