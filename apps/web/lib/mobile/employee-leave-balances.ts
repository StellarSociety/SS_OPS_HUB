import {
  availableBalance,
  currentLeaveYear,
  roundDays,
  type AnnualLeaveCalculationBreakdown,
} from "@/lib/hr/leave";
import type { HrLeaveBalance } from "@/lib/hr/types";

export type MobileLeaveBalanceStage = {
  code: string;
  label: string;
  available: number;
  used: number;
  total: number;
  entitled: number;
};

export type MobileLeaveBalanceCard = {
  code: string;
  label: string;
  available: number;
  used: number;
  total: number;
  entitled: number;
  scheduled: number;
  pending: number;
  stages?: MobileLeaveBalanceStage[];
  annualLeaveCalculation?: AnnualLeaveCalculationBreakdown;
};

export type MobileLeaveBalances = {
  year: number;
  primary: MobileLeaveBalanceCard[];
  other: MobileLeaveBalanceCard[];
};

type LeaveTypeName = {
  code: string;
  name: string;
  schedule_code?: string | null;
};

type BalanceGroup = {
  code: string;
  codes: readonly string[];
  fallbackLabel: string;
};

const PRIMARY_GROUPS: BalanceGroup[] = [
  { code: "AL", codes: ["AL"], fallbackLabel: "Annual Leave" },
  { code: "PH-REPL", codes: ["PH-REPL"], fallbackLabel: "Public Holiday" },
  { code: "SL", codes: ["SL-FP", "SL-HP", "SL-UP"], fallbackLabel: "Sick Leave" },
  { code: "UPL", codes: ["UPL"], fallbackLabel: "Unpaid Leave" },
];

const OTHER_GROUPS: BalanceGroup[] = [
  { code: "PL", codes: ["PL"], fallbackLabel: "Parental Leave" },
  {
    code: "ML",
    codes: ["ML-FP", "ML-HP", "ML-UP"],
    fallbackLabel: "Maternity Leave",
  },
  { code: "HL", codes: ["HL"], fallbackLabel: "Hajj Leave" },
  { code: "BL", codes: ["BL"], fallbackLabel: "Bereavement Leave" },
  { code: "STL", codes: ["STL"], fallbackLabel: "Study Leave" },
];

export function emptyMobileLeaveBalances(
  year: number = currentLeaveYear(),
): MobileLeaveBalances {
  return { year, primary: [], other: [] };
}

export function normalizeMobileBalanceRow(
  row: Record<string, unknown>,
): HrLeaveBalance {
  return {
    id: String(row.id ?? ""),
    venue_id: String(row.venue_id ?? ""),
    staff_id: String(row.staff_id ?? ""),
    leave_year: toDays(row.leave_year),
    leave_type_code: String(row.leave_type_code ?? ""),
    entitled: toDays(row.entitled),
    accrued: toDays(row.accrued),
    used: toDays(row.used),
    scheduled: toDays(row.scheduled),
    pending: toDays(row.pending),
    carried_forward: toDays(row.carried_forward),
    expired: toDays(row.expired),
    adjusted: toDays(row.adjusted),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

export function buildMobileLeaveBalances(input: {
  year?: number;
  balances: HrLeaveBalance[];
  types?: LeaveTypeName[];
  annualLeaveCalculation?: AnnualLeaveCalculationBreakdown | null;
}): MobileLeaveBalances {
  const byCode = new Map(
    input.balances.map((row) => [row.leave_type_code, row] as const),
  );
  const primary = PRIMARY_GROUPS.map((group) =>
    cardFromGroup(group, byCode, input.types, input.annualLeaveCalculation),
  );
  const other = OTHER_GROUPS.map((group) =>
    cardFromGroup(group, byCode, input.types),
  ).filter((card) => hasVisibleBalance(card));

  return {
    year: input.year ?? currentLeaveYear(),
    primary,
    other,
  };
}

function cardFromGroup(
  group: BalanceGroup,
  byCode: Map<string, HrLeaveBalance>,
  types?: LeaveTypeName[],
  annualLeaveCalculation?: AnnualLeaveCalculationBreakdown | null,
): MobileLeaveBalanceCard {
  const rows = group.codes.map((code) => ({
    code,
    label: stageLabelFor(code),
    ...metricsFor(byCode.get(code), code),
  }));
  const available = rows.reduce((sum, row) => sum + row.available, 0);
  const used = rows.reduce((sum, row) => sum + row.used, 0);
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  const entitled = rows.reduce((sum, row) => sum + row.entitled, 0);
  const scheduled = rows.reduce((sum, row) => sum + row.scheduled, 0);
  const pending = rows.reduce((sum, row) => sum + row.pending, 0);
  return {
    code: group.code,
    label: labelFor(group, types),
    available,
    used,
    total,
    entitled,
    scheduled,
    pending,
    stages:
      group.codes.length > 1
        ? rows.map((row) => ({
            code: row.code,
            label: row.label,
            available: row.available,
            used: row.used,
            total: row.total,
            entitled: row.entitled,
          }))
        : undefined,
    annualLeaveCalculation:
      group.code === "AL" && annualLeaveCalculation
        ? annualLeaveCalculation
        : undefined,
  };
}

function metricsFor(
  bal: HrLeaveBalance | undefined,
  code: string,
): {
  available: number;
  used: number;
  total: number;
  entitled: number;
  scheduled: number;
  pending: number;
} {
  const available = bal ? availableBalance(bal) : 0;
  const used = bal?.used ?? 0;
  const entitled = bal?.entitled ?? 0;
  const scheduled = bal?.scheduled ?? 0;
  const pending = bal?.pending ?? 0;
  const pool =
    (bal?.accrued ?? 0) + (bal?.carried_forward ?? 0) + (bal?.adjusted ?? 0);
  const total = pool > 0 ? pool : Math.max(entitled, available + used);
  if (code === "AL") {
    return {
      available: roundDays(available),
      used: roundDays(used),
      total: roundDays(total),
      entitled: roundDays(entitled),
      scheduled: roundDays(scheduled),
      pending: roundDays(pending),
    };
  }
  return { available, used, total, entitled, scheduled, pending };
}

const STAGE_LABELS: Record<string, string> = {
  "SL-FP": "Full pay",
  "SL-HP": "Half pay",
  "SL-UP": "Unpaid",
  "ML-FP": "Full pay",
  "ML-HP": "Half pay",
  "ML-UP": "Unpaid extra",
};

function stageLabelFor(code: string): string {
  return STAGE_LABELS[code] ?? code;
}

function labelFor(group: BalanceGroup, types?: LeaveTypeName[]): string {
  if (group.code === "PH-REPL") return "Public Holiday";
  if (group.codes.length > 1) return group.fallbackLabel;
  const match = types?.find(
    (type) =>
      type.code === group.code ||
      (type.schedule_code || "").toUpperCase() === group.code,
  );
  return match?.name ?? group.fallbackLabel;
}

function hasVisibleBalance(card: MobileLeaveBalanceCard): boolean {
  return (
    card.entitled !== 0 ||
    card.total !== 0 ||
    card.used !== 0 ||
    card.scheduled !== 0 ||
    card.pending !== 0 ||
    card.available !== 0
  );
}

function toDays(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}
