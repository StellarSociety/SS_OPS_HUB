import { computeWorkedTime, daysUntil } from "@/lib/hr/derived";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_KEY = /^\d{4}-\d{2}$/;

export type OffBoardingItem = {
  staffId: string;
  empNo: string;
  fullName: string;
  departmentName: string | null;
  positionName: string | null;
  employmentStatusName: string | null;
  joiningDate: string | null;
  terminationDate: string;
  /** Tenure label from joining → termination, e.g. `00 Y | 06 M | 12 D`. */
  workedTime: string | null;
  /** Calendar days until termination (negative = already past). */
  daysUntilTermination: number | null;
};

/** Current calendar month `YYYY-MM` in Asia/Dubai. */
export function currentDubaiMonthKey(asOf: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
  }).format(asOf);
}

export function formatOffBoardingMonthLabel(monthKey: string): string {
  if (!MONTH_KEY.test(monthKey)) return monthKey;
  const [y, m] = monthKey.split("-").map(Number);
  if (!y || !m) return monthKey;
  return new Date(y, m - 1, 1).toLocaleString("en-AE", {
    month: "long",
    year: "numeric",
  });
}

function isoDateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().slice(0, 10);
  return ISO_DATE.test(trimmed) ? trimmed : null;
}

/**
 * Staff with a termination date, sorted soonest last-day first.
 * Filter client-side with {@link filterOffBoardingByMonth}.
 */
export function listOffBoardingItems(
  staff: {
    id: string;
    emp_no: string;
    full_name: string;
    joining_date: string | null;
    termination_date: string | null;
    department?: { name: string } | null;
    position?: { name: string } | null;
    employment_status?: { name: string } | null;
  }[],
): OffBoardingItem[] {
  const items: OffBoardingItem[] = [];

  for (const member of staff) {
    const terminationDate = isoDateOnly(member.termination_date);
    if (!terminationDate) continue;

    const joiningDate = isoDateOnly(member.joining_date);

    items.push({
      staffId: member.id,
      empNo: member.emp_no,
      fullName: member.full_name,
      departmentName: member.department?.name ?? null,
      positionName: member.position?.name ?? null,
      employmentStatusName: member.employment_status?.name ?? null,
      joiningDate,
      terminationDate,
      workedTime: computeWorkedTime(joiningDate, terminationDate),
      daysUntilTermination: daysUntil(terminationDate),
    });
  }

  return items.sort(
    (a, b) =>
      a.terminationDate.localeCompare(b.terminationDate) ||
      a.fullName.localeCompare(b.fullName),
  );
}

/** Keep staff whose termination date falls in `monthKey` (`YYYY-MM`). */
export function filterOffBoardingByMonth(
  items: OffBoardingItem[],
  monthKey: string,
): OffBoardingItem[] {
  if (!MONTH_KEY.test(monthKey)) return [];
  return items.filter((item) => item.terminationDate.startsWith(monthKey));
}
