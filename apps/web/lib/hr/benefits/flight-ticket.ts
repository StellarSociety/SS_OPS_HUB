/**
 * Annual flight-ticket benefit entitlement.
 *
 * Employees earn one ticket after each completed year of service (anniversary).
 * Payable amount = annual ticket value × (creditedDays / calendarDays), where
 * credited days exclude unpaid leave (UPL / ABS). Paid leave counts as worked.
 */

export type FlightTicketStaffInput = {
  id: string;
  empNo: string;
  fullName: string;
  photoUrl: string | null;
  departmentName: string | null;
  positionName: string | null;
  employmentStatusName: string | null;
  workingStatusName: string | null;
  /** Full-time / Part-time / Freelancing */
  contractKind: string | null;
  nationalityName: string | null;
  joiningDate: string | null;
  terminationDate: string | null;
  /** AED / year from nationality lookup (or staff override). */
  ticketValuePerYear: number;
};

export type FlightTicketEntitlementStatus =
  | "no_ticket_value"
  | "missing_joining_date"
  | "not_eligible"
  | "contract_excluded"
  | "upcoming"
  | "pending"
  | "due"
  | "prepared"
  | "imported";

export type FlightTicketEntitlement = {
  staffId: string;
  empNo: string;
  fullName: string;
  photoUrl: string | null;
  departmentName: string | null;
  positionName: string | null;
  employmentStatusName: string | null;
  workingStatusName: string | null;
  contractKind: string | null;
  nationalityName: string | null;
  joiningDate: string | null;
  /** Anniversary that completes this work year (YYYY-MM-DD). */
  anniversaryDate: string | null;
  /** Whole years completed on the anniversary. */
  yearsCompleted: number;
  /** Work-year window credited toward this ticket. */
  workYearStart: string | null;
  workYearEnd: string | null;
  /** Payroll month key YYYY-MM-01 for the anniversary month. */
  payrollMonth: string | null;
  ticketValuePerYear: number;
  calendarDays: number;
  unpaidLeaveDays: number;
  /** Unpaid roster days (UPL/ABS) in the work year, sorted by date. */
  unpaidLeaveEntries: Array<{ date: string; labelCode: string }>;
  creditedDays: number;
  deductionAmount: number;
  payableAmount: number;
  status: FlightTicketEntitlementStatus;
  allocationId: string | null;
  allocationStatus: string | null;
  /** Prepared for payroll import (finalized/draft/applied allocation exists). */
  preparedForPayroll: boolean;
  /** Payroll month (YYYY-MM-01) that imported/paid this ticket, if any. */
  paidOnPayrollMonth: string | null;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UNPAID_LABELS = new Set(["UPL", "ABS"]);

/** Only Full-time contracts are entitled to flight-ticket allowance. */
export function isFlightTicketExcludedContract(
  contractKind: string | null | undefined,
): boolean {
  const kind = (contractKind ?? "").trim().toLowerCase();
  return kind === "freelancing" || kind === "part-time";
}

/** @deprecated Prefer isFlightTicketExcludedContract. */
export function isFreelanceContract(
  contractKind: string | null | undefined,
): boolean {
  return isFlightTicketExcludedContract(contractKind);
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function isoDateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().slice(0, 10);
  return ISO_DATE.test(trimmed) ? trimmed : null;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** Anniversary date in a given calendar year (Feb 29 → Feb 28 in non-leap years). */
export function anniversaryInYear(
  joiningDate: string,
  year: number,
): string | null {
  const join = isoDateOnly(joiningDate);
  if (!join) return null;
  const [, jm, jd] = join.split("-").map(Number) as [number, number, number];
  if (!jm || !jd) return null;
  const day = Math.min(jd, daysInMonth(year, jm));
  return `${year}-${pad2(jm)}-${pad2(day)}`;
}

/** Whole service years completed on or before `asOf` (ISO date). */
export function completedServiceYearsAsOf(
  joiningDate: string,
  asOf: string,
): number {
  const join = isoDateOnly(joiningDate);
  const asOfDate = isoDateOnly(asOf);
  if (!join || !asOfDate || asOfDate < join) return 0;
  const joinYear = Number(join.slice(0, 4));
  const asOfYear = Number(asOfDate.slice(0, 4));
  let years = 0;
  for (let year = joinYear + 1; year <= asOfYear; year += 1) {
    const anniversary = anniversaryInYear(join, year);
    if (anniversary && anniversary <= asOfDate) {
      years = year - joinYear;
    }
  }
  return years;
}

/** Calendar date in Asia/Dubai as YYYY-MM-DD. */
export function dubaiTodayIso(asOf = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(asOf);
}

/** Inclusive calendar day count between two ISO dates. */
export function inclusiveDayCount(start: string, end: string): number {
  const a = isoDateOnly(start);
  const b = isoDateOnly(end);
  if (!a || !b || b < a) return 0;
  const startMs = Date.UTC(
    Number(a.slice(0, 4)),
    Number(a.slice(5, 7)) - 1,
    Number(a.slice(8, 10)),
  );
  const endMs = Date.UTC(
    Number(b.slice(0, 4)),
    Number(b.slice(5, 7)) - 1,
    Number(b.slice(8, 10)),
  );
  return Math.floor((endMs - startMs) / 86_400_000) + 1;
}

/** Day before an ISO date. */
export function dayBefore(isoDate: string): string | null {
  const d = isoDateOnly(isoDate);
  if (!d) return null;
  const ms = Date.UTC(
    Number(d.slice(0, 4)),
    Number(d.slice(5, 7)) - 1,
    Number(d.slice(8, 10)),
  );
  const prev = new Date(ms - 86_400_000);
  return `${prev.getUTCFullYear()}-${pad2(prev.getUTCMonth() + 1)}-${pad2(prev.getUTCDate())}`;
}

/**
 * Work year ending on `anniversaryDate` (yearsCompleted ≥ 1).
 * Window: previous anniversary → day before this anniversary (inclusive).
 * First year uses joining date as start.
 */
export function workYearForAnniversary(
  joiningDate: string,
  anniversaryDate: string,
  yearsCompleted: number,
): { start: string; end: string } | null {
  const join = isoDateOnly(joiningDate);
  const anniversary = isoDateOnly(anniversaryDate);
  if (!join || !anniversary || yearsCompleted < 1) return null;

  const end = dayBefore(anniversary);
  if (!end) return null;

  let start: string | null;
  if (yearsCompleted === 1) {
    start = join;
  } else {
    const joinYear = Number(join.slice(0, 4));
    start = anniversaryInYear(join, joinYear + yearsCompleted - 1);
  }
  if (!start || end < start) return null;
  return { start, end };
}

export function isUnpaidLeaveLabel(labelCode: string | null | undefined): boolean {
  const raw = (labelCode ?? "").trim().toUpperCase();
  if (!raw) return false;
  const normalized = raw.replace(/\s+/g, "-");
  return UNPAID_LABELS.has(raw) || UNPAID_LABELS.has(normalized);
}

export function countUnpaidLeaveDaysInRange(
  labels: Array<{ workDate: string; labelCode: string | null | undefined }>,
  start: string,
  end: string,
): number {
  return listUnpaidLeaveDaysInRange(labels, start, end).length;
}

/** Unique unpaid-leave dates in range, sorted ascending. */
export function listUnpaidLeaveDaysInRange(
  labels: Array<{ workDate: string; labelCode: string | null | undefined }>,
  start: string,
  end: string,
): Array<{ date: string; labelCode: string }> {
  const byDate = new Map<string, string>();
  for (const row of labels) {
    const date = isoDateOnly(row.workDate);
    if (!date || date < start || date > end) continue;
    if (!isUnpaidLeaveLabel(row.labelCode)) continue;
    if (byDate.has(date)) continue;
    byDate.set(date, (row.labelCode ?? "").trim().toUpperCase() || "UPL");
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, labelCode]) => ({ date, labelCode }));
}

/** Collapse sorted unpaid entries into contiguous inclusive ranges. */
export function groupContiguousUnpaidRanges(
  entries: Array<{ date: string; labelCode: string }>,
): Array<{
  start: string;
  end: string;
  days: number;
  labelCodes: string[];
}> {
  const sorted = [...entries]
    .filter((e) => Boolean(e.date))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length === 0) return [];

  const ranges: Array<{
    start: string;
    end: string;
    days: number;
    labelCodes: string[];
  }> = [];

  let start = sorted[0]!.date;
  let end = sorted[0]!.date;
  let days = 1;
  const labels = new Set<string>([sorted[0]!.labelCode]);

  for (let i = 1; i < sorted.length; i += 1) {
    const cur = sorted[i]!;
    const prevMs = Date.UTC(
      Number(end.slice(0, 4)),
      Number(end.slice(5, 7)) - 1,
      Number(end.slice(8, 10)),
    );
    const curMs = Date.UTC(
      Number(cur.date.slice(0, 4)),
      Number(cur.date.slice(5, 7)) - 1,
      Number(cur.date.slice(8, 10)),
    );
    if (curMs - prevMs === 86_400_000) {
      end = cur.date;
      days += 1;
      labels.add(cur.labelCode);
    } else {
      ranges.push({ start, end, days, labelCodes: [...labels].sort() });
      start = cur.date;
      end = cur.date;
      days = 1;
      labels.clear();
      labels.add(cur.labelCode);
    }
  }
  ranges.push({ start, end, days, labelCodes: [...labels].sort() });
  return ranges;
}

/** @deprecated Prefer groupContiguousUnpaidRanges. */
export function groupContiguousDateRanges(
  dates: string[],
): Array<{ start: string; end: string; days: number }> {
  return groupContiguousUnpaidRanges(
    dates.map((date) => ({ date, labelCode: "UPL" })),
  ).map(({ start, end, days }) => ({ start, end, days }));
}

export function unpaidLeaveLabelName(labelCode: string): string {
  const code = labelCode.trim().toUpperCase();
  switch (code) {
    case "UPL":
      return "Unpaid Leave";
    case "ABS":
      return "Unauthorised Absence";
    default:
      return code || "Unpaid";
  }
}

export function roundTicketAed(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

/**
 * Pro-rata ticket for one completed work year.
 * Paid leave counts; unpaid leave (UPL/ABS) reduces credited days.
 */
export function calculateFlightTicketPayable(input: {
  ticketValuePerYear: number;
  calendarDays: number;
  unpaidLeaveDays: number;
}): {
  creditedDays: number;
  deductionAmount: number;
  payableAmount: number;
} {
  const ticket = Math.max(0, Number(input.ticketValuePerYear) || 0);
  const calendar = Math.max(0, Math.floor(input.calendarDays) || 0);
  const unpaid = Math.min(
    calendar,
    Math.max(0, Math.floor(input.unpaidLeaveDays) || 0),
  );
  if (ticket <= 0 || calendar <= 0) {
    return { creditedDays: 0, deductionAmount: 0, payableAmount: 0 };
  }
  const creditedDays = Math.max(0, calendar - unpaid);
  const payableAmount = roundTicketAed((ticket * creditedDays) / calendar);
  const deductionAmount = roundTicketAed(ticket - payableAmount);
  return { creditedDays, deductionAmount, payableAmount };
}

/** Payroll month key `YYYY-MM-01` from an anniversary date. */
export function payrollMonthFromAnniversary(
  anniversaryDate: string,
): string | null {
  const d = isoDateOnly(anniversaryDate);
  if (!d) return null;
  return `${d.slice(0, 7)}-01`;
}

/** Current Dubai calendar month as `YYYY-MM-01`. */
export function dubaiPayrollMonthKey(asOf = new Date()): string {
  return `${dubaiTodayIso(asOf).slice(0, 7)}-01`;
}

/**
 * Which anniversary year to show on the entitlements table.
 * - Anniversary in the current payroll month → that year (Due).
 * - Latest completed year still unsettled → that year (Pending).
 * - Otherwise → next upcoming anniversary year.
 */
export function resolveDisplayAnniversaryYear(
  joiningDate: string,
  asOfDate: string,
  opts?: { latestCompletedSettled?: boolean },
): number | null {
  const join = isoDateOnly(joiningDate);
  const asOf = isoDateOnly(asOfDate);
  if (!join || !asOf) return null;
  const joinYear = Number(join.slice(0, 4));
  const asOfYear = Number(asOf.slice(0, 4));
  const currentMonthKey = `${asOf.slice(0, 7)}-01`;
  const completed = completedServiceYearsAsOf(join, asOf);

  const anniversaryThisCalendarYear = anniversaryInYear(join, asOfYear);
  if (anniversaryThisCalendarYear) {
    const payrollThisYear = payrollMonthFromAnniversary(
      anniversaryThisCalendarYear,
    );
    const yearsOnThisAnniversary = asOfYear - joinYear;
    if (
      payrollThisYear === currentMonthKey &&
      yearsOnThisAnniversary >= 1
    ) {
      return asOfYear;
    }
  }

  if (completed >= 1 && opts?.latestCompletedSettled === false) {
    return joinYear + completed;
  }

  return joinYear + completed + 1;
}

/** True when an allocation is prepared or already on payroll. */
export function isFlightTicketAllocationSettled(
  status: string | null | undefined,
): boolean {
  return (
    status === "finalized" ||
    status === "draft" ||
    status === "applied_to_payroll"
  );
}

/**
 * Build entitlements due in a payroll month (matching joining anniversary month).
 * `yearsCompleted` is the anniversary year relative to joining (1 = first ticket).
 * Pass `asOfDate` so Due is only assigned for the current payroll month.
 */
export function buildFlightTicketEntitlement(input: {
  staff: FlightTicketStaffInput;
  /** Target anniversary year (calendar year of the anniversary date). */
  anniversaryYear: number;
  unpaidLeaveDays: number;
  unpaidLeaveEntries?: Array<{ date: string; labelCode: string }>;
  allocation?: {
    id: string;
    status: string;
    paidOnPayrollMonth?: string | null;
  } | null;
  /** Dubai “today” — used to distinguish Due vs Upcoming. */
  asOfDate?: string;
}): FlightTicketEntitlement {
  const staff = input.staff;
  const ticketValue = Math.max(0, Number(staff.ticketValuePerYear) || 0);
  const joiningDate = isoDateOnly(staff.joiningDate);

  const base: FlightTicketEntitlement = {
    staffId: staff.id,
    empNo: staff.empNo,
    fullName: staff.fullName,
    photoUrl: staff.photoUrl,
    departmentName: staff.departmentName,
    positionName: staff.positionName,
    employmentStatusName: staff.employmentStatusName,
    workingStatusName: staff.workingStatusName,
    contractKind: staff.contractKind,
    nationalityName: staff.nationalityName,
    joiningDate,
    anniversaryDate: null,
    yearsCompleted: 0,
    workYearStart: null,
    workYearEnd: null,
    payrollMonth: null,
    ticketValuePerYear: ticketValue,
    calendarDays: 0,
    unpaidLeaveDays: 0,
    unpaidLeaveEntries: [],
    creditedDays: 0,
    deductionAmount: 0,
    payableAmount: 0,
    status: "not_eligible",
    allocationId: input.allocation?.id ?? null,
    allocationStatus: input.allocation?.status ?? null,
    preparedForPayroll: isFlightTicketAllocationSettled(
      input.allocation?.status,
    ),
    paidOnPayrollMonth:
      input.allocation?.status === "applied_to_payroll"
        ? (input.allocation.paidOnPayrollMonth ?? null)
        : null,
  };

  if (!joiningDate) {
    return { ...base, status: "missing_joining_date" };
  }

  const contractExcluded = isFlightTicketExcludedContract(staff.contractKind);
  if (!contractExcluded && ticketValue <= 0) {
    return { ...base, status: "no_ticket_value" };
  }

  const joinYear = Number(joiningDate.slice(0, 4));
  const yearsCompleted = input.anniversaryYear - joinYear;
  const anniversaryDate = anniversaryInYear(joiningDate, input.anniversaryYear);
  if (!anniversaryDate || yearsCompleted < 1) {
    return {
      ...base,
      anniversaryDate,
      yearsCompleted: Math.max(0, yearsCompleted),
      payrollMonth: anniversaryDate
        ? payrollMonthFromAnniversary(anniversaryDate)
        : null,
      status: contractExcluded ? "contract_excluded" : "not_eligible",
    };
  }

  // Terminated before anniversary → not due
  const termination = isoDateOnly(staff.terminationDate);
  if (termination && termination < anniversaryDate) {
    return {
      ...base,
      anniversaryDate,
      yearsCompleted,
      payrollMonth: payrollMonthFromAnniversary(anniversaryDate),
      status: contractExcluded ? "contract_excluded" : "not_eligible",
    };
  }

  const window = workYearForAnniversary(
    joiningDate,
    anniversaryDate,
    yearsCompleted,
  );
  if (!window) {
    return {
      ...base,
      anniversaryDate,
      yearsCompleted,
      payrollMonth: payrollMonthFromAnniversary(anniversaryDate),
      status: contractExcluded ? "contract_excluded" : "not_eligible",
    };
  }

  const calendarDays = inclusiveDayCount(window.start, window.end);
  const unpaidLeaveDays = Math.min(
    calendarDays,
    Math.max(0, Math.floor(input.unpaidLeaveDays) || 0),
  );
  const unpaidLeaveEntries = (input.unpaidLeaveEntries ?? [])
    .map((entry) => {
      const date = isoDateOnly(entry.date);
      if (!date || date < window.start || date > window.end) return null;
      const labelCode =
        (entry.labelCode ?? "").trim().toUpperCase() || "UPL";
      return { date, labelCode };
    })
    .filter((e): e is { date: string; labelCode: string } => Boolean(e))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, unpaidLeaveDays);
  const calc = calculateFlightTicketPayable({
    ticketValuePerYear: ticketValue,
    calendarDays,
    unpaidLeaveDays,
  });

  const payrollMonth = payrollMonthFromAnniversary(anniversaryDate);
  const asOf = isoDateOnly(input.asOfDate) ?? dubaiTodayIso();
  const currentMonthKey = `${asOf.slice(0, 7)}-01`;

  let status: FlightTicketEntitlementStatus = "due";
  if (contractExcluded) {
    status = "contract_excluded";
  } else if (ticketValue <= 0) {
    status = "no_ticket_value";
  } else if (input.allocation?.status === "applied_to_payroll") {
    status = "imported";
  } else if (
    input.allocation?.status === "finalized" ||
    input.allocation?.status === "draft"
  ) {
    status = "prepared";
  } else if (payrollMonth === currentMonthKey) {
    status = "due";
  } else if (payrollMonth && payrollMonth < currentMonthKey) {
    status = "pending";
  } else {
    status = "upcoming";
  }

  return {
    ...base,
    anniversaryDate,
    yearsCompleted,
    workYearStart: window.start,
    workYearEnd: window.end,
    payrollMonth,
    calendarDays,
    unpaidLeaveDays,
    unpaidLeaveEntries,
    creditedDays: calc.creditedDays,
    deductionAmount: calc.deductionAmount,
    payableAmount: calc.payableAmount,
    status,
    preparedForPayroll: isFlightTicketAllocationSettled(
      input.allocation?.status,
    ),
    paidOnPayrollMonth:
      input.allocation?.status === "applied_to_payroll"
        ? (input.allocation.paidOnPayrollMonth ?? null)
        : null,
  };
}

export function flightTicketStatusLabel(
  status: FlightTicketEntitlementStatus,
  contractKind?: string | null,
): string {
  switch (status) {
    case "no_ticket_value":
      return "No ticket value";
    case "missing_joining_date":
      return "Missing joining date";
    case "not_eligible":
      return "Not eligible";
    case "contract_excluded": {
      const kind = (contractKind ?? "").trim().toLowerCase();
      if (kind === "part-time") return "Not entitled (part-time)";
      if (kind === "freelancing") return "Not entitled (freelance)";
      return "Not entitled (contract)";
    }
    case "upcoming":
      return "Upcoming";
    case "pending":
      return "Pending";
    case "due":
      return "Due";
    case "prepared":
      return "Prepared";
    case "imported":
      return "Imported";
    default:
      return status;
  }
}
