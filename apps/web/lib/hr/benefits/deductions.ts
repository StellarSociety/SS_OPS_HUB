/**
 * Benefit deductions — amounts taken from gratuity or service charge.
 *
 * Each month’s installment is split equally across the people who are actually
 * on that month’s benefit run (department members on the run, or selected
 * people who appear on it). If a month cannot cover the installment, leftover
 * rolls to later months until the total is cleared.
 */

import type { BenefitKind } from "./types";
import { floorPayoutToAed5 } from "./rounding";

export const BENEFIT_DEDUCTION_KINDS = ["gratuity", "service_charge"] as const;
export type BenefitDeductionKind = (typeof BENEFIT_DEDUCTION_KINDS)[number];

export const BENEFIT_DEDUCTION_KIND_LABELS: Record<BenefitDeductionKind, string> =
  {
    gratuity: "Gratuity",
    service_charge: "Service Charge",
  };

export type BenefitDeductionStaffRef = {
  id: string;
  empNo: string | null;
  fullName: string;
};

/** Slim staff row for the deductions UI — no salary or identity documents. */
export type BenefitDeductionStaffOption = {
  id: string;
  empNo: string;
  fullName: string;
  photoUrl: string | null;
  departmentId: string | null;
  departmentName: string | null;
  positionName: string | null;
  employmentStatusName: string | null;
};

export type BenefitDeductionDepartmentOption = {
  id: string;
  name: string;
};

export type BenefitDeductionTarget =
  | {
      type: "department";
      departmentId: string;
      departmentName: string;
      staff: BenefitDeductionStaffRef[];
    }
  | {
      type: "people";
      staff: BenefitDeductionStaffRef[];
    };

export const BENEFIT_DEDUCTION_LATER_SPLIT_MODES = [
  "each_run",
  "first_run",
] as const;
export type BenefitDeductionLaterSplitMode =
  (typeof BENEFIT_DEDUCTION_LATER_SPLIT_MODES)[number];

export const BENEFIT_DEDUCTION_LATER_SPLIT_LABELS: Record<
  BenefitDeductionLaterSplitMode,
  string
> = {
  each_run: "Whoever is on that month’s run",
  first_run: "The same people as the first month’s run",
};

export type BenefitDeductionEntry = {
  id: string;
  name: string;
  totalAmount: number;
  benefitKind: BenefitDeductionKind;
  target: BenefitDeductionTarget;
  monthCount: number;
  startMonth: string;
  laterSplitMode: BenefitDeductionLaterSplitMode;
  createdAt: string;
  cancelledAt: string | null;
};

export type BenefitDeductionStatus = "upcoming" | "ongoing" | "cleared" | "cancelled";

export const BENEFIT_DEDUCTION_STATUS_LABELS: Record<
  BenefitDeductionStatus,
  string
> = {
  upcoming: "Upcoming",
  ongoing: "Ongoing",
  cleared: "Cleared",
  cancelled: "Cancelled",
};

/** `${kind}|${YYYY-MM}|${staffId}` → payable benefit amount for that month. */
export type BenefitPayoutMap = Record<string, number>;

export type BenefitRunPerson = {
  staffId: string;
  empNo: string | null;
  fullName: string;
  departmentId: string | null;
  departmentName: string | null;
  amount: number;
};

/** `${kind}|${YYYY-MM}` → people allocated on that month’s run. */
export type BenefitRunRosterMap = Record<string, BenefitRunPerson[]>;

export type DeductionStaffDirectoryEntry = {
  id: string;
  departmentId: string | null;
  departmentName: string | null;
  empNo?: string | null;
  fullName?: string | null;
};

export function benefitPayoutKey(
  kind: BenefitKind | BenefitDeductionKind,
  monthKey: string,
  staffId: string,
): string {
  return `${kind}|${normalizeMonthKey(monthKey)}|${staffId}`;
}

export function lookupBenefitPayout(
  payouts: BenefitPayoutMap,
  kind: BenefitKind | BenefitDeductionKind,
  monthKey: string,
  staffId: string,
): number | null {
  const key = benefitPayoutKey(kind, monthKey, staffId);
  if (!Object.prototype.hasOwnProperty.call(payouts, key)) return null;
  const n = Number(payouts[key]);
  return Number.isFinite(n) ? Math.max(0, round2(n)) : 0;
}

export function mergeBenefitPayout(
  payouts: BenefitPayoutMap,
  kind: BenefitKind | BenefitDeductionKind,
  monthKey: string,
  staffId: string,
  amount: number,
): BenefitPayoutMap {
  return {
    ...payouts,
    [benefitPayoutKey(kind, monthKey, staffId)]: Math.max(0, round2(amount)),
  };
}

export function benefitRosterKey(
  kind: BenefitKind | BenefitDeductionKind,
  monthKey: string,
): string {
  return `${kind}|${normalizeMonthKey(monthKey)}`;
}

export function mergeBenefitRunPerson(
  rosters: BenefitRunRosterMap,
  kind: BenefitKind | BenefitDeductionKind,
  monthKey: string,
  person: BenefitRunPerson,
): BenefitRunRosterMap {
  const key = benefitRosterKey(kind, monthKey);
  const existing = rosters[key] ?? [];
  const index = existing.findIndex((row) => row.staffId === person.staffId);
  const next = [...existing];
  if (index >= 0) {
    const prev = existing[index];
    next[index] = {
      staffId: person.staffId,
      amount: person.amount,
      empNo: person.empNo ?? prev.empNo,
      fullName: person.fullName || prev.fullName,
      departmentId: person.departmentId ?? prev.departmentId,
      departmentName: person.departmentName ?? prev.departmentName,
    };
  } else {
    next.push(person);
  }
  return { ...rosters, [key]: next };
}

function normalizeDeptLabel(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function directoryById(
  directory: DeductionStaffDirectoryEntry[] | undefined,
): Map<string, DeductionStaffDirectoryEntry> {
  const map = new Map<string, DeductionStaffDirectoryEntry>();
  for (const row of directory ?? []) {
    if (row.id) map.set(row.id, row);
  }
  return map;
}

function personMatchesTarget(
  person: BenefitRunPerson,
  target: BenefitDeductionTarget,
  directory: Map<string, DeductionStaffDirectoryEntry>,
): boolean {
  if (person.amount <= 0.004) return false;
  if (target.type === "people") {
    return target.staff.some((row) => row.id === person.staffId);
  }
  const live = directory.get(person.staffId);
  if (person.departmentId && person.departmentId === target.departmentId) {
    return true;
  }
  if (live?.departmentId && live.departmentId === target.departmentId) {
    return true;
  }
  const want = normalizeDeptLabel(target.departmentName);
  if (!want) return false;
  return (
    normalizeDeptLabel(person.departmentName) === want ||
    normalizeDeptLabel(live?.departmentName) === want
  );
}

/**
 * People on a month’s run who match the deduction target.
 * `runExists` is false when that month has no run at all.
 */
export function listMatchingRunPeople(
  rosters: BenefitRunRosterMap,
  kind: BenefitKind | BenefitDeductionKind,
  monthKey: string,
  target: BenefitDeductionTarget,
  directory?: DeductionStaffDirectoryEntry[],
): { runExists: boolean; people: BenefitRunPerson[] } {
  const key = benefitRosterKey(kind, monthKey);
  if (!Object.prototype.hasOwnProperty.call(rosters, key)) {
    return { runExists: false, people: [] };
  }
  const dir = directoryById(directory);
  const people = (rosters[key] ?? []).filter((person) =>
    personMatchesTarget(person, target, dir),
  );
  return { runExists: true, people };
}

export function parseLaterSplitMode(
  raw: unknown,
): BenefitDeductionLaterSplitMode {
  return raw === "first_run" ? "first_run" : "each_run";
}

export function firstRunStaffIdsFromMatch(
  firstMonth: { runExists: boolean; people: BenefitRunPerson[] },
): Set<string> | null {
  if (!firstMonth.runExists) return null;
  return new Set(firstMonth.people.map((row) => row.staffId));
}

export function matchingDeductionPeopleForMonth(args: {
  rosters: BenefitRunRosterMap;
  kind: BenefitKind | BenefitDeductionKind;
  monthKey: string;
  target: BenefitDeductionTarget;
  directory?: DeductionStaffDirectoryEntry[];
  laterSplitMode: BenefitDeductionLaterSplitMode;
  firstRunIds: Set<string> | null;
  isFirstMonth: boolean;
}): { runExists: boolean; people: BenefitRunPerson[] } {
  const match = listMatchingRunPeople(
    args.rosters,
    args.kind,
    args.monthKey,
    args.target,
    args.directory,
  );
  if (args.isFirstMonth || args.laterSplitMode === "each_run") return match;
  if (!args.firstRunIds) {
    return { runExists: match.runExists, people: [] };
  }
  return {
    runExists: match.runExists,
    people: match.people.filter((person) => args.firstRunIds!.has(person.staffId)),
  };
}

export type EmployeeDeductionBalance = {
  staffId: string;
  fullName: string;
  empNo: string | null;
  planned: number;
  applied: number;
  pending: number;
};

/**
 * Per-employee planned / applied / pending for a month’s run roster.
 * Pending is this person’s share of the amount still to collect.
 */
export function employeeDeductionBalances(
  runPeople: Array<{
    staffId: string;
    fullName: string;
    empNo: string | null;
  }>,
  schedule: BenefitDeductionSchedule | null,
  monthShareTotal: number,
): EmployeeDeductionBalance[] {
  const remaining = schedule
    ? schedule.remaining
    : Math.max(0, monthShareTotal);
  const plannedShares = splitEvenly(Math.max(0, monthShareTotal), runPeople.length);
  const pendingShares = splitEvenly(Math.max(0, remaining), runPeople.length);
  return runPeople
    .map((person, index) => {
      const row = schedule?.staff.find((s) => s.staffId === person.staffId);
      return {
        staffId: person.staffId,
        fullName: person.fullName || row?.fullName || "Staff",
        empNo: person.empNo ?? row?.empNo ?? null,
        planned: plannedShares[index] ?? 0,
        applied: row?.applied ?? 0,
        pending: pendingShares[index] ?? 0,
      };
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

export type MonthDeductionBalances = {
  monthKey: string;
  runExists: boolean;
  installment: number;
  people: EmployeeDeductionBalance[];
};

/**
 * Split a deduction across its planned months (and any later months that
 * already received a rolled-forward cut). Each month is divided among the
 * people on that month’s matching benefit run.
 */
export function employeeDeductionBalancesByMonth(args: {
  startMonth: string;
  monthCount: number;
  totalAmount: number;
  kind: BenefitKind | BenefitDeductionKind;
  target: BenefitDeductionTarget;
  rosters: BenefitRunRosterMap;
  directory?: DeductionStaffDirectoryEntry[];
  laterSplitMode?: BenefitDeductionLaterSplitMode;
  schedule: BenefitDeductionSchedule | null;
}): MonthDeductionBalances[] {
  const start = normalizeMonthKey(args.startMonth);
  const monthCount = Math.max(1, Math.min(60, Math.round(args.monthCount) || 1));
  const monthlyParts = splitEvenly(Math.max(0, args.totalAmount), monthCount);
  const laterSplitMode = parseLaterSplitMode(args.laterSplitMode);
  const firstRunIds = firstRunStaffIdsFromMatch(
    listMatchingRunPeople(
      args.rosters,
      args.kind,
      start,
      args.target,
      args.directory,
    ),
  );
  const seen = new Set<string>();
  const blocks: MonthDeductionBalances[] = [];

  function blockForMonth(
    monthKey: string,
    installment: number,
    isFirstMonth: boolean,
  ): MonthDeductionBalances {
    const match = matchingDeductionPeopleForMonth({
      rosters: args.rosters,
      kind: args.kind,
      monthKey,
      target: args.target,
      directory: args.directory,
      laterSplitMode,
      firstRunIds,
      isFirstMonth,
    });
    const plannedShares = splitEvenly(Math.max(0, installment), match.people.length);
    const people = match.people
      .map((person, index) => {
        const row = args.schedule?.staff.find((s) => s.staffId === person.staffId);
        const planned = plannedShares[index] ?? 0;
        const applied = Number(row?.byMonth[monthKey]) || 0;
        return {
          staffId: person.staffId,
          fullName: person.fullName || row?.fullName || "Staff",
          empNo: person.empNo ?? row?.empNo ?? null,
          planned,
          applied,
          pending: round2(Math.max(0, planned - applied)),
        };
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
    return {
      monthKey,
      runExists: match.runExists,
      installment: round2(Math.max(0, installment)),
      people,
    };
  }

  for (let i = 0; i < monthCount; i += 1) {
    const monthKey = shiftMonthKey(start, i);
    seen.add(monthKey);
    blocks.push(blockForMonth(monthKey, monthlyParts[i] ?? 0, i === 0));
  }

  if (args.schedule) {
    const extra = [
      ...new Set(args.schedule.staff.flatMap((row) => Object.keys(row.byMonth))),
    ]
      .filter((monthKey) => !seen.has(normalizeMonthKey(monthKey)))
      .sort(compareMonthKeys);
    for (const monthKey of extra) {
      const appliedTotal = round2(
        args.schedule.staff.reduce(
          (sum, row) => sum + (Number(row.byMonth[monthKey]) || 0),
          0,
        ),
      );
      if (appliedTotal <= 0.004) continue;
      blocks.push(blockForMonth(monthKey, appliedTotal, false));
    }
  }

  return blocks;
}

export function normalizeMonthKey(value: string): string {
  const raw = String(value ?? "").trim();
  if (/^\d{4}-\d{2}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 7);
  return raw;
}

export function shiftMonthKey(monthKey: string, delta: number): string {
  const key = normalizeMonthKey(monthKey);
  const [year, month] = key.split("-").map(Number);
  if (!year || !month) return key;
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function currentMonthKey(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function defaultBenefitDeductionMonthKey(now = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function compareMonthKeys(a: string, b: string): number {
  return normalizeMonthKey(a).localeCompare(normalizeMonthKey(b));
}

export function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/** Split AED across N people so cents add back to the total. */
export function splitEvenly(total: number, count: number): number[] {
  if (count <= 0) return [];
  const cents = Math.round(Math.max(0, Number(total) || 0) * 100);
  const base = Math.floor(cents / count);
  const remainder = cents - base * count;
  return Array.from({ length: count }, (_, i) => (base + (i < remainder ? 1 : 0)) / 100);
}

export function deductionStaffOf(
  entry: BenefitDeductionEntry,
): BenefitDeductionStaffRef[] {
  return entry.target.staff;
}

export function newBenefitDeductionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `ded_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export type CreateBenefitDeductionInput = {
  name: string;
  totalAmount: number;
  benefitKind: BenefitDeductionKind;
  target: BenefitDeductionTarget;
  monthCount: number;
  startMonth: string;
  laterSplitMode: BenefitDeductionLaterSplitMode;
};

function isStaffRef(
  value: unknown,
): value is BenefitDeductionStaffRef {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" && typeof row.fullName === "string";
}

export function parseBenefitDeductionTarget(
  raw: unknown,
): BenefitDeductionTarget | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const staff = Array.isArray(row.staff) ? row.staff.filter(isStaffRef) : [];
  if (staff.length === 0) return null;
  if (row.type === "department") {
    if (
      typeof row.departmentId !== "string" ||
      typeof row.departmentName !== "string"
    ) {
      return null;
    }
    return {
      type: "department",
      departmentId: row.departmentId,
      departmentName: row.departmentName,
      staff,
    };
  }
  if (row.type === "people") {
    return { type: "people", staff };
  }
  return null;
}

export function mapBenefitDeductionRow(row: {
  id: string;
  name: string;
  total_amount: unknown;
  benefit_kind: string;
  target_type: string;
  department_id: string | null;
  department_name: string | null;
  staff_snapshot: unknown;
  month_count: unknown;
  start_month: string;
  later_split_mode?: unknown;
  created_at: string;
  cancelled_at: string | null;
}): BenefitDeductionEntry | null {
  const kind = row.benefit_kind;
  if (kind !== "gratuity" && kind !== "service_charge") return null;
  const staff = Array.isArray(row.staff_snapshot)
    ? row.staff_snapshot.filter(isStaffRef)
    : [];
  if (staff.length === 0) return null;
  const startMonth = normalizeMonthKey(String(row.start_month ?? ""));
  if (!/^\d{4}-\d{2}$/.test(startMonth)) return null;
  const target: BenefitDeductionTarget | null =
    row.target_type === "department"
      ? {
          type: "department",
          departmentId: String(row.department_id ?? ""),
          departmentName: String(row.department_name ?? "").trim() || "Department",
          staff,
        }
      : row.target_type === "people"
        ? { type: "people", staff }
        : null;
  if (!target) return null;
  if (target.type === "department" && !target.departmentId) return null;
  return {
    id: row.id,
    name: String(row.name ?? "").trim(),
    totalAmount: round2(Number(row.total_amount) || 0),
    benefitKind: kind,
    target,
    monthCount: Math.max(1, Math.round(Number(row.month_count) || 1)),
    startMonth,
    laterSplitMode: parseLaterSplitMode(row.later_split_mode),
    createdAt: row.created_at,
    cancelledAt: row.cancelled_at,
  };
}

export type StaffDeductionSchedule = {
  staffId: string;
  empNo: string | null;
  fullName: string;
  share: number;
  plannedMonthly: number;
  applied: number;
  remaining: number;
  byMonth: Record<string, number>;
};

export type BenefitDeductionSchedule = {
  entry: BenefitDeductionEntry;
  staff: StaffDeductionSchedule[];
  plannedMonthlyTotal: number;
  firstMonthPeopleCount: number | null;
  firstMonthPerPerson: number;
  firstMonthRunExists: boolean;
  applied: number;
  remaining: number;
  status: BenefitDeductionStatus;
};

const MAX_ROLLOVER_MONTHS = 60;

function snapshotName(
  entry: BenefitDeductionEntry,
  staffId: string,
): { empNo: string | null; fullName: string } | null {
  const row = deductionStaffOf(entry).find((person) => person.id === staffId);
  if (!row) return null;
  return { empNo: row.empNo, fullName: row.fullName };
}

/**
 * Walk month-by-month from the start month. Each of the first `monthCount`
 * months tries to take an equal installment. Later months either re-split
 * among whoever is on that month’s run, or stay with the first month’s
 * employees, depending on `laterSplitMode`. Shortfalls carry forward until
 * the total is cleared.
 */
export function scheduleBenefitDeduction(
  entry: BenefitDeductionEntry,
  payouts: BenefitPayoutMap,
  rosters: BenefitRunRosterMap = {},
  directory?: DeductionStaffDirectoryEntry[],
): BenefitDeductionSchedule {
  const cancelled = Boolean(entry.cancelledAt);
  const start = normalizeMonthKey(entry.startMonth);
  const monthCount = Math.max(1, Math.min(60, Math.round(entry.monthCount) || 1));
  const nowMonth = currentMonthKey();
  const monthlyParts = splitEvenly(entry.totalAmount, monthCount);
  const firstMatch = listMatchingRunPeople(
    rosters,
    entry.benefitKind,
    start,
    entry.target,
    directory,
  );
  const laterSplitMode = parseLaterSplitMode(entry.laterSplitMode);
  const firstRunIds = firstRunStaffIdsFromMatch(firstMatch);
  const firstMonthShares = splitEvenly(
    monthlyParts[0] ?? 0,
    firstMatch.people.length,
  );

  const staffMap = new Map<string, StaffDeductionSchedule>();

  function ensureStaff(person: {
    staffId: string;
    empNo: string | null;
    fullName: string;
  }): StaffDeductionSchedule {
    const existing = staffMap.get(person.staffId);
    if (existing) return existing;
    const snap = snapshotName(entry, person.staffId);
    const row: StaffDeductionSchedule = {
      staffId: person.staffId,
      empNo: person.empNo ?? snap?.empNo ?? null,
      fullName: person.fullName || snap?.fullName || "Staff",
      share: 0,
      plannedMonthly: 0,
      applied: 0,
      remaining: 0,
      byMonth: {},
    };
    staffMap.set(person.staffId, row);
    return row;
  }

  firstMatch.people.forEach((person, index) => {
    const row = ensureStaff(person);
    row.plannedMonthly = firstMonthShares[index] ?? 0;
    row.share = 0;
  });

  if (cancelled) {
    return {
      entry,
      staff: [...staffMap.values()],
      plannedMonthlyTotal: monthlyParts[0] ?? 0,
      firstMonthPeopleCount: firstMatch.runExists ? firstMatch.people.length : null,
      firstMonthPerPerson: firstMonthShares[0] ?? 0,
      firstMonthRunExists: firstMatch.runExists,
      applied: 0,
      remaining: 0,
      status: "cancelled",
    };
  }

  let remaining = round2(entry.totalAmount);
  let unpaidCarry = 0;

  for (let i = 0; i < MAX_ROLLOVER_MONTHS && remaining > 0.004; i += 1) {
    const month = shiftMonthKey(start, i);
    const installment = i < monthCount ? (monthlyParts[i] ?? 0) : 0;
    const due =
      i < monthCount
        ? round2(Math.min(remaining, installment + unpaidCarry))
        : remaining;

    const match = matchingDeductionPeopleForMonth({
      rosters,
      kind: entry.benefitKind,
      monthKey: month,
      target: entry.target,
      directory,
      laterSplitMode,
      firstRunIds,
      isFirstMonth: i === 0,
    });
    if (!match.runExists || match.people.length === 0) {
      unpaidCarry = due;
      continue;
    }

    const shares = splitEvenly(due, match.people.length);
    let taken = 0;
    match.people.forEach((person, index) => {
      const want = shares[index] ?? 0;
      const payout =
        lookupBenefitPayout(payouts, entry.benefitKind, month, person.staffId) ??
        person.amount;
      const appliedThisMonth = round2(
        Math.min(want, Math.max(0, payout), round2(remaining - taken)),
      );
      if (appliedThisMonth <= 0) return;
      const row = ensureStaff(person);
      row.byMonth[month] = round2((row.byMonth[month] ?? 0) + appliedThisMonth);
      row.applied = round2(row.applied + appliedThisMonth);
      row.share = row.applied;
      taken = round2(taken + appliedThisMonth);
    });

    remaining = round2(Math.max(0, remaining - taken));
    unpaidCarry = round2(Math.max(0, due - taken));
  }

  const applied = round2(Math.max(0, entry.totalAmount - remaining));
  const staffSchedules = [...staffMap.values()].sort((a, b) =>
    a.fullName.localeCompare(b.fullName),
  );

  let status: BenefitDeductionStatus = "ongoing";
  if (remaining <= 0.004) status = "cleared";
  else if (compareMonthKeys(start, nowMonth) > 0 && applied <= 0.004) {
    status = "upcoming";
  }

  return {
    entry,
    staff: staffSchedules,
    plannedMonthlyTotal: monthlyParts[0] ?? 0,
    firstMonthPeopleCount: firstMatch.runExists ? firstMatch.people.length : null,
    firstMonthPerPerson: firstMonthShares[0] ?? 0,
    firstMonthRunExists: firstMatch.runExists,
    applied,
    remaining: round2(Math.max(0, remaining)),
    status,
  };
}

export function appliedDeductionForMonth(
  schedule: BenefitDeductionSchedule,
  staffId: string,
  monthKey: string,
): number {
  const row = schedule.staff.find((s) => s.staffId === staffId);
  if (!row) return 0;
  return Number(row.byMonth[normalizeMonthKey(monthKey)]) || 0;
}

/**
 * Sum of all active deductions of `kind` applied to `staffId` in `monthKey`.
 */
export function appliedDeductionsByStaffForMonth(
  entries: BenefitDeductionEntry[],
  payouts: BenefitPayoutMap,
  kind: BenefitKind | BenefitDeductionKind,
  monthKey: string,
  rosters: BenefitRunRosterMap = {},
  directory?: DeductionStaffDirectoryEntry[],
): Map<string, number> {
  const month = normalizeMonthKey(monthKey);
  const totals = new Map<string, number>();
  for (const entry of entries) {
    if (entry.cancelledAt) continue;
    if (entry.benefitKind !== kind) continue;
    const schedule = scheduleBenefitDeduction(entry, payouts, rosters, directory);
    for (const row of schedule.staff) {
      const amount = Number(row.byMonth[month]) || 0;
      if (amount <= 0) continue;
      totals.set(row.staffId, round2((totals.get(row.staffId) ?? 0) + amount));
    }
  }
  return totals;
}

/** Split a month’s deduction across retain (contributors) then pool share. */
export function allocateCutToRetainAndPool(
  applied: number,
  retain: number,
  poolShare: number,
): { retainCut: number; poolCut: number } {
  const retainCut = round2(Math.min(Math.max(0, applied), Math.max(0, retain)));
  const poolCut = round2(
    Math.min(Math.max(0, applied - retainCut), Math.max(0, poolShare)),
  );
  return { retainCut, poolCut };
}

/**
 * AED actually taken from this run’s payouts (retain then pool share).
 * Excluded / withheld people are skipped — they are not paid this run.
 */
export function collectedBenefitDeductionCuts(args: {
  appliedByStaff: Map<string, number>;
  allocations: Array<{
    staffId: string;
    amount: number;
    poolShare: number;
    retain: number;
    excluded: boolean;
  }>;
  contributors: Array<{
    staffId: string | null | undefined;
    retain: number;
    withheld: boolean;
  }>;
}): number {
  const contributorIds = new Set<string>();
  for (const row of args.contributors) {
    if (row.staffId) contributorIds.add(row.staffId);
  }
  const byStaff = new Map(
    args.allocations.map((row) => [row.staffId, row] as const),
  );

  let total = 0;
  for (const row of args.allocations) {
    if (row.excluded) continue;
    const applied = args.appliedByStaff.get(row.staffId) ?? 0;
    if (applied <= 0) continue;
    if (!contributorIds.has(row.staffId)) {
      total = round2(total + Math.min(applied, Math.max(0, row.amount)));
      continue;
    }
    const { poolCut } = allocateCutToRetainAndPool(
      applied,
      row.retain,
      row.poolShare,
    );
    total = round2(total + poolCut);
  }
  for (const row of args.contributors) {
    if (!row.staffId || row.withheld) continue;
    const applied = args.appliedByStaff.get(row.staffId) ?? 0;
    if (applied <= 0) continue;
    const alloc = byStaff.get(row.staffId);
    const { retainCut } = allocateCutToRetainAndPool(
      applied,
      row.retain,
      alloc?.poolShare ?? 0,
    );
    total = round2(total + retainCut);
  }
  return total;
}

type PaidPayoutRow = {
  staffId: string;
  amount: number;
  poolShare: number;
  retain: number;
  excluded: boolean;
};

type PaidContributorRow = {
  staffId: string | null | undefined;
  retain: number;
  withheld: boolean;
};

export function allocationPayoutFields(meta: unknown): {
  poolShare: number;
  retain: number;
  excluded: boolean;
} {
  const m =
    meta && typeof meta === "object" ? (meta as Record<string, unknown>) : {};
  const poolShare = Number(m.poolShare);
  const retain = Number(m.retain);
  return {
    poolShare: Number.isFinite(poolShare) ? Math.max(0, poolShare) : 0,
    retain: Number.isFinite(retain) ? Math.max(0, retain) : 0,
    excluded: m.excluded === true,
  };
}

export function contributorsFromRunTotals(totals: unknown): PaidContributorRow[] {
  if (!totals || typeof totals !== "object") return [];
  const contributors = (totals as Record<string, unknown>).contributors;
  if (!Array.isArray(contributors)) return [];
  return contributors.map((entry) => {
    const row = (entry ?? {}) as {
      staffId?: unknown;
      retain?: unknown;
      withheld?: unknown;
    };
    return {
      staffId:
        typeof row.staffId === "string" && row.staffId ? row.staffId : null,
      retain: Math.max(0, Number(row.retain) || 0),
      withheld: Boolean(row.withheld),
    };
  });
}

/**
 * Exact net paid to one person after benefit deductions — same split as the
 * run page (retain first for tip collectors, then pool share).
 */
export function netBenefitPayout(args: {
  amount: number;
  poolShare: number;
  retain: number;
  excluded: boolean;
  applied: number;
  isContributor: boolean;
  withheld: boolean;
}): number {
  if (args.excluded) return 0;
  const applied = Math.max(0, Number(args.applied) || 0);
  const amount = Math.max(0, Number(args.amount) || 0);
  const retain = Math.max(0, Number(args.retain) || 0);
  const poolShare = Math.max(0, Number(args.poolShare) || 0);

  if (args.isContributor && poolShare <= 0) {
    if (args.withheld) return 0;
    const { retainCut } = allocateCutToRetainAndPool(applied, retain, 0);
    return round2(Math.max(0, retain - retainCut));
  }
  if (args.isContributor) {
    const { poolCut } = allocateCutToRetainAndPool(applied, retain, poolShare);
    return round2(Math.max(0, amount - poolCut));
  }
  return round2(Math.max(0, amount - Math.min(applied, amount)));
}

/**
 * Exact nets paid this run after benefit deductions, keyed by staff.
 * Floor waiters with no pool share are taken from Contributors (retain), not
 * the allocation row. Withheld retain is omitted — it is not paid.
 */
export function paidPayoutNetsByStaff(args: {
  appliedByStaff: Map<string, number>;
  allocations: PaidPayoutRow[];
  contributors: PaidContributorRow[];
}): Map<string, number> {
  const nets = new Map<string, number>();
  const contributorByStaff = new Map<string, PaidContributorRow>();
  for (const row of args.contributors) {
    if (row.staffId) contributorByStaff.set(row.staffId, row);
  }
  const counted = new Set<string>();

  for (const row of args.allocations) {
    if (row.excluded) continue;
    const contributor = contributorByStaff.get(row.staffId);
    if (contributor && row.poolShare <= 0) continue;
    nets.set(
      row.staffId,
      netBenefitPayout({
        amount: row.amount,
        poolShare: row.poolShare,
        retain: row.retain,
        excluded: false,
        applied: args.appliedByStaff.get(row.staffId) ?? 0,
        isContributor: Boolean(contributor),
        withheld: Boolean(contributor?.withheld),
      }),
    );
    counted.add(row.staffId);
  }

  for (const row of args.contributors) {
    if (!row.staffId || row.withheld) continue;
    const retain = Number(row.retain) || 0;
    if (retain <= 0) continue;
    if (counted.has(row.staffId)) continue;
    nets.set(
      row.staffId,
      netBenefitPayout({
        amount: retain,
        poolShare: 0,
        retain,
        excluded: false,
        applied: args.appliedByStaff.get(row.staffId) ?? 0,
        isContributor: true,
        withheld: false,
      }),
    );
  }

  return nets;
}

/**
 * Exact nets paid this run after benefit deductions, one amount per person.
 * Floor waiters with no pool share are taken from Contributors (retain), not
 * the allocation row. Withheld retain is omitted — it is not paid.
 */
export function paidPayoutNets(args: {
  appliedByStaff: Map<string, number>;
  allocations: PaidPayoutRow[];
  contributors: PaidContributorRow[];
}): number[] {
  return [...paidPayoutNetsByStaff(args).values()];
}

/** Actually paid after deductions and the AED 5 floor — same as Total distributed. */
export function sumPaidDistributedAfterFloor(args: {
  appliedByStaff: Map<string, number>;
  allocations: PaidPayoutRow[];
  contributors: PaidContributorRow[];
}): number {
  return round2(
    paidPayoutNets(args).reduce((sum, amount) => sum + floorPayoutToAed5(amount), 0),
  );
}

/** People who received a non-zero payout after deductions and the AED 5 floor. */
export function countPaidRecipientsAfterFloor(args: {
  appliedByStaff: Map<string, number>;
  allocations: PaidPayoutRow[];
  contributors: PaidContributorRow[];
}): number {
  return paidPayoutNets(args).filter((amount) => floorPayoutToAed5(amount) > 0)
    .length;
}

export function formatBenefitDeductionTarget(
  target: BenefitDeductionTarget,
): string {
  if (target.type === "department") {
    return target.departmentName;
  }
  if (target.staff.length === 1) {
    return target.staff[0]?.fullName ?? "1 person";
  }
  return `${target.staff.length} people`;
}
