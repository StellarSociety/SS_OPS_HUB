import {
  findLeaveType,
  normalizeScheduleLeaveCode,
} from "@/lib/hr/leave";
import type { HrLeavePaidStatus, HrLeavePolicySettings } from "@/lib/hr/types";

export type PayFractionResult = {
  payFraction: number;
  unpaidFraction: number;
  isLeave: boolean;
  paidStatus: HrLeavePaidStatus | "worked" | "off" | "unknown";
};

/**
 * Map a roster label + leave policy to a pay fraction for one calendar day.
 *
 * - SHIFT / OFF → fully payable employment day (365 daily-rate model)
 * - Leave codes → follow leave policy paidStatus
 * - ABS / unknown unpaid → 0
 */
export function payFractionForLabel(
  labelCode: string | null | undefined,
  policy: HrLeavePolicySettings,
): PayFractionResult {
  const raw = (labelCode ?? "").trim().toUpperCase();
  if (!raw) {
    return {
      payFraction: 0,
      unpaidFraction: 1,
      isLeave: false,
      paidStatus: "unknown",
    };
  }

  if (raw === "SHIFT") {
    return {
      payFraction: 1,
      unpaidFraction: 0,
      isLeave: false,
      paidStatus: "worked",
    };
  }

  if (raw === "OFF") {
    return {
      payFraction: 1,
      unpaidFraction: 0,
      isLeave: false,
      paidStatus: "off",
    };
  }

  const normalized = normalizeScheduleLeaveCode(raw) ?? raw;

  // Direct policy lookup (AL, UPL, ABS, PH-REPL, SL-FP, …)
  let type = findLeaveType(policy, normalized);
  if (!type && normalized === "SL") {
    type = findLeaveType(policy, "SL-FP");
  }
  if (!type && normalized === "ML") {
    type = findLeaveType(policy, "ML-FP");
  }
  if (!type && (normalized === "PH" || raw === "PH")) {
    type = findLeaveType(policy, "PH-REPL") ?? findLeaveType(policy, "PH");
  }

  if (!type) {
    // Unknown roster code — treat as unpaid until HR maps it
    return {
      payFraction: 0,
      unpaidFraction: 1,
      isLeave: true,
      paidStatus: "unknown",
    };
  }

  switch (type.paidStatus) {
    case "paid":
    case "paid_plus_compensation":
    case "variable":
      return {
        payFraction: 1,
        unpaidFraction: 0,
        isLeave: true,
        paidStatus: type.paidStatus,
      };
    case "half_pay":
      return {
        payFraction: 0.5,
        unpaidFraction: 0.5,
        isLeave: true,
        paidStatus: "half_pay",
      };
    case "unpaid":
    default:
      return {
        payFraction: 0,
        unpaidFraction: 1,
        isLeave: true,
        paidStatus: "unpaid",
      };
  }
}
