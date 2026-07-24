import {
  DEFAULT_HR_PAYROLL_SETTINGS,
  type HrPayrollSettings,
  type PayrollPeriod,
} from "./types";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function isoDate(y: number, m: number, d: number): string {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function daysInMonth(year: number, month1to12: number): number {
  return new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
}

function clampDay(year: number, month1to12: number, day: number): number {
  return Math.min(Math.max(1, day), daysInMonth(year, month1to12));
}

/** Parse `YYYY-MM` or `YYYY-MM-DD` into { year, month }. */
export function parsePayrollMonth(input: string): { year: number; month: number } {
  const m = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(input.trim());
  if (!m) throw new Error(`Invalid payroll month: ${input}`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) throw new Error(`Invalid payroll month: ${input}`);
  return { year, month };
}

export function payrollMonthKey(year: number, month: number): string {
  return isoDate(year, month, 1);
}

export function mergePayrollSettings(
  partial?: Partial<HrPayrollSettings> | null,
): HrPayrollSettings {
  const base = DEFAULT_HR_PAYROLL_SETTINGS;
  return {
    ...base,
    ...partial,
    excludeEmploymentStatuses:
      partial?.excludeEmploymentStatuses ?? base.excludeEmploymentStatuses,
    glAccounts: {
      ...base.glAccounts,
      ...(partial?.glAccounts ?? {}),
    },
  };
}

/**
 * Resolve attendance/pay window for a named payroll month.
 *
 * Example with start=25, end=24 for July 2026:
 *   period = 2026-06-25 → 2026-07-24
 *   payrollMonth = 2026-07-01
 */
export function resolvePayrollPeriod(
  payrollMonthInput: string,
  settings: HrPayrollSettings = DEFAULT_HR_PAYROLL_SETTINGS,
): PayrollPeriod {
  const { year, month } = parsePayrollMonth(payrollMonthInput);
  const startDay = clampDay(year, month, settings.periodStartDay);
  const endDay = clampDay(year, month, settings.periodEndDay);

  let periodStart: string;
  let periodEnd: string;

  if (settings.periodStartDay <= settings.periodEndDay) {
    // Same-month window (e.g. 1 → 31)
    periodStart = isoDate(year, month, clampDay(year, month, settings.periodStartDay));
    periodEnd = isoDate(year, month, clampDay(year, month, settings.periodEndDay));
  } else {
    // Cross-month: start in previous month, end in payroll month
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    periodStart = isoDate(
      prevYear,
      prevMonth,
      clampDay(prevYear, prevMonth, startDay),
    );
    periodEnd = isoDate(year, month, endDay);
  }

  let paymentDate: string;
  switch (settings.paymentDateRule) {
    case "period_end":
      paymentDate = periodEnd;
      break;
    case "last_calendar_day":
      paymentDate = isoDate(year, month, daysInMonth(year, month));
      break;
    case "fixed_day":
    default:
      paymentDate = isoDate(
        year,
        month,
        clampDay(year, month, settings.paymentDayOfMonth),
      );
      break;
  }

  return {
    payrollMonth: payrollMonthKey(year, month),
    periodStart,
    periodEnd,
    paymentDate,
  };
}

/** Inclusive day count between two ISO dates. */
export function calendarDaysInclusive(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) return 0;
  return Math.floor((to - from) / 86_400_000) + 1;
}

/** Each ISO date from fromIso..toIso inclusive. */
export function eachIsoDate(fromIso: string, toIso: string): string[] {
  const out: string[] = [];
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) return out;
  for (let t = from; t <= to; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

export function maxIsoDate(a: string, b: string): string {
  return a >= b ? a : b;
}

export function minIsoDate(a: string, b: string): string {
  return a <= b ? a : b;
}

export function formatPayrollMonthLabel(payrollMonth: string): string {
  const { year, month } = parsePayrollMonth(payrollMonth);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
