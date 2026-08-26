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
  const noBank = partial?.noBankPaymentMethod;
  return {
    ...base,
    ...partial,
    excludeEmploymentStatuses:
      partial?.excludeEmploymentStatuses ?? base.excludeEmploymentStatuses,
    noBankPaymentMethod:
      noBank === "cheque" || noBank === "other" || noBank === "cash"
        ? noBank
        : base.noBankPaymentMethod,
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

function calendarYearMonth(iso: string): string {
  return iso.trim().slice(0, 7);
}

/**
 * True when this termination was already a leaver of an earlier named payroll
 * month. With a 25→24 window, 25–last-of-month belong to that calendar month
 * (inclusive), not the next period those dates would otherwise fall into.
 * Example: terminated 31 Jul → settled in July, skip August.
 */
export function isTerminatedBeforePayrollMonth(
  termination: string | null | undefined,
  period: Pick<PayrollPeriod, "payrollMonth">,
): boolean {
  const t = termination?.trim();
  if (!t) return false;
  return calendarYearMonth(t) < calendarYearMonth(period.payrollMonth);
}

/**
 * True when termination makes this employee a leaver for the named payroll month.
 * A leaver belongs to the calendar month of their termination date — including
 * dates after `periodEnd` through month-end (e.g. 31 Jul with a window ending
 * 24 Jul). The following month must not treat those dates as a new leaver.
 */
export function isPayrollLeaver(
  termination: string | null | undefined,
  period: Pick<PayrollPeriod, "periodStart" | "periodEnd" | "payrollMonth">,
): boolean {
  const t = termination?.trim();
  if (!t) return false;
  if (calendarYearMonth(t) !== calendarYearMonth(period.payrollMonth)) {
    return false;
  }
  return t >= period.periodStart;
}

/** Last calendar day of the named payroll month (`YYYY-MM-01` or `YYYY-MM`). */
export function lastCalendarDayOfPayrollMonth(payrollMonth: string): string {
  const { year, month } = parsePayrollMonth(payrollMonth);
  return isoDate(year, month, daysInMonth(year, month));
}

/**
 * Pay-window end for one employee. Same-month leavers include days after
 * `periodEnd` through their termination date (last day of month inclusive).
 * Everyone else still caps at `periodEnd`.
 */
export function payrollEmployeeWindowEnd(
  termination: string | null | undefined,
  period: Pick<PayrollPeriod, "periodStart" | "periodEnd" | "payrollMonth">,
): string {
  const t = termination?.trim();
  if (t && isPayrollLeaver(t, period)) return t;
  if (t) return minIsoDate(period.periodEnd, t);
  return period.periodEnd;
}

/** Roster/attendance fetch end so same-month leavers after `periodEnd` are covered. */
export function payrollDataFetchToDate(
  period: Pick<PayrollPeriod, "periodEnd" | "payrollMonth">,
): string {
  return maxIsoDate(
    period.periodEnd,
    lastCalendarDayOfPayrollMonth(period.payrollMonth),
  );
}

export function formatPayrollMonthLabel(payrollMonth: string): string {
  const { year, month } = parsePayrollMonth(payrollMonth);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

const DUBAI_TZ = "Asia/Dubai";

/** Calendar date `YYYY-MM-DD` in Asia/Dubai for a timestamp. */
export function dubaiCalendarDateIso(asOf: Date | string): string | null {
  const d = typeof asOf === "string" ? new Date(asOf) : asOf;
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DUBAI_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Calendar month `YYYY-MM` in Asia/Dubai for a timestamp. */
export function dubaiCalendarMonthKey(asOf: Date | string): string | null {
  const iso = dubaiCalendarDateIso(asOf);
  return iso ? iso.slice(0, 7) : null;
}

/** Shift a payroll month key (YYYY-MM-01 or YYYY-MM) by N calendar months. */
export function shiftPayrollMonth(
  payrollMonth: string,
  deltaMonths: number,
): string {
  const { year, month } = parsePayrollMonth(payrollMonth);
  const d = new Date(Date.UTC(year, month - 1 + deltaMonths, 1));
  return payrollMonthKey(d.getUTCFullYear(), d.getUTCMonth() + 1);
}

/**
 * Which named payroll month contains an ISO work date, given venue period
 * settings (e.g. 25→24 cross-month windows).
 */
export function payrollMonthContainingDate(
  isoDate: string,
  settings: HrPayrollSettings = DEFAULT_HR_PAYROLL_SETTINGS,
): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!m) throw new Error(`Invalid ISO date: ${isoDate}`);
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);

  if (settings.periodStartDay <= settings.periodEndDay) {
    return payrollMonthKey(year, month);
  }

  // Cross-month: from startDay of month M through endDay of month M+1 is
  // named as payroll month M+1. Dates on/after startDay belong to next month.
  if (day >= settings.periodStartDay) {
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    return payrollMonthKey(nextYear, nextMonth);
  }
  return payrollMonthKey(year, month);
}

/** YYYY-MM for `<input type="month">` from a payroll month key (YYYY-MM-01). */
export function payrollMonthInputValue(payrollMonth: string): string {
  const { year, month } = parsePayrollMonth(payrollMonth);
  return `${year}-${pad2(month)}`;
}

/** Payroll period that contains a local calendar date (defaults to today). */
export function currentPayrollPeriod(
  asOf: Date = new Date(),
  settings: HrPayrollSettings = DEFAULT_HR_PAYROLL_SETTINGS,
): PayrollPeriod {
  const today = isoDate(asOf.getFullYear(), asOf.getMonth() + 1, asOf.getDate());
  return resolvePayrollPeriod(
    payrollMonthContainingDate(today, settings),
    settings,
  );
}

/** Validation page path with employee + current payroll month selected. */
export function attendanceValidationHref(staffId: string, asOf?: Date): string {
  const params = new URLSearchParams({ staffId });
  try {
    const period = currentPayrollPeriod(asOf);
    params.set("from", period.periodStart);
    params.set("to", period.periodEnd);
  } catch {
    // Staff-only deep link still opens validation with the employee selected.
  }
  return `/hr/attendance/validation?${params.toString()}`;
}
