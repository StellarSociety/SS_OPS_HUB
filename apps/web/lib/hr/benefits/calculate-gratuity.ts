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
    /** Retain withheld from contributors via disciplinary % → pool. */
    disciplinaryFromContributors: number;
    runnerHousekeeperFund: number;
    gross: number;
    ose: number;
    activities: number;
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
      barCashCollected += cash;
      barCcCollected += cc;
      const poolShare = round2((cc * settings.barCcPoolPercent) / 100);
      const barShare = round2((cc * settings.barCcBarStaffPercent) / 100);
      barCcToPool += poolShare;
      if (row.staff_id) {
        addRetained(row.staff_id, barShare, { source: "bar_cc_retain" });
        if (settings.barCashEqualSplit) {
          // Cash equal-split among bar staff is applied later as a group.
          addRetained(row.staff_id, 0, {});
        } else {
          addRetained(row.staff_id, cash, { source: "bar_cash" });
        }
        const prev = waiterMetaByStaff.get(row.staff_id) ?? {};
        waiterMetaByStaff.set(row.staff_id, {
          ...prev,
          bar: true,
          cashCollected: (Number(prev.cashCollected) || 0) + cash,
          ccCollected: (Number(prev.ccCollected) || 0) + cc,
          barCcPool: (Number(prev.barCcPool) || 0) + poolShare,
          barCcRetain: (Number(prev.barCcRetain) || 0) + barShare,
          barCash: (Number(prev.barCash) || 0) + cash,
        });
      } else if (cash > 0 || cc > 0) {
        warnings.push(
          `Bar waiter "${row.waiter_name}" has tips but is not linked to staff.`,
        );
      }
      addContributor({
        key: row.staff_id || `waiter:${row.waiter_id}`,
        staffId: row.staff_id,
        name: row.waiter_name,
        position: row.position,
        cash,
        cc,
        toPool: poolShare,
      });
      continue;
    }

    // Floor waiters
    waiterCashCollected += cash;
    waiterCcCollected += cc;

    const cashRetain = round2((cash * settings.waiterCashRetainPercent) / 100);
    const cashPool = round2((cash * settings.waiterCashPoolPercent) / 100);
    waiterCashTipOut += cashPool;

    let tipOut = 0;
    if (settings.waiterCcTipOutMode === "asph_kpi") {
      const rate = (() => {
        if (!settings.asphKpiEnabled) {
          return settings.waiterCcTipOutPctWhenKpiMissed;
        }
        const value = asph(sales, covers);
        const threshold = input.asphKpiThreshold;
        if (value == null || threshold == null) {
          return settings.waiterCcTipOutPctWhenKpiMissed;
        }
        return value >= threshold
          ? settings.waiterCcTipOutPctWhenKpiMet
          : settings.waiterCcTipOutPctWhenKpiMissed;
      })();
      tipOut = round2((sales * rate) / 100);
      // Tip-out cannot exceed CC collection for the period
      tipOut = Math.min(tipOut, cc);
    } else {
      tipOut = round2((cc * settings.waiterCcCollectionTipOutPercent) / 100);
    }

    waiterCcTipOut += tipOut;
    const ccAfterTipOut = Math.max(0, round2(cc - tipOut));
    const runnerCut = round2(
      (ccAfterTipOut * settings.runnerHousekeeperDeductPercent) / 100,
    );
    runnerHousekeeperFund += runnerCut;
    const waiterCcRetain = round2(ccAfterTipOut - runnerCut);

    if (row.staff_id) {
      addRetained(row.staff_id, cashRetain + waiterCcRetain, {
        source: "waiter_retain",
      });
      waiterMetaByStaff.set(row.staff_id, {
        waiter: true,
        cashCollected: cash,
        ccCollected: cc,
        cashRetain,
        cashPool,
        ccTipOut: tipOut,
        runnerCut,
        ccRetain: waiterCcRetain,
        sales,
        covers,
        asph: asph(sales, covers),
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

  // Equal-split bar cash among linked bar staff (if enabled)
  if (settings.barCashEqualSplit && barCashCollected > 0) {
    const barStaffIds = [
      ...new Set(
        waiterSales
          .filter((w) => isBarRole(w.position) && w.staff_id)
          .map((w) => w.staff_id as string),
      ),
    ];
    if (barStaffIds.length > 0) {
      const each = round2(barCashCollected / barStaffIds.length);
      for (const id of barStaffIds) {
        addRetained(id, each, { source: "bar_cash_equal" });
        const prev = waiterMetaByStaff.get(id) ?? {};
        waiterMetaByStaff.set(id, {
          ...prev,
          barCashEqualShare: each,
        });
      }
    } else if (barCashCollected > 0) {
      warnings.push(
        "Bar cash tips collected but no bar waiters are linked to staff.",
      );
    }
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
  const deductions = resolvePoolDeductions({
    poolGross: tipPoolGross,
    osePercent: settings.poolOseDeductPercent,
    activitiesPercent: settings.poolStaffActivitiesDeductPercent,
    recorded: input.poolCollections ?? null,
  });
  const ose = deductions.ose;
  const activities = deductions.activities;
  // Disciplinary cuts from contributors join the distributable pool in full.
  const poolGross = round2(tipPoolGross + disciplinaryFromContributors);
  const poolNet = round2(tipPoolGross - ose - activities + disciplinaryFromContributors);

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

  if (equalizeDepartmentPointValue) {
    // One global point rate across departments — 1 pt value is identical.
    if (totalPoolWeight > 0 && poolNet > 0) {
      for (const row of weights) {
        if (row.weight <= 0) {
          if (!poolPayByStaff.has(row.staff.id)) {
            poolPayByStaff.set(row.staff.id, 0);
          }
          continue;
        }
        poolPayByStaff.set(
          row.staff.id,
          round2((poolNet * row.weight) / totalPoolWeight),
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
          ? round2((poolNet * deptWeight) / totalPoolWeight)
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
          ? round2((poolNet * pct) / departmentShareWeight)
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
      for (const row of rows) {
        if (row.weight <= 0) {
          if (!poolPayByStaff.has(row.staff.id)) {
            poolPayByStaff.set(row.staff.id, 0);
          }
          continue;
        }
        const amount = round2((deptAmount * row.weight) / totalWeight);
        poolPayByStaff.set(
          row.staff.id,
          (poolPayByStaff.get(row.staff.id) ?? 0) + amount,
        );
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
      disciplinaryFromContributors: round2(disciplinaryFromContributors),
      runnerHousekeeperFund: round2(runnerHousekeeperFund),
      gross: poolGross,
      ose,
      activities,
      net: poolNet,
      byDepartment,
    },
  };
}
