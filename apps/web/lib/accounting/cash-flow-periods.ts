const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export const CASH_FLOW_PERIODS = [
  { value: "this-fiscal-year", label: "This Fiscal Year" },
  { value: "previous-fiscal-year", label: "Previous Fiscal Year" },
  { value: "last-12-months", label: "Last 12 Months" },
  { value: "last-6-months", label: "Last 6 Months" },
] as const;

export const EXPENSE_PERIODS = [
  { value: "this-fiscal-year", label: "This Fiscal Year" },
  { value: "this-quarter", label: "This Quarter" },
  { value: "this-month", label: "This Month" },
  { value: "previous-fiscal-year", label: "Previous Fiscal Year" },
  { value: "previous-quarter", label: "Previous Quarter" },
  { value: "previous-month", label: "Previous Month" },
  { value: "last-6-months", label: "Last 6 Months" },
  { value: "last-12-months", label: "Last 12 Months" },
] as const;

export type CashFlowPeriod = (typeof CASH_FLOW_PERIODS)[number]["value"];
export type ExpensePeriod = (typeof EXPENSE_PERIODS)[number]["value"];

export type MonthTick = {
  key: string;
  month: string;
  year: string;
};

export type PeriodWindow = {
  points: MonthTick[];
  openingLabel: string;
  closingLabel: string;
};

function parseIsoDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year || 1970, (month || 1) - 1, day || 1);
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function formatDay(date: Date): string {
  return `${pad(date.getDate())} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

function shiftMonth(year: number, monthIndex: number, delta: number) {
  const date = new Date(year, monthIndex + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() };
}

function lastDayOfMonth(year: number, monthIndex: number): Date {
  return new Date(year, monthIndex + 1, 0);
}

function monthSpan(
  startYear: number,
  startMonth: number,
  count: number,
): MonthTick[] {
  const points: MonthTick[] = [];
  for (let index = 0; index < count; index += 1) {
    const { year, month } = shiftMonth(startYear, startMonth, index);
    points.push({
      key: `${year}-${month}`,
      month: MONTHS[month] ?? "",
      year: String(year),
    });
  }
  return points;
}

/** Fiscal year containing `asOf`. `fiscalStartMonth` is 1–12. */
export function fiscalYearStart(
  asOf: Date,
  fiscalStartMonth = 1,
): { year: number; month: number } {
  const startMonth = Math.min(12, Math.max(1, fiscalStartMonth)) - 1;
  const year =
    asOf.getMonth() >= startMonth ? asOf.getFullYear() : asOf.getFullYear() - 1;
  return { year, month: startMonth };
}

export function resolveCashFlowWindow(
  period: CashFlowPeriod,
  asOfIso: string,
  fiscalStartMonth = 1,
): PeriodWindow {
  const asOf = parseIsoDate(asOfIso);

  if (period === "this-fiscal-year" || period === "previous-fiscal-year") {
    const start = fiscalYearStart(asOf, fiscalStartMonth);
    const year = start.year - (period === "previous-fiscal-year" ? 1 : 0);
    const end = shiftMonth(year, start.month, 11);
    return {
      points: monthSpan(year, start.month, 12),
      openingLabel: formatDay(new Date(year, start.month, 1)),
      closingLabel: formatDay(lastDayOfMonth(end.year, end.month)),
    };
  }

  const count = period === "last-6-months" ? 6 : 12;
  const end = { year: asOf.getFullYear(), month: asOf.getMonth() };
  const start = shiftMonth(end.year, end.month, -(count - 1));
  return {
    points: monthSpan(start.year, start.month, count),
    openingLabel: formatDay(new Date(start.year, start.month, 1)),
    closingLabel: formatDay(lastDayOfMonth(end.year, end.month)),
  };
}

/** Month ticks covered by an expense period. Quarters follow the fiscal year. */
export function resolveExpenseMonths(
  period: ExpensePeriod,
  asOfIso: string,
  fiscalStartMonth = 1,
): MonthTick[] {
  switch (period) {
    case "this-fiscal-year":
    case "previous-fiscal-year":
    case "last-6-months":
    case "last-12-months":
      return resolveCashFlowWindow(period, asOfIso, fiscalStartMonth).points;
  }
  const asOf = parseIsoDate(asOfIso);
  if (period === "this-month" || period === "previous-month") {
    const delta = period === "previous-month" ? -1 : 0;
    const { year, month } = shiftMonth(asOf.getFullYear(), asOf.getMonth(), delta);
    return monthSpan(year, month, 1);
  }
  const start = fiscalYearStart(asOf, fiscalStartMonth);
  const monthsIn =
    (asOf.getFullYear() - start.year) * 12 + asOf.getMonth() - start.month;
  const quarterOffset =
    Math.floor(monthsIn / 3) * 3 - (period === "previous-quarter" ? 3 : 0);
  const { year, month } = shiftMonth(start.year, start.month, quarterOffset);
  return monthSpan(year, month, 3);
}

export function expenseEmptyMessage(period: ExpensePeriod): string {
  switch (period) {
    case "this-fiscal-year":
      return "No Expense recorded for this fiscal year";
    case "previous-fiscal-year":
      return "No Expense recorded for the previous fiscal year";
    case "this-quarter":
      return "No Expense recorded for this quarter";
    case "this-month":
      return "No Expense recorded for this month";
    case "previous-quarter":
      return "No Expense recorded for the previous quarter";
    case "previous-month":
      return "No Expense recorded for the previous month";
    case "last-6-months":
      return "No Expense recorded for the last 6 months";
    case "last-12-months":
      return "No Expense recorded for the last 12 months";
  }
}

export function formatCashFlowAmount(value: number): string {
  const abs = Math.abs(value);
  const formatted = abs.toLocaleString("en-AE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${value < 0 ? "-" : ""}AED${formatted}`;
}
