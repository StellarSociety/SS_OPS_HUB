import type {
  BenefitContributor,
  BenefitRunTotals,
  DisciplinaryWarningLevel,
  HrGratuitySettings,
} from "./types";
import {
  isBarRole,
  matchDepartmentShareKey,
} from "./match";
import { resolveBenefitPointsForStaff } from "./points";
import { resolvePoolDeductions } from "./pool-collections";
import { sumAed5RoundingRemainder } from "./rounding";
import { countBenefitsWorkedDays } from "./worked-days";

export type GratuityStaffInput = {
  id: string;
  emp_no: string | null;
  full_name: string;
  department_id: string | null;
  department_name: string | null;
  position_id: string | null;
  position_name: string | null;
  joining_date: string | null;
  termination_date: string | null;
  /** Active warning for the period; null = none. */
  warning_level?: DisciplinaryWarningLevel | null;
  /** Explicit tip points override; null = infer from position. */
  tip_points?: number | null;
  /** When true, staff is a floor waiter (excluded from general pool redistribution). */
  is_floor_waiter?: boolean;
  employment_ended_as?: "resignation" | "termination" | null;
};

export type GratuityWaiterSalesInput = {
  waiter_id: string;
  staff_id: string | null;
  waiter_name: string;
  position: string;
  cash_gs: number;
  cc_gs: number;
  total_sales_gs: number;
  total_covers: number;
};

export type GratuityScheduleDayInput = {
  staff_id: string;
  work_date: string;
  label_code: string | null;
};

export type GratuityAllocationResult = {
  staff_id: string;
  benefit_type: "tips";
  points: number | null;
  worked_days: number | null;
  amount: number;
  meta: Record<string, unknown>;
};

export type GratuityCalcResult = {
  totals: BenefitRunTotals;
  allocations: GratuityAllocationResult[];
  warnings: string[];
  contributors: BenefitContributor[];
  pool: {
    waiterCashTipOut: number;
    waiterCcTipOut: number;
    barCcToPool: number;
    /** Bar CC share distributed internally among bar staff (SOP 6.2). */
    barCcToBarStaff: number;
    /** Bar cash tips split equally among bar staff (SOP 6.1). */
    barCashToBarStaff: number;
    /** Retain withheld from contributors via disciplinary % → pool. */
    disciplinaryFromContributors: number;
    runnerHousekeeperFund: number;
    gross: number;
    ose: number;
    activities: number;
    /** Remainders left over after flooring each individual payout to AED 5. */
    roundingCollected: number;
    net: number;
    byDepartment: Record<string, number>;
  };
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function asph(sales: number, covers: number): number | null {
  if (!covers || covers <= 0) return null;
  return round2(sales / covers);
}

function disciplinaryPercent(
  level: DisciplinaryWarningLevel | null | undefined,
  settings: HrGratuitySettings,
): number {
  if (!level) return 0;
  const row = settings.disciplinaryDeductions.find((d) => d.level === level);
  return row ? Math.max(0, Number(row.percent) || 0) : 0;
}

function disciplinaryMultiplier(
  level: DisciplinaryWarningLevel | null | undefined,
  settings: HrGratuitySettings,
): number {
  const pct = disciplinaryPercent(level, settings);
  if (pct <= 0) return 1;
  return Math.max(0, 1 - pct / 100);
}

function entitled(
  staff: GratuityStaffInput,
  settings: HrGratuitySettings,
): boolean {
  if (staff.employment_ended_as === "termination") {
    return settings.terminationEntitled;
  }
  if (staff.employment_ended_as === "resignation") {
    return settings.resignationEntitled;
  }
  if (staff.termination_date) {
    // Without explicit classification, treat termination_date as resignation-style
    // entitlement for the worked period (SOP resignation) unless flagged.
    return settings.resignationEntitled;
  }
  return true;
}

function pointsForStaff(
  staff: GratuityStaffInput,
  settings: HrGratuitySettings,
): number {
  if (staff.tip_points != null && Number.isFinite(staff.tip_points)) {
    return Number(staff.tip_points);
  }
  return resolveBenefitPointsForStaff(staff, settings.pointTiers);
}

/**
 * Calculate monthly gratuity / tips settlement from waiter collections + pool rules.
 *
 * Current operational path: waiterCcTipOutMode = collection_percent (30% of CC tips).
 * ASPH KPI path remains available when settings switch to asph_kpi.
 */
export function calculateGratuityRun(input: {
  settings: HrGratuitySettings;
  periodStart: string;
  periodEnd: string;
  staff: GratuityStaffInput[];
  waiterSales: GratuityWaiterSalesInput[];
  scheduleDays: GratuityScheduleDayInput[];
  /** Optional ASPH KPI threshold; when null and asph_kpi mode, treat KPI as missed if enabled. */
  asphKpiThreshold?: number | null;
  /** Recorded OS&E / activities collections for the benefit month (overrides policy %). */
  poolCollections?: {
    oseAmount: number;
    staffActivitiesAmount: number;
  } | null;
  /**
   * When true, ignore fixed department % pots and pay one global AED-per-point
   * rate across all departments (Redistribution mode).
   */
  equalizeDepartmentPointValue?: boolean;
}): GratuityCalcResult {
  const { settings, staff, waiterSales, scheduleDays } = input;
  const equalizeDepartmentPointValue = Boolean(
    input.equalizeDepartmentPointValue,
  );
  const warnings: string[] = [];
  const staffById = new Map(staff.map((s) => [s.id, s]));

  const scheduleByStaff = new Map<string, string[]>();
  for (const day of scheduleDays) {
    const list = scheduleByStaff.get(day.staff_id) ?? [];
    list.push(day.label_code ?? "");
    scheduleByStaff.set(day.staff_id, list);
  }

  let waiterCashCollected = 0;
  let waiterCcCollected = 0;
  let barCashCollected = 0;
  let barCcCollected = 0;
  let waiterCashTipOut = 0;
  let waiterCcTipOut = 0;
  let barCcToPool = 0;
  let barCcBarStaffFund = 0;
  let runnerHousekeeperFund = 0;

  const allocations: GratuityAllocationResult[] = [];
  const retainedByStaff = new Map<string, number>();

  function addRetained(staffId: string, amount: number, meta: Record<string, unknown>) {
    if (!staffId || amount <= 0) return;
    retainedByStaff.set(staffId, (retainedByStaff.get(staffId) ?? 0) + amount);
    // stash meta fragments on a side channel via allocations later
    void meta;
  }

  const waiterMetaByStaff = new Map<string, Record<string, unknown>>();
  const contributorAcc = new Map<
    string,
    {
      staffId: string | null;
      empNo: string | null;
      name: string;
      position: string | null;
      departmentName: string | null;
      cashCollected: number;
      ccCollected: number;
      contributedToPool: number;
    }
  >();

  function addContributor(args: {
    key: string;
    staffId: string | null;
    name: string;
    position: string;
    cash: number;
    cc: number;
    toPool: number;
  }) {
    if (args.cash <= 0 && args.cc <= 0 && args.toPool <= 0) return;
    const staff = args.staffId ? staffById.get(args.staffId) : null;
    const prev = contributorAcc.get(args.key);
    if (prev) {
      prev.cashCollected = round2(prev.cashCollected + args.cash);
      prev.ccCollected = round2(prev.ccCollected + args.cc);
      prev.contributedToPool = round2(prev.contributedToPool + args.toPool);
      return;
    }
    contributorAcc.set(args.key, {
      staffId: args.staffId,
      empNo: staff?.emp_no ?? null,
      name: staff?.full_name || args.name,
      position: staff?.position_name || args.position || null,
      departmentName: staff?.department_name ?? null,
      cashCollected: round2(args.cash),
      ccCollected: round2(args.cc),
      contributedToPool: round2(args.toPool),
    });
  }

  for (const row of waiterSales) {
    const cash = Number(row.cash_gs) || 0;
    const cc = Number(row.cc_gs) || 0;
    const sales = Number(row.total_sales_gs) || 0;
    const covers = Number(row.total_covers) || 0;
    const bar = isBarRole(row.position);

    if (bar) {
      // SOP 6: bar collections are never retained by the collector. CC splits
      // between the general pool and a bar-staff fund; cash is split equally
      // among bar staff. Both funds are distributed further below.
      barCashCollected += cash;
      barCcCollected += cc;
      const poolShare = round2((cc * settings.barCcPoolPercent) / 100);
      const barShare = round2((cc * settings.barCcBarStaffPercent) / 100);
      barCcToPool += poolShare;
      barCcBarStaffFund = round2(barCcBarStaffFund + barShare);
      if (row.staff_id) {
        const prev = waiterMetaByStaff.get(row.staff_id) ?? {};
        waiterMetaByStaff.set(row.staff_id, {
          ...prev,
          bar: true,
          cashCollected: (Number(prev.cashCollected) || 0) + cash,
          ccCollected: (Number(prev.ccCollected) || 0) + cc,
          barCcPool: (Number(prev.barCcPool) || 0) + poolShare,
          barCcToBarStaff: (Number(prev.barCcToBarStaff) || 0) + barShare,
          barCashCollected: (Number(prev.barCashCollected) || 0) + cash,
        });
      }
      addContributor({
        key: row.staff_id || `waiter:${row.waiter_id}`,
        staffId: row.staff_id,
        name: row.waiter_name,
        position: row.position,
        cash,
        cc,
        toPool: round2(poolShare + barShare + cash),
      });
      continue;
    }

    // Floor waiters
    waiterCashCollected += cash;
    waiterCcCollected += cc;

    const cashAfterTipOut = round2(
      (cash * settings.waiterCashRetainPercent) / 100,
    );
    const cashPool = round2((cash * settings.waiterCashPoolPercent) / 100);
    waiterCashTipOut += cashPool;

    let tipOut = 0;
    let ccTipOutPercent = 0;
    let asphKpiMet: boolean | null = null;
    const waiterAsph = asph(sales, covers);
    if (settings.waiterCcTipOutMode === "asph_kpi") {
      const rate = (() => {
        if (!settings.asphKpiEnabled) {
          asphKpiMet = null;
          return settings.waiterCcTipOutPctWhenKpiMissed;
        }
        const threshold = input.asphKpiThreshold;
        if (waiterAsph == null || threshold == null) {
          asphKpiMet = null;
          return settings.waiterCcTipOutPctWhenKpiMissed;
        }
        asphKpiMet = waiterAsph >= threshold;
        return asphKpiMet
          ? settings.waiterCcTipOutPctWhenKpiMet
          : settings.waiterCcTipOutPctWhenKpiMissed;
      })();
      ccTipOutPercent = rate;
      tipOut = round2((sales * rate) / 100);
      // Tip-out cannot exceed CC collection for the period
      tipOut = Math.min(tipOut, cc);
    } else {
      ccTipOutPercent = settings.waiterCcCollectionTipOutPercent;
      tipOut = round2((cc * settings.waiterCcCollectionTipOutPercent) / 100);
    }

    waiterCcTipOut += tipOut;
    const ccAfterTipOut = Math.max(0, round2(cc - tipOut));
    // Runner / HK fund: % of cash and CC balances remaining after tip-out.
    const runnerPct = settings.runnerHousekeeperDeductPercent;
    const runnerCutCash = round2((cashAfterTipOut * runnerPct) / 100);
    const runnerCutCc = round2((ccAfterTipOut * runnerPct) / 100);
    const runnerCut = round2(runnerCutCash + runnerCutCc);
    runnerHousekeeperFund += runnerCut;
    const cashRetain = round2(cashAfterTipOut - runnerCutCash);
    const waiterCcRetain = round2(ccAfterTipOut - runnerCutCc);

    if (row.staff_id) {
      addRetained(row.staff_id, cashRetain + waiterCcRetain, {
        source: "waiter_retain",
      });
      waiterMetaByStaff.set(row.staff_id, {
        waiter: true,
        cashCollected: cash,
        ccCollected: cc,
        cashRetain,
        cashAfterTipOut,
        cashPool,
        ccTipOut: tipOut,
        ccTipOutPercent,
        asphKpiMet,
        asphKpiThreshold: input.asphKpiThreshold ?? null,
        runnerCut,
        runnerCutCash,
        runnerCutCc,
        ccRetain: waiterCcRetain,
        sales,
        covers,
        asph: waiterAsph,
        tipOutMode: settings.waiterCcTipOutMode,
      });
    } else if (cash > 0 || cc > 0) {
      warnings.push(
        `Waiter "${row.waiter_name}" has tips but is not linked to staff — retain share skipped.`,
      );
    }
    addContributor({
      key: row.staff_id || `waiter:${row.waiter_id}`,
      staffId: row.staff_id,
      name: row.waiter_name,
      position: row.position,
      cash,
      cc,
      toPool: round2(cashPool + tipOut),
    });
  }

  // Apply contributor disciplinary deductions to retain → general tips pool.
  // Only tip collectors (Contributors) are cut this way; the withheld amount is
  // added to the net pool for department distribution (after OS&E / activities).
  let disciplinaryFromContributors = 0;
  for (const contrib of contributorAcc.values()) {
    const staffId = contrib.staffId;
    if (!staffId) continue;
    const s = staffById.get(staffId);
    if (!s) continue;
    const grossRetain = retainedByStaff.get(staffId) ?? 0;
    if (grossRetain <= 0) continue;
    const discPct = disciplinaryPercent(s.warning_level, settings);
    if (discPct <= 0) continue;
    const cut = round2((grossRetain * discPct) / 100);
    if (cut <= 0) continue;
    const netRetain = Math.max(0, round2(grossRetain - cut));
    retainedByStaff.set(staffId, netRetain);
    disciplinaryFromContributors = round2(disciplinaryFromContributors + cut);
    contrib.contributedToPool = round2(contrib.contributedToPool + cut);
    const prev = waiterMetaByStaff.get(staffId) ?? {};
    waiterMetaByStaff.set(staffId, {
      ...prev,
      retainBeforeDisciplinary: grossRetain,
      disciplinaryRetainCut: cut,
    });
  }

  const tipPoolGross = round2(waiterCashTipOut + waiterCcTipOut + barCcToPool);
  const poolDeductions = resolvePoolDeductions({
    poolGross: tipPoolGross,
    osePercent: settings.poolOseDeductPercent,
    activitiesPercent: settings.poolStaffActivitiesDeductPercent,
    recorded: input.poolCollections ?? null,
  });

  // Also deduct OS&E / staff-activities % from each contributor's retain
  // (after disciplinary), and add those cuts to the deduction totals.
  let retainOse = 0;
  let retainActivities = 0;
  const osePct = Math.max(0, Number(settings.poolOseDeductPercent) || 0);
  const activitiesPct = Math.max(
    0,
    Number(settings.poolStaffActivitiesDeductPercent) || 0,
  );
  for (const contrib of contributorAcc.values()) {
    const staffId = contrib.staffId;
    if (!staffId) continue;
    const retain = retainedByStaff.get(staffId) ?? 0;
    if (retain <= 0) continue;
    const oseCut = round2((retain * osePct) / 100);
    const activitiesCut = round2((retain * activitiesPct) / 100);
    const cut = round2(oseCut + activitiesCut);
    if (cut <= 0) continue;
    retainedByStaff.set(staffId, Math.max(0, round2(retain - cut)));
    retainOse = round2(retainOse + oseCut);
    retainActivities = round2(retainActivities + activitiesCut);
    const prev = waiterMetaByStaff.get(staffId) ?? {};
    waiterMetaByStaff.set(staffId, {
      ...prev,
      oseRetainCut: oseCut,
      activitiesRetainCut: activitiesCut,
      retainBeforePoolDeductions: retain,
    });
  }

  const ose = round2(poolDeductions.ose + retainOse);
  const activities = round2(poolDeductions.activities + retainActivities);
  // Disciplinary cuts from contributors join the distributable pool in full.
  // Only the pool-side OS&E / activities leave the tip pool (retain-side cuts
  // come from contributor retain, not from poolGross).
  const poolGross = round2(tipPoolGross + disciplinaryFromContributors);
  const generalNet = round2(
    tipPoolGross -
      poolDeductions.ose -
      poolDeductions.activities +
      disciplinaryFromContributors,
  );
  const poolNet = generalNet;

  const byDepartment: Record<string, number> = {};
  for (const share of settings.departmentShares) {
    byDepartment[share.key] = 0;
  }

  // Eligible pool recipients: non-floor-waiter staff with entitlement + worked days
  type WeightRow = {
    staff: GratuityStaffInput;
    deptKey: string;
    points: number;
    workedDays: number;
    weight: number;
    discMult: number;
  };

  const weights: WeightRow[] = [];
  for (const s of staff) {
    if (!entitled(s, settings)) continue;
    if (s.is_floor_waiter) continue;

    const deptKey =
      matchDepartmentShareKey(s.department_name, settings.departmentShares) ??
      null;
    if (!deptKey || byDepartment[deptKey] == null) continue;

    const labels = scheduleByStaff.get(s.id) ?? [];
    const workedDays = countBenefitsWorkedDays(labels, settings);
    if (workedDays <= 0) continue;

    const points = pointsForStaff(s, settings);
    const discMult = disciplinaryMultiplier(s.warning_level, settings);
    const weight = Math.max(0, points * workedDays * discMult);
    // Keep zero-weight rows (e.g. 100% disciplinary) so staff stay on the run.
    weights.push({ staff: s, deptKey, points, workedDays, weight, discMult });
  }

  const weightsByDept = new Map<string, WeightRow[]>();
  for (const row of weights) {
    const list = weightsByDept.get(row.deptKey) ?? [];
    list.push(row);
    weightsByDept.set(row.deptKey, list);
  }

  const poolPayByStaff = new Map<string, number>();
  const totalPoolWeight = weights.reduce((s, r) => s + r.weight, 0);

  function addPoolPay(staffId: string, amount: number) {
    if (amount <= 0) {
      if (!poolPayByStaff.has(staffId)) poolPayByStaff.set(staffId, 0);
      return;
    }
    poolPayByStaff.set(
      staffId,
      round2((poolPayByStaff.get(staffId) ?? 0) + amount),
    );
  }

  function distributeAmountToRows(amount: number, rows: WeightRow[]) {
    const totalWeight = rows.reduce((s, r) => s + r.weight, 0);
    if (totalWeight <= 0 || amount <= 0) {
      for (const row of rows) {
        if (!poolPayByStaff.has(row.staff.id)) {
          poolPayByStaff.set(row.staff.id, 0);
        }
      }
      return;
    }
    for (const row of rows) {
      if (row.weight <= 0) {
        if (!poolPayByStaff.has(row.staff.id)) {
          poolPayByStaff.set(row.staff.id, 0);
        }
        continue;
      }
      addPoolPay(row.staff.id, round2((amount * row.weight) / totalWeight));
    }
  }

  if (equalizeDepartmentPointValue) {
    // One global point rate across departments for the general (non-bar) pool.
    if (totalPoolWeight > 0 && generalNet > 0) {
      for (const row of weights) {
        if (row.weight <= 0) {
          if (!poolPayByStaff.has(row.staff.id)) {
            poolPayByStaff.set(row.staff.id, 0);
          }
          continue;
        }
        poolPayByStaff.set(
          row.staff.id,
          round2((generalNet * row.weight) / totalPoolWeight),
        );
      }
    } else {
      for (const row of weights) {
        if (!poolPayByStaff.has(row.staff.id)) {
          poolPayByStaff.set(row.staff.id, 0);
        }
      }
    }
    for (const share of settings.departmentShares) {
      const rows = weightsByDept.get(share.key) ?? [];
      const deptWeight = rows.reduce((s, r) => s + r.weight, 0);
      byDepartment[share.key] =
        totalPoolWeight > 0
          ? round2((generalNet * deptWeight) / totalPoolWeight)
          : 0;
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
          ? round2((generalNet * pct) / departmentShareWeight)
          : 0;
    }

    for (const [deptKey, deptAmount] of Object.entries(byDepartment)) {
      const rows = weightsByDept.get(deptKey) ?? [];
      const totalWeight = rows.reduce((s, r) => s + r.weight, 0);
      if (totalWeight <= 0 || deptAmount <= 0) {
        for (const row of rows) {
          if (!poolPayByStaff.has(row.staff.id)) {
            poolPayByStaff.set(row.staff.id, 0);
          }
        }
        if (deptAmount > 0 && rows.length === 0) {
          warnings.push(
            `Department "${deptKey}" has ${deptAmount.toFixed(2)} AED but no eligible staff weights.`,
          );
        } else if (deptAmount > 0 && totalWeight <= 0) {
          warnings.push(
            `Department "${deptKey}" has ${deptAmount.toFixed(2)} AED but all staff weights are zero (e.g. full disciplinary deduction).`,
          );
        }
        continue;
      }
      distributeAmountToRows(deptAmount, rows);
    }
  }

  // Bar funds (SOP 6) — paid to bar staff regardless of department mode.
  // 6.1 cash: equal split. 6.2 CC bar share: points × worked days × disciplinary.
  const barStaff = staff.filter((s) => {
    if (!entitled(s, settings)) return false;
    if (!isBarRole(s.position_name, s.department_name)) return false;
    const labels = scheduleByStaff.get(s.id) ?? [];
    return countBenefitsWorkedDays(labels, settings) > 0;
  });
  let barCashToBarStaff = 0;

  if (barCashCollected > 0 || barCcBarStaffFund > 0) {
    if (barStaff.length === 0) {
      warnings.push(
        `Bar tips of ${round2(barCashCollected + barCcBarStaffFund).toFixed(2)} AED could not be distributed — no bar staff with worked days for this period.`,
      );
    } else {
      const barRows: WeightRow[] = barStaff.map((s) => {
        const labels = scheduleByStaff.get(s.id) ?? [];
        const workedDays = countBenefitsWorkedDays(labels, settings);
        const points = pointsForStaff(s, settings);
        const discMult = disciplinaryMultiplier(s.warning_level, settings);
        return {
          staff: s,
          deptKey:
            matchDepartmentShareKey(
              s.department_name,
              settings.departmentShares,
            ) ?? "",
          points,
          workedDays,
          weight: Math.max(0, points * workedDays * discMult),
          discMult,
        };
      });
      const barWeight = barRows.reduce((sum, r) => sum + r.weight, 0);

      if (barCashCollected > 0) {
        if (settings.barCashEqualSplit) {
          const each = round2(barCashCollected / barStaff.length);
          for (const s of barStaff) {
            addPoolPay(s.id, each);
            const prev = waiterMetaByStaff.get(s.id) ?? {};
            waiterMetaByStaff.set(s.id, { ...prev, barCashShare: each });
          }
          barCashToBarStaff = round2(each * barStaff.length);
        } else if (barWeight > 0) {
          distributeAmountToRows(barCashCollected, barRows);
          for (const r of barRows) {
            const prev = waiterMetaByStaff.get(r.staff.id) ?? {};
            waiterMetaByStaff.set(r.staff.id, {
              ...prev,
              barCashShare: round2((barCashCollected * r.weight) / barWeight),
            });
          }
          barCashToBarStaff = round2(barCashCollected);
        } else {
          warnings.push(
            `Bar cash tips of ${barCashCollected.toFixed(2)} AED could not be distributed — all bar staff weights are zero.`,
          );
        }
      }

      if (barCcBarStaffFund > 0) {
        if (barWeight <= 0) {
          warnings.push(
            `Bar CC staff share of ${barCcBarStaffFund.toFixed(2)} AED could not be distributed — all bar staff weights are zero.`,
          );
        } else {
          distributeAmountToRows(barCcBarStaffFund, barRows);
          for (const r of barRows) {
            const prev = waiterMetaByStaff.get(r.staff.id) ?? {};
            waiterMetaByStaff.set(r.staff.id, {
              ...prev,
              barCcFundShare: round2(
                (barCcBarStaffFund * r.weight) / barWeight,
              ),
            });
          }
        }
      }
    }
  }

  // Runner / housekeeper fund — distribute to staff matched as runner/HK by position
  const runnerStaff = staff.filter((s) => {
    if (!entitled(s, settings)) return false;
    const hay = `${s.position_name ?? ""} ${s.department_name ?? ""}`.toLowerCase();
    return /\brunner\b|\bhousekeep|\bhouseman\b|\bpublic area\b/.test(hay);
  });
  if (runnerHousekeeperFund > 0 && runnerStaff.length > 0) {
    const runnerWeights = runnerStaff.map((s) => {
      const labels = scheduleByStaff.get(s.id) ?? [];
      const workedDays = countBenefitsWorkedDays(labels, settings);
      const points = pointsForStaff(s, settings);
      const discMult = disciplinaryMultiplier(s.warning_level, settings);
      return {
        staff: s,
        workedDays,
        points,
        weight: Math.max(workedDays, 0) * points * discMult,
      };
    });
    const tw = runnerWeights.reduce((s, r) => s + r.weight, 0);
    if (tw > 0) {
      for (const row of runnerWeights) {
        if (row.weight <= 0) {
          if (!poolPayByStaff.has(row.staff.id)) {
            poolPayByStaff.set(row.staff.id, 0);
          }
          continue;
        }
        const amount = round2((runnerHousekeeperFund * row.weight) / tw);
        poolPayByStaff.set(
          row.staff.id,
          (poolPayByStaff.get(row.staff.id) ?? 0) + amount,
        );
      }
    } else {
      warnings.push(
        "Runner/housekeeper fund could not be allocated (no worked-day weights).",
      );
    }
  } else if (runnerHousekeeperFund > 0) {
    warnings.push(
      `Runner/housekeeper fund ${runnerHousekeeperFund.toFixed(2)} AED has no matching staff positions.`,
    );
  }

  // Build final allocations (one tips row per staff with amount > 0)
  const allStaffIds = new Set([
    ...retainedByStaff.keys(),
    ...poolPayByStaff.keys(),
  ]);

  for (const staffId of allStaffIds) {
    const s = staffById.get(staffId);
    if (!s) continue;
    if (!entitled(s, settings)) continue;

    const retain = retainedByStaff.get(staffId) ?? 0;
    const poolPay = poolPayByStaff.get(staffId) ?? 0;
    const amount = round2(retain + poolPay);

    const labels = scheduleByStaff.get(staffId) ?? [];
    const workedDays = countBenefitsWorkedDays(labels, settings);
    const points = pointsForStaff(s, settings);
    const weightRow = weights.find((w) => w.staff.id === staffId);
    const waiterMeta = waiterMetaByStaff.get(staffId) ?? null;
    const discMult = disciplinaryMultiplier(s.warning_level, settings);
    const discPct = disciplinaryPercent(s.warning_level, settings);

    // Keep zero-amount rows when disciplinary withheld the share (or they are
    // otherwise on the pool roster) so the person stays editable on the run.
    if (amount <= 0 && discPct <= 0 && !weightRow && retain <= 0) continue;
    const obtain = round2(
      (Number(waiterMeta?.cashCollected) || 0) +
        (Number(waiterMeta?.ccCollected) || 0),
    );
    const deptKey =
      weightRow?.deptKey ??
      matchDepartmentShareKey(s.department_name, settings.departmentShares);

    allocations.push({
      staff_id: staffId,
      benefit_type: "tips",
      points,
      worked_days: workedDays,
      amount,
      meta: {
        /** Total tip collections (cash + CC) attributed to this staff. */
        obtain,
        retain: round2(retain),
        retainBeforeDisciplinary:
          Number(waiterMeta?.retainBeforeDisciplinary) || round2(retain),
        disciplinaryRetainCut:
          Number(waiterMeta?.disciplinaryRetainCut) || 0,
        poolShare: round2(poolPay),
        departmentKey: deptKey,
        departmentLabel:
          settings.departmentShares.find((d) => d.key === deptKey)?.label ??
          s.department_name,
        warningLevel: s.warning_level ?? null,
        disciplinaryPercent: discPct,
        disciplinaryMultiplier: discMult,
        pointsOverridden: s.tip_points != null,
        waiter: waiterMeta,
      },
    });
  }

  allocations.sort((a, b) => b.amount - a.amount);

  const totalDistributed = round2(
    allocations.reduce((s, a) => s + a.amount, 0),
  );

  const contributors: BenefitContributor[] = [...contributorAcc.values()]
    .map((row) => ({
      staffId: row.staffId,
      empNo: row.empNo,
      name: row.name,
      position: row.position,
      departmentName: row.departmentName,
      cashCollected: row.cashCollected,
      ccCollected: row.ccCollected,
      contributedToPool: row.contributedToPool,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  // Contributors are paid their retained tips; everyone else is paid a pool share.
  // Both are floored to AED 5 on payout, so both leave a remainder behind.
  const contributorStaffIds = new Set(
    contributors
      .map((c) => c.staffId)
      .filter((id): id is string => Boolean(id)),
  );
  // amount = retain + pool share, so it is the payable figure for both
  // retain-only contributors and staff paid from the pool / bar funds.
  const payoutAmounts: number[] = allocations.map(
    (allocation) => allocation.amount,
  );
  const allocatedStaffIds = new Set(allocations.map((a) => a.staff_id));
  for (const staffId of contributorStaffIds) {
    if (allocatedStaffIds.has(staffId)) continue;
    payoutAmounts.push(retainedByStaff.get(staffId) ?? 0);
  }
  const roundingCollected = sumAed5RoundingRemainder(payoutAmounts);

  const totals: BenefitRunTotals = {
    recipientCount: allocations.length,
    poolGross,
    poolNet,
    totalDistributed,
    waiterCashCollected: round2(waiterCashCollected),
    waiterCcCollected: round2(waiterCcCollected),
    barCashCollected: round2(barCashCollected),
    barCcCollected: round2(barCcCollected),
  };

  return {
    totals,
    allocations,
    warnings,
    contributors,
    pool: {
      waiterCashTipOut: round2(waiterCashTipOut),
      waiterCcTipOut: round2(waiterCcTipOut),
      barCcToPool: round2(barCcToPool),
      barCcToBarStaff: round2(barCcBarStaffFund),
      barCashToBarStaff: round2(barCashToBarStaff),
      disciplinaryFromContributors: round2(disciplinaryFromContributors),
      runnerHousekeeperFund: round2(runnerHousekeeperFund),
      gross: poolGross,
      ose,
      activities,
      roundingCollected,
      net: poolNet,
      byDepartment,
    },
  };
}
