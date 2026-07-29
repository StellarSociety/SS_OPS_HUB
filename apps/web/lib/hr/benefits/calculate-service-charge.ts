import type {
  BenefitRunTotals,
  DisciplinaryWarningLevel,
  HrServiceChargeSettings,
} from "./types";
import { resolveBenefitPointsForStaff } from "./points";
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
 * Distribute venue service-charge collections:
 * 1. Split collected into the staff pool % vs the venue expenses reserve
 * 2. Pay every eligible staff member by points × worked days × (1 − disciplinary %)
 *
 * The whole staff pool is paid out — departments and tip-pool deductions
 * play no part in service charge.
 */
export function calculateServiceChargeRun(input: {
  settings: HrServiceChargeSettings;
  serviceChargeCollected: number;
  staff: ServiceChargeStaffInput[];
  scheduleDays: ServiceChargeScheduleDayInput[];
}): ServiceChargeCalcResult {
  const { settings, staff, scheduleDays } = input;
  const warnings: string[] = [];
  const collected = Math.max(0, Number(input.serviceChargeCollected) || 0);
  const staffPct = Math.min(
    100,
    Math.max(0, Number(settings.staffDistributablePercent) || 0),
  );
  const staffPoolGross = round2((collected * staffPct) / 100);
  const expensesReserve = round2(collected - staffPoolGross);
  const poolNet = staffPoolGross;

  const scheduleByStaff = new Map<string, string[]>();
  for (const day of scheduleDays) {
    const list = scheduleByStaff.get(day.staff_id) ?? [];
    list.push(day.label_code ?? "");
    scheduleByStaff.set(day.staff_id, list);
  }

  type WeightRow = {
    staff: ServiceChargeStaffInput;
    points: number;
    workedDays: number;
    weight: number;
    discPct: number;
    discMult: number;
  };

  const weights: WeightRow[] = [];
  for (const s of staff) {
    if (!entitled(s, settings)) continue;
    const labels = scheduleByStaff.get(s.id) ?? [];
    const workedDays = countBenefitsWorkedDays(labels, settings);
    if (workedDays <= 0) continue;
    const points = pointsForStaff(s, settings);
    const discMult = disciplinaryMultiplier(s.warning_level, settings);
    const discPct = disciplinaryPercent(s.warning_level, settings);
    const weight = Math.max(0, points * workedDays * discMult);
    weights.push({ staff: s, points, workedDays, weight, discPct, discMult });
  }

  const totalPoolWeight = weights.reduce((s, r) => s + r.weight, 0);
  const pointValue = totalPoolWeight > 0 ? poolNet / totalPoolWeight : 0;

  const amounts = weights.map((row) =>
    row.weight <= 0 ? 0 : round2(row.weight * pointValue),
  );

  // Give per-person rounding remainders to the largest share so the payouts
  // add up to the staff pool to the cent.
  if (totalPoolWeight > 0) {
    const residual = round2(poolNet - amounts.reduce((s, a) => s + a, 0));
    if (residual !== 0) {
      let topIndex = 0;
      for (let i = 1; i < weights.length; i += 1) {
        if (weights[i].weight > weights[topIndex].weight) topIndex = i;
      }
      amounts[topIndex] = round2(amounts[topIndex] + residual);
    }
  }

  const allocations: ServiceChargeAllocationResult[] = weights.map(
    (row, index) => ({
      staff_id: row.staff.id,
      benefit_type: "service_charge",
      points: row.points,
      worked_days: row.workedDays,
      amount: amounts[index],
      meta: {
        departmentLabel: row.staff.department_name,
        poolNet,
        collected,
        staffPoolGross,
        expensesReserve,
        staffDistributablePercent: staffPct,
        pointValue: round2(pointValue),
        weight: round2(row.weight),
        obtain: 0,
        poolShare: amounts[index],
        warningLevel: row.staff.warning_level ?? null,
        disciplinaryPercent: row.discPct,
        disciplinaryMultiplier: row.discMult,
        pointsOverridden: row.staff.tip_points != null,
      },
    }),
  );

  if (poolNet > 0 && totalPoolWeight <= 0) {
    warnings.push(
      `Staff pool has ${poolNet.toFixed(2)} AED but no eligible staff with worked days for this period.`,
    );
  }

  allocations.sort((a, b) => b.amount - a.amount);
  const totalDistributed = round2(
    allocations.reduce((s, a) => s + a.amount, 0),
  );

  return {
    totals: {
      recipientCount: allocations.length,
      poolGross: staffPoolGross,
      poolNet,
      totalDistributed,
      serviceChargeCollected: collected,
      serviceChargeStaffPool: staffPoolGross,
      serviceChargeExpensesReserve: expensesReserve,
      serviceChargeStaffDistributablePercent: staffPct,
    },
    allocations,
    warnings,
  };
}
