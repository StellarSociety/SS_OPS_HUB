/**
 * Leave entitlement / balance helpers (UAE private-sector calendar-year model).
 *
 * available =
 *   working_pool + carried_forward + adjusted − used − scheduled − pending − expired
 *   where working_pool = accrued (AL / PH-REPL), or entitled when accrued is 0
 *   (allowance types: SL, ML, PL, BL, STL, HL).
 *
 * Annual leave statutory rules (defaults; overridable via leave_policy settings):
 * - 0–6 completed months: 0 days
 * - >6 and <12 months: service_months × 2
 *   (service_months = full months, or pro-rata incl. partial month — see
 *   annual.partialMonthMethod; termination date always forces pro-rata)
 * - ≥12 months: 30 days / year (2.5 per month accrual display)
 * - Unused AL / PH-REPL may carry into the next year (capped by
 *   annual.carryForwardMaxDays); HR can override carried_forward per employee.
 */

import type {
  HrLeaveAnnualPolicy,
  HrLeaveBalance,
  HrLeaveOtherPolicy,
  HrLeavePartialMonthMethod,
  HrLeavePolicySettings,
  HrLeaveSickPolicy,
  HrLeaveTypeConfig,
} from "./types";
import { DEFAULT_HR_LEAVE_POLICY_SETTINGS } from "./types";
import { computeWorkedMonths, computeWorkedParts, computeWorkedTime } from "./derived";
import { isStaffOnProbation } from "./probation";

/** Leave type codes that get balance rows for a calendar year. */
export const BALANCE_TRACKED_CODES = [
  "AL",
  "SL-FP",
  "SL-HP",
  "SL-UP",
  "UPL",
  "ML-FP",
  "ML-HP",
  "ML-UP",
  "PL",
  "BL",
  "STL",
  "HL",
  "PH-REPL",
] as const;

export type BalanceTrackedCode = (typeof BALANCE_TRACKED_CODES)[number];

/**
 * Roster `label_code` values that count as leave on the schedule
 * (excludes SHIFT, OFF, ABS, and calendar PH taken).
 * Sheet "PH" (replacement day taken) maps to PH-REPL.
 */
/**
 * Roster leave codes shown on the leave calendar (excludes SHIFT, OFF, ABS,
 * calendar PH taken, and auto PH-W). Order mirrors Leave Policy “Leave types”
 * families: AL → PH-REPL → SL → UPL → ML → PL → BL → STL → HL.
 */
export const SCHEDULE_LEAVE_LABEL_CODES = [
  "AL",
  "LP", // legacy → AL
  "PH-REPL",
  "SL",
  "UPL",
  "ML",
  "PL",
  "BL",
  "STL",
  "HL",
] as const;

export type ScheduleLeaveLabelCode = (typeof SCHEDULE_LEAVE_LABEL_CODES)[number];

export type ScheduledLeaveDay = {
  workDate: string;
  labelCode: string;
};

export type ScheduledLeaveRange = {
  labelCode: string;
  fromDate: string;
  toDate: string;
  days: number;
  /** Approval workflow status when matched to a leave request; roster-only → scheduled. */
  approvalStatus?: LeaveCalendarStatus;
  requestId?: string | null;
};

export type ScheduledLeaveLabelStyle = {
  code: string;
  abbreviation: string;
  name: string;
  bgColor: string;
  textColor: string;
  borderColor: string;
};

/** Calendar / request workflow statuses shown in the leave calendar UI. */
export const LEAVE_CALENDAR_STATUSES = [
  "scheduled",
  "pending",
  "approved",
  "rejected",
  "cancelled",
] as const;

export type LeaveCalendarStatus = (typeof LEAVE_CALENDAR_STATUSES)[number];

export type LeaveCalendarEvent = {
  /** Request UUID, or synthetic `schedule:{staffId}:{from}:{to}:{code}`. */
  id: string;
  requestId: string | null;
  staffId: string;
  empNo: string;
  fullName: string;
  departmentId: string | null;
  departmentName: string | null;
  labelCode: string;
  leaveTypeId: string | null;
  fromDate: string;
  toDate: string;
  days: number;
  status: LeaveCalendarStatus;
  /** Raw DB status when backed by hr_leave_requests. */
  rawStatus: string | null;
  notes: string | null;
  onSchedule: boolean;
  source: "schedule" | "request" | "both";
};

/** Dates the employee earned PH-REPL by working on a public holiday. */
export type PhReplacementCreditEntry = {
  date: string;
  holidayName: string | null;
  labelCode: string;
};

export type LeaveUsageKind =
  | "ph-used"
  | "al-used"
  | "al-scheduled"
  | "sick-fp"
  | "sick-hp"
  | "sick-up"
  | "upl-used"
  | "abs-used";

export type LeaveUsageDayEntry = {
  date: string;
  labelCode: string;
  detail: string | null;
};

/** Map legacy / DB request statuses onto calendar display statuses. */
export function normalizeLeaveCalendarStatus(
  raw: string | null | undefined,
): LeaveCalendarStatus {
  switch ((raw ?? "").toLowerCase()) {
    case "approved":
      return "approved";
    case "rejected":
      return "rejected";
    case "cancelled":
    case "canceled":
      return "cancelled";
    case "recorded":
    case "draft":
    case "submitted":
    case "pending_manager":
    case "pending_hr":
    case "changes_requested":
    case "partially_approved":
      return "pending";
    default:
      return "scheduled";
  }
}

export function leaveCalendarStatusLabel(status: LeaveCalendarStatus): string {
  switch (status) {
    case "scheduled":
      return "On schedule";
    case "pending":
      return "Pending approval";
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "cancelled":
      return "Cancelled";
  }
}

/** Inclusive calendar-day count between two ISO dates. */
export function countInclusiveDays(fromDate: string, toDate: string): number {
  const from = parseIsoDate(fromDate);
  const to = parseIsoDate(toDate);
  if (!from || !to || to < from) return 0;
  const ms = to.getTime() - from.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000)) + 1;
}

/** Every ISO date from `fromDate` through `toDate` inclusive. */
export function eachIsoDateInRange(fromDate: string, toDate: string): string[] {
  const from = parseIsoDate(fromDate);
  const to = parseIsoDate(toDate);
  if (!from || !to || to < from) return [];
  const out: string[] = [];
  const cursor = new Date(from);
  while (cursor <= to) {
    const yyyy = cursor.getFullYear();
    const mm = String(cursor.getMonth() + 1).padStart(2, "0");
    const dd = String(cursor.getDate()).padStart(2, "0");
    out.push(`${yyyy}-${mm}-${dd}`);
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

/** True when [aFrom,aTo] overlaps [bFrom,bTo] (inclusive). */
export function dateRangesOverlap(
  aFrom: string,
  aTo: string,
  bFrom: string,
  bTo: string,
): boolean {
  return aFrom <= bTo && bFrom <= aTo;
}

/**
 * Build month grid cells (Mon–Sun), including leading/trailing days from
 * adjacent months so the grid is always complete weeks.
 */
export function buildMonthGrid(year: number, monthIndex: number): {
  key: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
}[] {
  const first = new Date(year, monthIndex, 1);
  const last = new Date(year, monthIndex + 1, 0);
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  // Monday = 0 … Sunday = 6
  const startOffset = (first.getDay() + 6) % 7;
  const endPad = 6 - ((last.getDay() + 6) % 7);
  const totalDays = startOffset + last.getDate() + endPad;

  const cells: {
    key: string;
    day: number;
    inMonth: boolean;
    isToday: boolean;
  }[] = [];

  for (let i = 0; i < totalDays; i += 1) {
    const d = new Date(year, monthIndex, 1 - startOffset + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    cells.push({
      key,
      day: d.getDate(),
      inMonth: d.getMonth() === monthIndex,
      isToday: key === todayKey,
    });
  }
  return cells;
}

/** Normalize legacy roster leave codes (LP → AL, PHRL → PH-REPL). */
export function normalizeScheduleLeaveCode(code: string): string {
  const raw = code.trim().toUpperCase();
  if (raw === "LP") return "AL";
  if (raw === "PHRL") return "PH-REPL";
  return raw || code;
}

export function isScheduleLeaveLabel(code: string): boolean {
  return (SCHEDULE_LEAVE_LABEL_CODES as readonly string[]).includes(
    normalizeScheduleLeaveCode(code),
  );
}

/**
 * Map a Leave Policy type code onto the roster/calendar leave family code.
 * Stage codes (SL-FP, ML-HP, …) collapse to SL / ML. Auto PH-W and non-calendar
 * codes return null.
 */
export function policyCodeToScheduleLeaveCode(
  code: string,
): ScheduleLeaveLabelCode | null {
  const raw = code.trim().toUpperCase();
  if (!raw || raw === "PH-W" || raw === "PH" || raw === "ABS") return null;
  if (raw === "LP" || raw === "AL") return "AL";
  if (raw === "PHRL" || raw === "PH-REPL") return "PH-REPL";
  if (raw.startsWith("SL")) return "SL";
  if (raw.startsWith("ML")) return "ML";
  const normalized = normalizeScheduleLeaveCode(raw);
  if ((SCHEDULE_LEAVE_LABEL_CODES as readonly string[]).includes(normalized)) {
    return normalized as ScheduleLeaveLabelCode;
  }
  return null;
}

/** Leave-calendar filter order from Leave Policy “Leave types” (deduped). */
export function scheduleLeaveCodesFromPolicyOrder(
  leaveTypes: Array<{ code: string; active?: boolean }>,
): ScheduleLeaveLabelCode[] {
  const seen = new Set<string>();
  const ordered: ScheduleLeaveLabelCode[] = [];
  for (const type of leaveTypes) {
    if (type.active === false) continue;
    const code = policyCodeToScheduleLeaveCode(type.code);
    if (!code || code === "LP" || seen.has(code)) continue;
    seen.add(code);
    ordered.push(code);
  }
  for (const code of SCHEDULE_LEAVE_LABEL_CODES) {
    if (code === "LP" || seen.has(code)) continue;
    seen.add(code);
    ordered.push(code);
  }
  return ordered;
}

/** Display name for a schedule leave label (roster codes, not balance stages). */
export function scheduleLeaveDisplayName(code: string): string {
  const normalized = normalizeScheduleLeaveCode(code);
  switch (normalized) {
    case "AL":
      return "Annual Leave";
    case "SL":
      return "Sick Leave";
    case "UPL":
      return "Unpaid Leave";
    case "ABS":
      return "Unauthorised Absence";
    case "ML":
      return "Maternity Leave";
    case "PL":
      return "Parental Leave";
    case "BL":
      return "Bereavement Leave";
    case "HL":
      return "Hajj Leave";
    case "STL":
      return "Study Leave";
    case "PH-REPL":
      return "Public Holiday";
    default:
      return normalized;
  }
}

/** Usage-only leave codes (no entitlement pool; track used/scheduled only). */
export function isUsageOnlyLeaveCode(code: string): boolean {
  return code === "UPL";
}

function addCalendarDaysIso(isoDate: string, delta: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!m) return isoDate;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setDate(d.getDate() + delta);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Collapse consecutive same-code leave days into contiguous ranges.
 * Input days should already be filtered to leave labels.
 */
export function groupScheduledLeaveRanges(
  days: ScheduledLeaveDay[],
): ScheduledLeaveRange[] {
  const sorted = [...days]
    .map((d) => ({
      workDate: d.workDate.slice(0, 10),
      labelCode: normalizeScheduleLeaveCode(d.labelCode),
    }))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.workDate))
    .sort((a, b) =>
      a.workDate === b.workDate
        ? a.labelCode.localeCompare(b.labelCode)
        : a.workDate.localeCompare(b.workDate),
    );

  const ranges: ScheduledLeaveRange[] = [];
  for (const day of sorted) {
    const last = ranges[ranges.length - 1];
    if (
      last &&
      last.labelCode === day.labelCode &&
      addCalendarDaysIso(last.toDate, 1) === day.workDate
    ) {
      last.toDate = day.workDate;
      last.days += 1;
      continue;
    }
    ranges.push({
      labelCode: day.labelCode,
      fromDate: day.workDate,
      toDate: day.workDate,
      days: 1,
    });
  }
  return ranges;
}

export function mergeLeavePolicy(
  stored: Partial<HrLeavePolicySettings> | null | undefined,
): HrLeavePolicySettings {
  const base = DEFAULT_HR_LEAVE_POLICY_SETTINGS;
  if (!stored) return structuredClone(base);

  const leaveTypes =
    Array.isArray(stored.leaveTypes) && stored.leaveTypes.length > 0
      ? (stored.leaveTypes.map((t) => {
          const merged = {
            ...base.leaveTypes.find((d) => d.code === t.code),
            ...t,
          } as HrLeaveTypeConfig;
          // Drop legacy "Replacement" wording on PH allowance.
          if (
            merged.code === "PH-REPL" &&
            /replacement/i.test(merged.name ?? "")
          ) {
            merged.name = "Public Holiday";
            merged.displayLabel = "PH-REPL";
          }
          if (merged.code === "PH-REPL" && merged.displayLabel === "PH") {
            merged.displayLabel = "PH-REPL";
          }
          // PH-W is derived: SHIFT on a configured public holiday day.
          if (merged.code === "PH-W") {
            merged.name = "Public Holiday Worked (auto)";
            merged.balanceRequired = false;
          }
          return merged;
        }) as HrLeaveTypeConfig[])
      : structuredClone(base.leaveTypes);

  return {
    yearModel: "calendar",
    leaveTypes,
    annual: {
      ...base.annual,
      ...stored.annual,
      partialMonthMethod: normalizePartialMonthMethod(
        stored.annual?.partialMonthMethod ?? base.annual.partialMonthMethod,
      ),
    },
    sick: { ...base.sick, ...stored.sick },
    other: { ...base.other, ...stored.other },
    approvals: { ...base.approvals, ...stored.approvals },
  };
}

function normalizePartialMonthMethod(
  value: unknown,
): HrLeavePartialMonthMethod {
  return value === "pro_rata" ? "pro_rata" : "full_months";
}

/** Completed calendar months of service as of `asOf`. */
export function completedServiceMonths(
  joiningDate: string | null | undefined,
  asOf: Date = new Date(),
): number {
  if (!joiningDate?.trim()) return 0;
  const start = parseIsoDate(joiningDate);
  if (!start || start > asOf) return 0;

  let months =
    (asOf.getFullYear() - start.getFullYear()) * 12 +
    (asOf.getMonth() - start.getMonth());

  if (asOf.getDate() < start.getDate()) {
    months -= 1;
  }

  return Math.max(0, months);
}

/**
 * Service length in months for AL accrual.
 * - full_months: integer completed months
 * - pro_rata: completed months + fraction of the current month
 */
export function serviceMonthsForAccrual(
  joiningDate: string | null | undefined,
  asOf: Date = new Date(),
  method: HrLeavePartialMonthMethod = "full_months",
): number {
  if (method === "full_months") {
    return completedServiceMonths(joiningDate, asOf);
  }

  const asOfIso = toIsoDateLocal(asOf);
  const parts = computeWorkedParts(joiningDate, asOfIso);
  if (!parts) return 0;

  const start = joiningDate?.trim() ? parseIsoDate(joiningDate) : null;
  if (!start) return 0;

  // Denominator for leftover days: month that owns the incomplete service month.
  const denom =
    asOf.getDate() < start.getDate()
      ? new Date(asOf.getFullYear(), asOf.getMonth(), 0).getDate()
      : new Date(asOf.getFullYear(), asOf.getMonth() + 1, 0).getDate();

  const fraction = denom > 0 ? parts.days / denom : 0;
  return Math.max(0, parts.years * 12 + parts.months + fraction);
}

function toIsoDateLocal(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** Resolve as-of date for AL entitlement. */
export function resolveAnnualLeaveEvalDate(
  leaveYear: number,
  asOf: Date = new Date(),
  terminationDate?: string | null,
): Date {
  const yearEnd = endOfLeaveYear(leaveYear);
  const term = terminationDate?.trim()
    ? parseIsoDate(terminationDate)
    : null;

  // Known last working day → project entitlement through that date
  // (settlement), not only through "today".
  if (term) {
    return term < yearEnd ? term : yearEnd;
  }

  return asOf < yearEnd ? asOf : yearEnd;
}

/** Effective partial-month method (termination always forces pro-rata). */
export function resolvePartialMonthMethod(
  annual: HrLeaveAnnualPolicy,
  terminationDate?: string | null,
): HrLeavePartialMonthMethod {
  if (terminationDate?.trim()) return "pro_rata";
  return normalizePartialMonthMethod(annual.partialMonthMethod);
}

export function completedServiceYears(
  joiningDate: string | null | undefined,
  asOf: Date = new Date(),
): number {
  return Math.floor(completedServiceMonths(joiningDate, asOf) / 12);
}

/**
 * Statutory annual-leave entitlement (days) for a calendar leave year,
 * evaluated at year-end (or today if the year is current).
 * When `terminationDate` is set, caps at that date and uses pro-rata months.
 */
export function computeAnnualLeaveEntitlement(
  joiningDate: string | null | undefined,
  leaveYear: number,
  annual: HrLeaveAnnualPolicy = DEFAULT_HR_LEAVE_POLICY_SETTINGS.annual,
  asOf: Date = new Date(),
  terminationDate?: string | null,
): number {
  const evalDate = resolveAnnualLeaveEvalDate(
    leaveYear,
    asOf,
    terminationDate,
  );
  const method = resolvePartialMonthMethod(annual, terminationDate);
  const completed = completedServiceMonths(joiningDate, evalDate);
  const months = serviceMonthsForAccrual(joiningDate, evalDate, method);

  if (completed <= annual.zeroEntitlementMonths) return 0;
  if (completed < 12) {
    return Math.round(months * annual.daysPerMonthBeforeYear);
  }
  return annual.annualDaysAfterYear;
}

/** Accrued AL within a calendar year for display / seeding. */
export function computeAnnualLeaveAccrued(
  joiningDate: string | null | undefined,
  leaveYear: number,
  annual: HrLeaveAnnualPolicy = DEFAULT_HR_LEAVE_POLICY_SETTINGS.annual,
  asOf: Date = new Date(),
  terminationDate?: string | null,
): number {
  const entitlement = computeAnnualLeaveEntitlement(
    joiningDate,
    leaveYear,
    annual,
    asOf,
    terminationDate,
  );
  if (entitlement <= 0) return 0;

  const evalDate = resolveAnnualLeaveEvalDate(
    leaveYear,
    asOf,
    terminationDate,
  );
  const completed = completedServiceMonths(joiningDate, evalDate);

  if (completed < 12) {
    return entitlement;
  }

  const yearStart = startOfLeaveYear(leaveYear);
  const join = joiningDate?.trim() ? parseIsoDate(joiningDate) : null;
  const accrualStart = join && join > yearStart ? join : yearStart;
  const method = resolvePartialMonthMethod(annual, terminationDate);
  const monthsFromYearStart =
    method === "pro_rata"
      ? Math.max(
          0,
          serviceMonthsForAccrual(
            toIsoDateLocal(accrualStart),
            evalDate,
            "pro_rata",
          ),
        )
      : monthsBetween(accrualStart, evalDate);
  const accrued = monthsFromYearStart * annual.monthlyAccrualAfterYear;
  return Math.min(entitlement, Math.max(0, Math.round(accrued)));
}

export function availableBalance(
  row: Pick<
    HrLeaveBalance,
    | "entitled"
    | "accrued"
    | "carried_forward"
    | "adjusted"
    | "used"
    | "scheduled"
    | "pending"
    | "expired"
  >,
): number {
  // AL / PH-REPL earn into accrued. Allowance types (SL, ML, …) keep accrued at 0
  // and draw from entitled instead.
  const workingPool =
    num(row.accrued) > 0 || num(row.entitled) === 0
      ? num(row.accrued)
      : num(row.entitled);

  return round2(
    workingPool +
      num(row.carried_forward) +
      num(row.adjusted) -
      num(row.used) -
      num(row.scheduled) -
      num(row.pending) -
      num(row.expired),
  );
}

export function startOfLeaveYear(year: number): Date {
  return new Date(year, 0, 1);
}

export function endOfLeaveYear(year: number): Date {
  return new Date(year, 11, 31, 23, 59, 59, 999);
}

export function currentLeaveYear(asOf: Date = new Date()): number {
  return asOf.getFullYear();
}

/** Seed entitled/accrued values for a tracked leave type. */
export function seedEntitlementForType(
  code: string,
  joiningDate: string | null | undefined,
  leaveYear: number,
  policy: HrLeavePolicySettings,
  options?: {
    onProbation?: boolean;
    asOf?: Date;
    /** Cap AL calc at this date and force pro-rata months. */
    terminationDate?: string | null;
    /** Days earned by working on public holidays (PH-REPL). */
    phReplacementCredits?: number;
  },
): { entitled: number; accrued: number } {
  const asOf = options?.asOf ?? new Date();
  const sick = policy.sick;
  const other = policy.other;
  const terminationDate = options?.terminationDate ?? null;

  switch (code) {
    case "AL": {
      const entitled = computeAnnualLeaveEntitlement(
        joiningDate,
        leaveYear,
        policy.annual,
        asOf,
        terminationDate,
      );
      const accrued = computeAnnualLeaveAccrued(
        joiningDate,
        leaveYear,
        policy.annual,
        asOf,
        terminationDate,
      );
      return { entitled, accrued };
    }
    case "SL-FP": {
      if (options?.onProbation && sick.unpaidDuringProbation) {
        return { entitled: 0, accrued: 0 };
      }
      return { entitled: sick.fullPayDays, accrued: 0 };
    }
    case "SL-HP": {
      if (options?.onProbation && sick.unpaidDuringProbation) {
        return { entitled: 0, accrued: 0 };
      }
      return { entitled: sick.halfPayDays, accrued: 0 };
    }
    case "SL-UP": {
      return { entitled: sick.unpaidDays, accrued: 0 };
    }
    case "UPL":
      // No entitlement pool — track roster usage only.
      return { entitled: 0, accrued: 0 };
    case "ML-FP":
      return {
        entitled: other.maternityFullPayDays,
        accrued: 0,
      };
    case "ML-HP":
      return {
        entitled: other.maternityHalfPayDays,
        accrued: 0,
      };
    case "ML-UP":
      return {
        entitled: other.maternityUnpaidExtraDays,
        accrued: 0,
      };
    case "PL":
      return {
        entitled: other.parentalWorkingDays,
        accrued: 0,
      };
    case "BL":
      return {
        entitled: other.bereavementSpouseDays,
        accrued: 0,
      };
    case "STL": {
      const years = completedServiceYears(joiningDate, asOf);
      if (years < other.studyLeaveMinServiceYears) {
        return { entitled: 0, accrued: 0 };
      }
      return {
        entitled: other.studyLeaveWorkingDays,
        accrued: 0,
      };
    }
    case "HL":
      return {
        entitled: other.hajjLeaveDays,
        accrued: 0,
      };
    case "PH-REPL": {
      // Derived from roster × public holidays (worked → credit). Pass via options.
      const credits = options?.phReplacementCredits ?? 0;
      return { entitled: credits, accrued: credits };
    }
    default:
      return { entitled: 0, accrued: 0 };
  }
}

/**
 * Roster labels that mean the employee worked on a calendar day.
 * Primary trigger is SHIFT — if that day is a venue public holiday
 * (Attendance → Public holidays), PH-REPL accrues automatically.
 * PH-W is kept only for legacy/manual rows.
 */
export const PH_WORKED_LABEL_CODES = new Set(["SHIFT", "PH-W"]);

/**
 * PH replacement rule (automatic):
 * - Public holiday dates come from venue settings
 * - Worked that day (SHIFT, or legacy PH-W) → +1 PH-REPL credit
 * - Did not work (PH taken, OFF, leave, etc.) → no credit
 *
 * Returns unique holiday dates that earned a credit, sorted ascending.
 */
export function listPhReplacementCreditDates(input: {
  holidayDates: Iterable<string>;
  scheduleDays: Array<{ work_date: string; label_code: string }>;
}): string[] {
  const holidays = new Set(
    [...input.holidayDates].map((d) => d.slice(0, 10)),
  );
  if (holidays.size === 0) return [];

  const credited = new Set<string>();
  for (const day of input.scheduleDays) {
    const date = String(day.work_date).slice(0, 10);
    if (!holidays.has(date)) continue;
    if (!PH_WORKED_LABEL_CODES.has(day.label_code)) continue;
    credited.add(date);
  }
  return Array.from(credited).sort();
}

export function countPhReplacementCredits(input: {
  holidayDates: Iterable<string>;
  scheduleDays: Array<{ work_date: string; label_code: string }>;
}): number {
  return listPhReplacementCreditDates(input).length;
}

/** Leave types that may carry unused days into the next calendar year. */
export const CARRY_FORWARD_LEAVE_CODES = new Set(["AL", "PH-REPL"]);

export function canCarryForwardLeaveCode(code: string): boolean {
  return CARRY_FORWARD_LEAVE_CODES.has(code);
}

export function carryForwardAmount(
  available: number,
  annual: HrLeaveAnnualPolicy,
): number {
  if (available <= 0) return 0;
  if (annual.carryForwardMaxDays <= 0) return 0;
  return round2(Math.min(available, annual.carryForwardMaxDays));
}

/**
 * Opening carried-forward days for a leave year.
 * Prefers the prior year's remaining available balance; when no prior balance
 * row exists, estimates AL from joining date / policy (assumes unused).
 * PH-REPL requires a prior balance (roster-derived) — no joining-date estimate.
 */
export function computeOpeningCarryForward(input: {
  code: string;
  joiningDate: string | null | undefined;
  leaveYear: number;
  policy: HrLeavePolicySettings;
  priorBalance?: Pick<
    HrLeaveBalance,
    | "entitled"
    | "accrued"
    | "carried_forward"
    | "adjusted"
    | "used"
    | "scheduled"
    | "pending"
    | "expired"
  > | null;
  terminationDate?: string | null;
}): number {
  if (!canCarryForwardLeaveCode(input.code)) return 0;

  const priorYear = input.leaveYear - 1;
  let available = 0;

  if (input.priorBalance) {
    available = Math.max(0, availableBalance(input.priorBalance));
  } else if (input.code === "AL") {
    // No prior-year row yet: estimate unused statutory entitlement at year-end.
    available = computeAnnualLeaveEntitlement(
      input.joiningDate,
      priorYear,
      input.policy.annual,
      endOfLeaveYear(priorYear),
      input.terminationDate,
    );
  }

  return carryForwardAmount(available, input.policy.annual);
}

export function findLeaveType(
  policy: HrLeavePolicySettings,
  code: string,
): HrLeaveTypeConfig | undefined {
  return policy.leaveTypes.find((t) => t.code === code);
}

/** User-facing leave type name (hides internal/legacy wording). */
export function leaveTypeDisplayName(
  code: string,
  type?: Pick<HrLeaveTypeConfig, "name" | "displayLabel"> | null,
): string {
  if (code === "PH-REPL") return "Public Holiday";
  return type?.name ?? code;
}

export function summarizeSickUsage(
  balances: HrLeaveBalance[],
  sick: HrLeaveSickPolicy,
): {
  fpUsed: number;
  hpUsed: number;
  upUsed: number;
  fpRemaining: number;
  hpRemaining: number;
  upRemaining: number;
  totalUsed: number;
  yearlyMax: number;
} {
  const fp = balances.find((b) => b.leave_type_code === "SL-FP");
  const hp = balances.find((b) => b.leave_type_code === "SL-HP");
  const up = balances.find((b) => b.leave_type_code === "SL-UP");
  const fpUsed = num(fp?.used);
  const hpUsed = num(hp?.used);
  const upUsed = num(up?.used);
  return {
    fpUsed,
    hpUsed,
    upUsed,
    fpRemaining: round2(
      Math.max(0, fp ? availableBalance(fp) : sick.fullPayDays),
    ),
    hpRemaining: round2(
      Math.max(0, hp ? availableBalance(hp) : sick.halfPayDays),
    ),
    upRemaining: round2(
      Math.max(0, up ? availableBalance(up) : sick.unpaidDays),
    ),
    totalUsed: round2(fpUsed + hpUsed + upUsed),
    yearlyMax: sick.yearlyMaximumDays,
  };
}

function parseIsoDate(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function monthsBetween(from: Date, to: Date): number {
  if (to < from) return 0;
  let months =
    (to.getFullYear() - from.getFullYear()) * 12 +
    (to.getMonth() - from.getMonth());
  if (to.getDate() < from.getDate()) months -= 1;
  return Math.max(0, months);
}

function num(v: number | null | undefined): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type EmployeeLeaveSummary = {
  staffId: string;
  empNo: string;
  fullName: string;
  departmentName: string | null;
  employmentStatus: string | null;
  /** Display label from joining → termination (or today), e.g. "02 Y | 03 M | 05 D". */
  workedTime: string | null;
  /** Total months for sorting; null when joining date is missing. */
  workedMonths: number | null;
  /** ON Board + Pending probation (same as Staff Directory widget). */
  onProbation: boolean;
  /** Accrued + carried + adjusted (working pool before deductions). */
  alAvail: number;
  alUsed: number;
  alScheduled: number;
  /** Remaining after used / scheduled / pending / expired. */
  alBalance: number;
  alAccrued: number;
  alCarriedForward: number;
  sickFpUsed: number;
  sickHpUsed: number;
  sickUpUsed: number;
  sickTotalUsed: number;
  /** Roster ABS (unauthorised absence) days in the leave year. */
  absUsed: number;
  /** Roster UPL days in the leave year. */
  uplUsed: number;
  /** Accrued + carried + adjusted for PH replacement. */
  phAvail: number;
  phUsed: number;
  /** Remaining PH replacement days. */
  phBalance: number;
};

function workingPool(
  row:
    | Pick<HrLeaveBalance, "accrued" | "carried_forward" | "adjusted">
    | undefined,
): number {
  if (!row) return 0;
  return round2(
    num(row.accrued) + num(row.carried_forward) + num(row.adjusted),
  );
}

/** Count roster days matching any of the given label codes. */
export function countScheduleLabelDays(
  scheduleDays: Array<{ label_code: string }>,
  codes: ReadonlySet<string>,
): number {
  let n = 0;
  for (const day of scheduleDays) {
    if (codes.has(day.label_code)) n += 1;
  }
  return n;
}

export type ScheduleDayRef = {
  label_code: string;
  /** YYYY-MM-DD when available (needed for AL used vs scheduled). */
  work_date?: string;
};

/** Pending leave-request days (not yet on the roster) held against a balance. */
export type PendingLeaveRequestRef = {
  /** Roster/family code: AL, SL, UPL, PH-REPL, ML, … */
  scheduleCode: string;
  startDate: string;
  endDate: string;
  status: string;
};

export function isoDateOnly(asOf: Date = new Date()): string {
  return `${asOf.getFullYear()}-${String(asOf.getMonth() + 1).padStart(2, "0")}-${String(asOf.getDate()).padStart(2, "0")}`;
}

/** Split ISO dates into used (before today) vs scheduled (today onward). */
export function splitDatesPastFuture(
  dates: string[],
  asOf: Date = new Date(),
): { usedDates: string[]; scheduledDates: string[] } {
  const today = isoDateOnly(asOf);
  const usedDates: string[] = [];
  const scheduledDates: string[] = [];
  for (const raw of dates) {
    const date = raw.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (date < today) usedDates.push(date);
    else scheduledDates.push(date);
  }
  usedDates.sort();
  scheduledDates.sort();
  return { usedDates, scheduledDates };
}

/** Roster days for one leave label, split into used (past) vs scheduled (today+). */
export function splitLeaveScheduleDaysByCode(
  scheduleDays: ScheduleDayRef[],
  leaveCode: string,
  asOf: Date = new Date(),
): { usedDates: string[]; scheduledDates: string[] } {
  const want = normalizeScheduleLeaveCode(leaveCode);
  const dates = scheduleDays
    .filter((d) => normalizeScheduleLeaveCode(d.label_code) === want)
    .map((d) => (d.work_date ?? "").slice(0, 10));
  return splitDatesPastFuture(dates, asOf);
}

/** Split annual leave roster days into used (past) vs scheduled (today+). */
export function splitAnnualLeaveScheduleDays(
  scheduleDays: ScheduleDayRef[],
  asOf: Date = new Date(),
): { usedDates: string[]; scheduledDates: string[] } {
  return splitLeaveScheduleDaysByCode(scheduleDays, "AL", asOf);
}

/** Split UPL roster days into used (past) vs scheduled (today+). */
export function splitUnpaidLeaveScheduleDays(
  scheduleDays: ScheduleDayRef[],
  asOf: Date = new Date(),
): { usedDates: string[]; scheduledDates: string[] } {
  return splitLeaveScheduleDaysByCode(scheduleDays, "UPL", asOf);
}

/**
 * Allocate chronological dates into FP → HP → UP buckets by allotment caps.
 * Overflow beyond FP+HP always lands in UP (even past the unpaid entitlement).
 */
export function allocateStagedLeaveDates(
  dates: string[],
  fullPayMax: number,
  halfPayMax: number,
): { fpDates: string[]; hpDates: string[]; upDates: string[] } {
  const sorted = [...dates]
    .map((d) => d.slice(0, 10))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  const fpDates: string[] = [];
  const hpDates: string[] = [];
  const upDates: string[] = [];
  const fpMax = Math.max(0, fullPayMax);
  const hpMax = Math.max(0, halfPayMax);
  for (const date of sorted) {
    if (fpDates.length < fpMax) fpDates.push(date);
    else if (hpDates.length < hpMax) hpDates.push(date);
    else upDates.push(date);
  }
  return { fpDates, hpDates, upDates };
}

/**
 * Allocate roster SL days into FP → HP → UP buckets by policy allotment order.
 * Returns dates per stage (chronological).
 */
export function allocateSickLeaveScheduleDays(
  scheduleDays: ScheduleDayRef[],
  sick: HrLeaveSickPolicy,
): { fpDates: string[]; hpDates: string[]; upDates: string[] } {
  const dates = scheduleDays
    .filter((d) => normalizeScheduleLeaveCode(d.label_code) === "SL")
    .map((d) => (d.work_date ?? "").slice(0, 10));
  return allocateStagedLeaveDates(dates, sick.fullPayDays, sick.halfPayDays);
}

/** Allocate roster ML days into FP → HP → UP by maternity policy allotments. */
export function allocateMaternityLeaveScheduleDays(
  scheduleDays: ScheduleDayRef[],
  other: HrLeaveOtherPolicy,
): { fpDates: string[]; hpDates: string[]; upDates: string[] } {
  const dates = scheduleDays
    .filter((d) => normalizeScheduleLeaveCode(d.label_code) === "ML")
    .map((d) => (d.work_date ?? "").slice(0, 10));
  return allocateStagedLeaveDates(
    dates,
    other.maternityFullPayDays,
    other.maternityHalfPayDays,
  );
}

/**
 * Count pending-request days in a leave year that are not already on the roster
 * for the matching leave family code.
 */
export function countPendingLeaveDaysByScheduleCode(
  requests: PendingLeaveRequestRef[],
  scheduleDays: ScheduleDayRef[],
  leaveYear: number,
): Map<string, number> {
  const yearFrom = `${leaveYear}-01-01`;
  const yearTo = `${leaveYear}-12-31`;
  const onRoster = new Set<string>();
  for (const day of scheduleDays) {
    const date = (day.work_date ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const code = normalizeScheduleLeaveCode(day.label_code);
    onRoster.add(`${code}:${date}`);
  }

  const counts = new Map<string, number>();
  for (const req of requests) {
    if (normalizeLeaveCalendarStatus(req.status) !== "pending") continue;
    const code = normalizeScheduleLeaveCode(req.scheduleCode);
    if (!code) continue;
    const start = req.startDate.slice(0, 10);
    const end = req.endDate.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      continue;
    }
    for (const date of eachIsoDateInRange(start, end)) {
      if (date < yearFrom || date > yearTo) continue;
      if (onRoster.has(`${code}:${date}`)) continue;
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * Spread pending family-code days across staged balance rows (FP → HP → UP),
 * filling remaining entitlement after used + scheduled.
 */
function allocatePendingIntoStages(
  pendingDays: number,
  stages: Array<{
    code: string;
    entitled: number;
    used: number;
    scheduled: number;
  }>,
): Map<string, number> {
  const out = new Map<string, number>();
  let remaining = Math.max(0, pendingDays);
  for (let i = 0; i < stages.length; i += 1) {
    const stage = stages[i]!;
    const isLast = i === stages.length - 1;
    const room = Math.max(
      0,
      stage.entitled - stage.used - stage.scheduled,
    );
    const take = isLast ? remaining : Math.min(remaining, room);
    out.set(stage.code, take);
    remaining -= take;
  }
  return out;
}

/**
 * Overlay live used / scheduled / pending onto balance rows:
 * - used = past roster leave days (held against the balance)
 * - scheduled = today+ roster leave days
 * - pending = pending request days not yet on the roster
 *
 * Entitlement fields (entitled, accrued, carried, adjusted, expired) are unchanged.
 */
export function overlayBalanceUsageFromSchedule(params: {
  balances: HrLeaveBalance[];
  scheduleDays: ScheduleDayRef[];
  policy: HrLeavePolicySettings;
  pendingRequests?: PendingLeaveRequestRef[];
  leaveYear: number;
  asOf?: Date;
  staffId?: string;
  venueId?: string;
  /** Ignore roster days strictly after this date (e.g. post-termination). */
  terminationDate?: string | null;
}): HrLeaveBalance[] {
  const {
    balances,
    policy,
    pendingRequests = [],
    leaveYear,
    asOf = new Date(),
    terminationDate = null,
  } = params;

  const term = terminationDate?.trim() ?? "";
  const scheduleDays =
    /^\d{4}-\d{2}-\d{2}$/.test(term)
      ? params.scheduleDays.filter((d) => {
          const date = (d.work_date ?? "").slice(0, 10);
          return !date || date <= term;
        })
      : params.scheduleDays;

  const pendingByFamily = countPendingLeaveDaysByScheduleCode(
    pendingRequests,
    scheduleDays,
    leaveYear,
  );

  const usage = new Map<
    string,
    { used: number; scheduled: number; pending: number }
  >();

  const setUsage = (
    code: string,
    used: number,
    scheduled: number,
    pending = 0,
  ) => {
    usage.set(code, { used, scheduled, pending });
  };

  // Simple 1:1 roster codes → balance rows.
  for (const code of ["AL", "UPL", "PH-REPL", "PL", "BL", "STL", "HL"] as const) {
    const split = splitLeaveScheduleDaysByCode(scheduleDays, code, asOf);
    setUsage(
      code,
      split.usedDates.length,
      split.scheduledDates.length,
      pendingByFamily.get(code) ?? 0,
    );
  }

  const sickAlloc = allocateSickLeaveScheduleDays(scheduleDays, policy.sick);
  const sickStages = (
    [
      ["SL-FP", sickAlloc.fpDates, policy.sick.fullPayDays],
      ["SL-HP", sickAlloc.hpDates, policy.sick.halfPayDays],
      ["SL-UP", sickAlloc.upDates, policy.sick.unpaidDays],
    ] as const
  ).map(([code, dates, entitled]) => {
    const split = splitDatesPastFuture(dates, asOf);
    return {
      code,
      entitled,
      used: split.usedDates.length,
      scheduled: split.scheduledDates.length,
    };
  });
  const sickPending = allocatePendingIntoStages(
    pendingByFamily.get("SL") ?? 0,
    sickStages,
  );
  for (const stage of sickStages) {
    setUsage(
      stage.code,
      stage.used,
      stage.scheduled,
      sickPending.get(stage.code) ?? 0,
    );
  }

  const mlAlloc = allocateMaternityLeaveScheduleDays(
    scheduleDays,
    policy.other,
  );
  const mlStages = (
    [
      ["ML-FP", mlAlloc.fpDates, policy.other.maternityFullPayDays],
      ["ML-HP", mlAlloc.hpDates, policy.other.maternityHalfPayDays],
      ["ML-UP", mlAlloc.upDates, policy.other.maternityUnpaidExtraDays],
    ] as const
  ).map(([code, dates, entitled]) => {
    const split = splitDatesPastFuture(dates, asOf);
    return {
      code,
      entitled,
      used: split.usedDates.length,
      scheduled: split.scheduledDates.length,
    };
  });
  const mlPending = allocatePendingIntoStages(
    pendingByFamily.get("ML") ?? 0,
    mlStages,
  );
  for (const stage of mlStages) {
    setUsage(
      stage.code,
      stage.used,
      stage.scheduled,
      mlPending.get(stage.code) ?? 0,
    );
  }

  const nowIso = new Date().toISOString();
  const byCode = new Map(balances.map((b) => [b.leave_type_code, b] as const));
  const result: HrLeaveBalance[] = balances.map((bal) => {
    const overlay = usage.get(bal.leave_type_code);
    if (!overlay) return { ...bal, pending: 0 };
    return {
      ...bal,
      used: overlay.used,
      scheduled: overlay.scheduled,
      pending: overlay.pending,
    };
  });

  // Ensure UPL (usage-only) appears even when no DB row exists yet.
  if (!byCode.has("UPL")) {
    const overlay = usage.get("UPL") ?? { used: 0, scheduled: 0, pending: 0 };
    result.push({
      id: `synthetic-upl:${params.staffId ?? "unknown"}:${leaveYear}`,
      venue_id: params.venueId ?? balances[0]?.venue_id ?? "",
      staff_id: params.staffId ?? balances[0]?.staff_id ?? "",
      leave_year: leaveYear,
      leave_type_code: "UPL",
      entitled: 0,
      accrued: 0,
      used: overlay.used,
      scheduled: overlay.scheduled,
      pending: overlay.pending,
      carried_forward: 0,
      expired: 0,
      adjusted: 0,
      created_at: nowIso,
      updated_at: nowIso,
    });
  }

  return result;
}

export function buildEmployeeLeaveSummary(
  staff: {
    id: string;
    emp_no: string;
    full_name: string;
    joining_date?: string | null;
    termination_date?: string | null;
    probation_duration_value?: number | null;
    probation_duration_unit?: string | null;
    probation_status?: string | null;
    department?: { name: string } | null;
    employment_status?: { name: string } | null;
  },
  balances: HrLeaveBalance[],
  policy: HrLeavePolicySettings,
  options?: {
    /** Roster days for this staff in the leave year. */
    scheduleDays?: ScheduleDayRef[];
    asOf?: Date;
  },
): EmployeeLeaveSummary {
  const al = balances.find((b) => b.leave_type_code === "AL");
  const ph = balances.find((b) => b.leave_type_code === "PH-REPL");
  const sick = summarizeSickUsage(balances, policy.sick);
  const scheduleDays = options?.scheduleDays ?? [];
  const asOf = options?.asOf ?? new Date();
  const hasSchedule = scheduleDays.length > 0;

  const absUsed = countScheduleLabelDays(scheduleDays, new Set(["ABS"]));
  const uplUsed = countScheduleLabelDays(scheduleDays, new Set(["UPL"]));
  const phUsedFromSchedule = countScheduleLabelDays(
    scheduleDays,
    new Set(["PH-REPL"]),
  );
  const phAvail = workingPool(ph);
  const phUsed = hasSchedule ? phUsedFromSchedule : num(ph?.used);
  const phBalance = round2(phAvail - phUsed);

  const alSplit = splitAnnualLeaveScheduleDays(scheduleDays, asOf);
  const alUsed = hasSchedule ? alSplit.usedDates.length : num(al?.used);
  const alScheduled = hasSchedule
    ? alSplit.scheduledDates.length
    : num(al?.scheduled);
  const alAvail = workingPool(al);
  const alBalance = hasSchedule
    ? round2(alAvail - alUsed - alScheduled)
    : al
      ? availableBalance(al)
      : 0;

  const sickAlloc = allocateSickLeaveScheduleDays(scheduleDays, policy.sick);
  const sickFpUsed = hasSchedule ? sickAlloc.fpDates.length : sick.fpUsed;
  const sickHpUsed = hasSchedule ? sickAlloc.hpDates.length : sick.hpUsed;
  const sickUpUsed = hasSchedule ? sickAlloc.upDates.length : sick.upUsed;

  return {
    staffId: staff.id,
    empNo: staff.emp_no,
    fullName: staff.full_name,
    departmentName: staff.department?.name ?? null,
    employmentStatus: staff.employment_status?.name?.trim() || null,
    workedTime: computeWorkedTime(staff.joining_date, staff.termination_date),
    workedMonths: computeWorkedMonths(
      staff.joining_date,
      staff.termination_date,
    ),
    onProbation: isStaffOnProbation({
      joining_date: staff.joining_date ?? null,
      termination_date: staff.termination_date ?? null,
      probation_duration_value: staff.probation_duration_value ?? null,
      probation_duration_unit: staff.probation_duration_unit ?? null,
      probation_status: staff.probation_status ?? null,
      employment_status: staff.employment_status ?? null,
    }),
    alAvail,
    alUsed,
    alScheduled,
    alBalance,
    alAccrued: num(al?.accrued),
    alCarriedForward: num(al?.carried_forward),
    sickFpUsed,
    sickHpUsed,
    sickUpUsed,
    sickTotalUsed: round2(sickFpUsed + sickHpUsed + sickUpUsed),
    absUsed,
    uplUsed,
    phAvail,
    phUsed,
    phBalance,
  };
}

export type { HrLeaveAnnualPolicy, HrLeaveOtherPolicy, HrLeaveSickPolicy };
