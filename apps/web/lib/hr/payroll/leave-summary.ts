import {
  leaveTypeDisplayName,
  normalizeScheduleLeaveCode,
  scheduleLeaveDisplayName,
} from "@/lib/hr/leave";
import {
  DEFAULT_HR_LEAVE_TYPES,
  type HrLeavePaidStatus,
} from "@/lib/hr/types";
import type { PayrollDayFraction } from "./types";

export type PayrollLeaveBucket = "paid" | "half_pay" | "unpaid";

export type PayrollLeaveKindSummary = {
  code: string;
  name: string;
  days: number;
  bucket: PayrollLeaveBucket;
  explanation: string;
};

export type PayrollLeaveSummary = {
  paidDays: number;
  halfPayDays: number;
  unpaidDays: number;
  kinds: PayrollLeaveKindSummary[];
};

const PAID_STATUS_EXPLANATION: Record<string, string> = {
  paid: "Fully paid - salary continues for these days",
  paid_plus_compensation:
    "Paid plus compensation - salary continues (extra day owed)",
  variable: "Variable pay treatment per leave policy",
  half_pay: "Half pay - 50% of daily rate for these days",
  unpaid: "Unpaid - no salary for these days",
  unknown: "Treated as unpaid until the roster code is mapped",
};

function resolvePaidStatus(
  day: PayrollDayFraction,
): HrLeavePaidStatus | "unknown" {
  if (day.paidStatus) {
    if (
      day.paidStatus === "worked" ||
      day.paidStatus === "off" ||
      day.paidStatus === "unknown"
    ) {
      return "unknown";
    }
    return day.paidStatus;
  }
  // Legacy snapshots without paidStatus — infer from fractions
  if (day.payFraction >= 0.99 && day.unpaidFraction <= 0.01) return "paid";
  if (day.payFraction > 0.4 && day.payFraction < 0.6) return "half_pay";
  if (day.unpaidFraction >= 0.99) return "unpaid";
  if (day.payFraction > 0) return "paid";
  return "unpaid";
}

function bucketForStatus(status: HrLeavePaidStatus | "unknown"): PayrollLeaveBucket {
  if (status === "half_pay") return "half_pay";
  if (status === "unpaid" || status === "unknown") return "unpaid";
  return "paid";
}

function leaveKindName(code: string): string {
  const normalized = normalizeScheduleLeaveCode(code);
  const type =
    DEFAULT_HR_LEAVE_TYPES.find((t) => t.code === code) ??
    DEFAULT_HR_LEAVE_TYPES.find((t) => t.code === normalized);
  if (type) return leaveTypeDisplayName(type.code, type);
  return scheduleLeaveDisplayName(code);
}

/**
 * Summarise approved leave days in a payroll period from day-fraction snapshot.
 * Groups by roster leave code and buckets into paid / half-pay / unpaid.
 */
export function summarizePayrollLeave(
  dayFractions: PayrollDayFraction[] | null | undefined,
): PayrollLeaveSummary {
  const byKey = new Map<
    string,
    { code: string; bucket: PayrollLeaveBucket; status: string; days: number }
  >();

  let paidDays = 0;
  let halfPayDays = 0;
  let unpaidDays = 0;

  for (const day of dayFractions ?? []) {
    if (!day.isLeave || !day.approved) continue;
    const status = resolvePaidStatus(day);
    const bucket = bucketForStatus(status);
    const code = (day.labelCode || "—").trim().toUpperCase() || "—";
    const key = `${bucket}:${code}`;
    const existing = byKey.get(key);
    if (existing) existing.days += 1;
    else byKey.set(key, { code, bucket, status, days: 1 });

    if (bucket === "paid") paidDays += 1;
    else if (bucket === "half_pay") halfPayDays += 1;
    else unpaidDays += 1;
  }

  const kinds = [...byKey.values()]
    .map((row) => ({
      code: row.code,
      name: leaveKindName(row.code),
      days: row.days,
      bucket: row.bucket,
      explanation:
        PAID_STATUS_EXPLANATION[row.status] ??
        PAID_STATUS_EXPLANATION.unknown,
    }))
    .sort((a, b) => {
      const bucketOrder = { paid: 0, half_pay: 1, unpaid: 2 } as const;
      const bd = bucketOrder[a.bucket] - bucketOrder[b.bucket];
      if (bd !== 0) return bd;
      return b.days - a.days || a.code.localeCompare(b.code);
    });

  return { paidDays, halfPayDays, unpaidDays, kinds };
}
