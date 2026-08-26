/**
 * Count benefits "worked days" from roster labels.
 * Hard rule: SHIFT (and SH) + OFF only. PH / PH-REPL and leave never count.
 */

export type BenefitsWorkedDaysSettings = {
  includeRegularDaysOffInWorkedDays: boolean;
  includePublicHolidaysInWorkedDays: boolean;
  excludeLeaveFromWorkedDays: boolean;
};

/** Locked SOP used for live Allocations counts and recalculation. */
export const BENEFITS_WORKED_DAYS_RULE: BenefitsWorkedDaysSettings = {
  includeRegularDaysOffInWorkedDays: true,
  includePublicHolidaysInWorkedDays: false,
  excludeLeaveFromWorkedDays: true,
};

const LEAVE_LIKE = new Set([
  "AL",
  "SL",
  "SL-FP",
  "SL-HP",
  "UPL",
  "ML",
  "ML-FP",
  "ML-HP",
  "PL",
  "BL",
  "STL",
  "HL",
  "ABS",
  "COMP",
  "TOIL",
]);

function isPublicHolidayLabel(raw: string, normalized: string): boolean {
  return (
    raw === "PH" ||
    normalized === "PH" ||
    normalized === "PH-REPL" ||
    normalized === "PHRL"
  );
}

export function isBenefitsWorkedDay(
  labelCode: string | null | undefined,
  _settings: BenefitsWorkedDaysSettings = BENEFITS_WORKED_DAYS_RULE,
): boolean {
  const raw = (labelCode ?? "").trim().toUpperCase();
  if (!raw) return false;

  const normalized = raw.replace(/\s+/g, "-");
  if (isPublicHolidayLabel(raw, normalized)) return false;

  if (raw === "SHIFT" || raw === "SH" || normalized === "WD") return true;
  if (raw === "OFF") return true;

  if (LEAVE_LIKE.has(normalized) || LEAVE_LIKE.has(raw)) return false;

  if (normalized.includes("SHIFT")) return true;
  return false;
}

export function countBenefitsWorkedDays(
  labels: Array<string | null | undefined>,
  settings: BenefitsWorkedDaysSettings,
): number {
  let n = 0;
  for (const label of labels) {
    if (isBenefitsWorkedDay(label, settings)) n += 1;
  }
  return n;
}

/** One label per date (latest wins), then SOP count. */
export function countBenefitsWorkedDaysFromSchedule(
  days: Array<{ work_date: string; label_code: string | null | undefined }>,
  settings: BenefitsWorkedDaysSettings,
): number {
  const byDate = new Map<string, string | null>();
  for (const day of days) {
    const key = String(day.work_date ?? "").slice(0, 10);
    if (!key) continue;
    byDate.set(key, (day.label_code as string | null) ?? null);
  }
  return countBenefitsWorkedDays([...byDate.values()], settings);
}
