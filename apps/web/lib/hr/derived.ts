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

export function computeWorkedTime(
  joiningDate: string | null | undefined,
  terminationDate?: string | null,
): string | null {
  const start = toDate(joiningDate);
  if (!start) return null;
  const end = toDate(terminationDate) ?? new Date();

  const totalMonths =
    (end.getFullYear() - start.getFullYear()) * 12 +
    (end.getMonth() - start.getMonth());

  if (totalMonths < 0) return null;

  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;

  if (years === 0) return `${months} mo`;
  if (months === 0) return `${years} yr`;
  return `${years} yr ${months} mo`;
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
