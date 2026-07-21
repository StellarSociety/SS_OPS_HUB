const DUBAI_TZ = "Asia/Dubai";

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = typeof value === "string" ? new Date(`${value}T00:00:00`) : value;
  return Number.isNaN(d.getTime()) ? null : d;
}

export function computeAge(dob: string | null | undefined): number | null {
  const birth = toDate(dob);
  if (!birth) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age;
}

export function computeWorkedMonths(
  joiningDate: string | null | undefined,
  terminationDate?: string | null,
): number | null {
  const parts = computeWorkedParts(joiningDate, terminationDate);
  if (!parts) return null;
  return parts.years * 12 + parts.months;
}

/** Calendar years / months / days from joining → termination (or today). */
export function computeWorkedParts(
  joiningDate: string | null | undefined,
  terminationDate?: string | null,
): { years: number; months: number; days: number } | null {
  const start = toDate(joiningDate);
  if (!start) return null;
  const end = toDate(terminationDate) ?? new Date();
  if (end < start) return null;

  let years = end.getFullYear() - start.getFullYear();
  let months = end.getMonth() - start.getMonth();
  let days = end.getDate() - start.getDate();

  if (days < 0) {
    months -= 1;
    const prevMonth = new Date(end.getFullYear(), end.getMonth(), 0);
    days += prevMonth.getDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  return { years, months, days };
}

/** Format: `02 Y | 03 M | 05 D` (zero-padded). */
export function computeWorkedTime(
  joiningDate: string | null | undefined,
  terminationDate?: string | null,
): string | null {
  const parts = computeWorkedParts(joiningDate, terminationDate);
  if (!parts) return null;

  const y = String(parts.years).padStart(2, "0");
  const m = String(parts.months).padStart(2, "0");
  const d = String(parts.days).padStart(2, "0");
  return `${y} Y | ${m} M | ${d} D`;
}

export function computeVacationBalance(
  vacationsEntitle: number | null | undefined,
  vacationsBalance: number | null | undefined,
  unpaidLeaveDays: number | null | undefined,
): number | null {
  if (vacationsBalance != null) return vacationsBalance;
  if (vacationsEntitle == null) return null;
  const used = unpaidLeaveDays ?? 0;
  return Math.max(0, vacationsEntitle - used);
}

export function daysUntil(dateStr: string | null | undefined): number | null {
  const target = toDate(dateStr);
  if (!target) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function addMonths(dateStr: string, months: number): Date {
  const d = toDate(dateStr)!;
  const result = new Date(d);
  result.setMonth(result.getMonth() + months);
  return result;
}

export function formatDateOnly(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-AE", {
    timeZone: DUBAI_TZ,
    dateStyle: "medium",
  }).format(d);
}

export function formatAed(amount: number | null | undefined): string {
  if (amount == null) return "—";
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export type SalaryPercentages = {
  basic: number;
  accom: number;
  transp: number;
};

export type SalaryBreakdown = {
  basic: number | null;
  accom: number | null;
  transp: number | null;
  /** What actually hits payroll: staff in company accommodation are paid the
   *  basic portion only, otherwise the full wage package. */
  salaryToPay: number | null;
};

/**
 * Split a total wage package into its basic / accommodation / transport
 * components and derive the payroll figure. Percentages default to the
 * company standard 60 / 25 / 15 split but can be overridden per venue.
 */
export function computeSalaryBreakdown(
  wagePackage: number | null | undefined,
  inAccommodation: boolean,
  pct: SalaryPercentages = { basic: 60, accom: 25, transp: 15 },
): SalaryBreakdown {
  if (wagePackage == null || Number.isNaN(wagePackage)) {
    return { basic: null, accom: null, transp: null, salaryToPay: null };
  }
  const basic = round2((wagePackage * pct.basic) / 100);
  const accom = round2((wagePackage * pct.accom) / 100);
  const transp = round2((wagePackage * pct.transp) / 100);
  const salaryToPay = inAccommodation ? basic : wagePackage;
  return { basic, accom, transp, salaryToPay };
}

/** Treat a stored company_accommodation value as a boolean "in accommodation". */
export function isInAccommodation(value: string | null | undefined): boolean {
  if (!value) return false;
  return ["yes", "y", "true", "1"].includes(value.trim().toLowerCase());
}
