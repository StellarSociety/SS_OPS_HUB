/**
 * Count benefits "worked days" from roster labels using SOP flags.
 * Unlike payroll pay-fraction, OFF/PH are optional and leave is usually excluded.
 */

export type BenefitsWorkedDaysSettings = {
  includeRegularDaysOffInWorkedDays: boolean;
  includePublicHolidaysInWorkedDays: boolean;
  excludeLeaveFromWorkedDays: boolean;
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
  "PH-REPL",
  "ABS",
  "COMP",
  "TOIL",
]);

export function isBenefitsWorkedDay(
  labelCode: string | null | undefined,
  settings: BenefitsWorkedDaysSettings,
): boolean {
  const raw = (labelCode ?? "").trim().toUpperCase();
  if (!raw) return false;

  if (raw === "SHIFT") return true;

  if (raw === "OFF") {
    return settings.includeRegularDaysOffInWorkedDays;
  }

  if (raw === "PH") {
    return settings.includePublicHolidaysInWorkedDays;
  }

  const normalized = raw.replace(/\s+/g, "-");
  if (LEAVE_LIKE.has(normalized) || LEAVE_LIKE.has(raw)) {
    return !settings.excludeLeaveFromWorkedDays;
  }

  // Unknown codes: count only if they look like worked shifts
  if (normalized.includes("SHIFT") || normalized === "WD") return true;
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
