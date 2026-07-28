import type {
  BenefitRunTotals,
  DisciplinaryWarningLevel,
  HrServiceChargeSettings,
} from "./types";
import {
  matchDepartmentShareKey,
} from "./match";
import { resolveBenefitPointsForStaff } from "./points";
import { resolvePoolDeductions } from "./pool-collections";
import { countBenefitsWorkedDays } from "./worked-days";

export type ServiceChargeStaffInput = {
  id: string;
  full_name: string;
  department_name: string | null;
  position_id: string | null;
  position_name: string | null;
  termination_date: string | null;
  warning_level?: DisciplinaryWarningLevel | null;
  tip_points?: number | null;
  employment_ended_as?: "resignation" | "termination" | null;
};

export type ServiceChargeScheduleDayInput = {
  staff_id: string;
  work_date: string;
  label_code: string | null;
};

export type ServiceChargeAllocationResult = {
  staff_id: string;
  benefit_type: "service_charge";
  points: number | null;
  worked_days: number | null;
  amount: number;
  meta: Record<string, unknown>;
};

export type ServiceChargeCalcResult = {
  totals: BenefitRunTotals;
  allocations: ServiceChargeAllocationResult[];
  warnings: string[];
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function disciplinaryPercent(
  level: DisciplinaryWarningLevel | null | undefined,
  settings: HrServiceChargeSettings,
): number {
  if (!level) return 0;
  const row = settings.disciplinaryDeductions.find((d) => d.level === level);
  return row ? Math.max(0, Number(row.percent) || 0) : 0;
}

function disciplinaryMultiplier(
  level: DisciplinaryWarningLevel | null | undefined,
  settings: HrServiceChargeSettings,
): number {
  const pct = disciplinaryPercent(level, settings);
  if (pct <= 0) return 1;
  return Math.max(0, 1 - pct / 100);
}

function entitled(
  staff: ServiceChargeStaffInput,
  settings: HrServiceChargeSettings,
): boolean {
  if (staff.employment_ended_as === "termination") {
    return settings.terminationEntitled;
  }
  if (staff.employment_ended_as === "resignation" || staff.termination_date) {
    return settings.resignationEntitled;
  }
  return true;
}

function pointsForStaff(
  staff: ServiceChargeStaffInput,
  settings: HrServiceChargeSettings,
): number {
  if (staff.tip_points != null && Number.isFinite(staff.tip_points)) {
    return Number(staff.tip_points);
  }
  return resolveBenefitPointsForStaff(staff, settings.pointTiers);
}

/**
 * Distribute venue service-charge collections by department / points / worked days.
 */
export function calculateServiceChargeRun(input: {
  settings: HrServiceChargeSettings;
  serviceChargeCollected: number;
  staff: ServiceChargeStaffInput[];
  scheduleDays: ServiceChargeScheduleDayInput[];
  /** Recorded OS&E / activities collections for the benefit month (overrides policy %). */
  poolCollections?: {
    oseAmount: number;
    staffActivitiesAmount: number;
  } | null;
  /** When true, pay one global AED-per-point rate across departments. */
  equalizeDepartmentPointValue?: boolean;
}): ServiceChargeCalcResult {
  const { settings, staff, scheduleDays } = input;
  const equalizeDepartmentPointValue = Boolean(
    input.equalizeDepartmentPointValue,
  );
  const warnings: string[] = [];
  const collected = Math.max(0, Number(input.serviceChargeCollected) || 0);

  const deductions = resolvePoolDeductions({
    poolGross: collected,
    osePercent: settings.poolOseDeductPercent,
    activitiesPercent: settings.poolStaffActivitiesDeductPercent,
    recorded: input.poolCollections ?? null,
  });
  const ose = deductions.ose;
  const activities = deductions.activities;
  const poolNet = round2(collected - ose - activities);

  const byDepartment: Record<string, number> = {};
  for (const share of settings.departmentShares) {
    byDepartment[share.key] = 0;
  }

  const scheduleByStaff = new Map<string, string[]>();
  for (const day of scheduleDays) {
    const list = scheduleByStaff.get(day.staff_id) ?? [];
    list.push(day.label_code ?? "");
    scheduleByStaff.set(day.staff_id, list);
  }

  type WeightRow = {
    staff: ServiceChargeStaffInput;
    deptKey: string;
    points: number;
    workedDays: number;
    weight: number;
    discPct: number;
    discMult: number;
  };

  const weights: WeightRow[] = [];
  for (const s of staff) {
    if (!entitled(s, settings)) continue;
    const deptKey = matchDepartmentShareKey(
      s.department_name,
      settings.departmentShares,
    );
    if (!deptKey || byDepartment[deptKey] == null) continue;
    const labels = scheduleByStaff.get(s.id) ?? [];
    const workedDays = countBenefitsWorkedDays(labels, settings);
    if (workedDays <= 0) continue;
    const points = pointsForStaff(s, settings);
    const discMult = disciplinaryMultiplier(s.warning_level, settings);
    const discPct = disciplinaryPercent(s.warning_level, settings);
    const weight = Math.max(0, points * workedDays * discMult);
    weights.push({
      staff: s,
      deptKey,
      points,
      workedDays,
      weight,
      discPct,
      discMult,
    });
  }

  const byDept = new Map<string, WeightRow[]>();
  for (const row of weights) {
    const list = byDept.get(row.deptKey) ?? [];
    list.push(row);
    byDept.set(row.deptKey, list);
  }

  const totalPoolWeight = weights.reduce((s, r) => s + r.weight, 0);
  const allocations: ServiceChargeAllocationResult[] = [];

  function pushAllocation(
    row: WeightRow,
    deptKey: string,
    amount: number,
  ) {
    allocations.push({
      staff_id: row.staff.id,
      benefit_type: "service_charge",
      points: row.points,
      worked_days: row.workedDays,
      amount,
      meta: {
        departmentKey: deptKey,
        departmentLabel:
          settings.departmentShares.find((d) => d.key === deptKey)?.label ??
          row.staff.department_name,
        poolNet,
        collected,
        obtain: 0,
        poolShare: amount,
        warningLevel: row.staff.warning_level ?? null,
        disciplinaryPercent: row.discPct,
        disciplinaryMultiplier: row.discMult,
        pointsOverridden: row.staff.tip_points != null,
      },
    });
  }

  if (equalizeDepartmentPointValue) {
    for (const share of settings.departmentShares) {
      const rows = byDept.get(share.key) ?? [];
      const deptWeight = rows.reduce((s, r) => s + r.weight, 0);
      byDepartment[share.key] =
        totalPoolWeight > 0
          ? round2((poolNet * deptWeight) / totalPoolWeight)
          : 0;
    }
    for (const row of weights) {
      const amount =
        row.weight <= 0 || totalPoolWeight <= 0
          ? 0
          : round2((poolNet * row.weight) / totalPoolWeight);
      pushAllocation(row, row.deptKey, amount);
    }
  } else {
    const departmentShareWeight = settings.departmentShares.reduce(
      (s, d) => s + Math.max(0, Number(d.percent) || 0),
      0,
    );
    for (const share of settings.departmentShares) {
      const pct = Math.max(0, Number(share.percent) || 0);
      byDepartment[share.key] =
        departmentShareWeight > 0
          ? round2((poolNet * pct) / departmentShareWeight)
          : 0;
    }

    for (const [deptKey, deptAmount] of Object.entries(byDepartment)) {
      const rows = byDept.get(deptKey) ?? [];
      const totalWeight = rows.reduce((s, r) => s + r.weight, 0);
      if (totalWeight <= 0) {
        for (const row of rows) {
          pushAllocation(row, deptKey, 0);
        }
        if (deptAmount > 0 && rows.length === 0) {
          warnings.push(
            `Department "${deptKey}" has ${deptAmount.toFixed(2)} AED but no eligible staff.`,
          );
        } else if (deptAmount > 0) {
          warnings.push(
            `Department "${deptKey}" has ${deptAmount.toFixed(2)} AED but all staff weights are zero (e.g. full disciplinary deduction).`,
          );
        }
        continue;
      }
      for (const row of rows) {
        const amount =
          row.weight <= 0
            ? 0
            : round2((deptAmount * row.weight) / totalWeight);
        pushAllocation(row, deptKey, amount);
      }
    }
  }

  allocations.sort((a, b) => b.amount - a.amount);
  const totalDistributed = round2(
    allocations.reduce((s, a) => s + a.amount, 0),
  );

  return {
    totals: {
      recipientCount: allocations.length,
      poolGross: collected,
      poolNet,
      totalDistributed,
      serviceChargeCollected: collected,
    },
    allocations,
    warnings,
  };
}
