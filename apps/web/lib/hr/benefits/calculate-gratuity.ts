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
import { findMappedBenefitPointTierForStaff, resolveBenefitPointsForStaff } from "./points";
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
  /** Manual exclude from this run — payout is 0 and share is redistributed. */
  excluded_from_run?: boolean;
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
  /** Distinct dates this waiter collected cash or CC gratuity. */
  collectionDates?: string[];
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
    oseFromPool: number;
    oseFromRetain: number;
    activities: number;
    activitiesFromPool: number;
    activitiesFromRetain: number;
    /** Remainders left over after flooring each individual payout to AED 5. */
    roundingCollected: number;
    /**
     * Retain computed for contributors who are not entitled to a payout
     * (e.g. terminated). Kept by the venue and booked to collections.
     * Zero when waived or redirected to the allocation share pool.
     */
    withheldRetain: number;
    /**
     * Withheld retain added to the department allocation pool this run.
     * Zero unless `withheldRetainToPool` is set.
     */
    withheldRetainToPool: number;
    /**
     * Benefit deductions taken from staff payouts this run and booked
     * to collections. Filled after allocation when deduction entries apply.
     */
    benefitDeductions: number;
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

function isExcludedFromRun(staff: { excluded_from_run?: boolean }): boolean {
  return staff.excluded_from_run === true;
}

function isPlaceholderStaff(staff: {
  full_name: string;
  emp_no: string | null;
}): boolean {
  const name = staff.full_name.toLowerCase();
  if (/\b(dummy|test user|testing user|super admin)\b/.test(name)) return true;
  const emp = staff.emp_no?.trim() ?? "";
  return /^(grp|test)/i.test(emp);
}

export function missedGratuityPoolRecipientWarning(input: {
  staff: GratuityStaffInput[];
  settings: HrGratuitySettings;
  workedDaysFor: (staffId: string) => number;
  skipStaffIds: Iterable<string>;
}): string | null {
  const skip = new Set(input.skipStaffIds);
  const missed: Array<{
    staff: GratuityStaffInput;
    workedDays: number;
  }> = [];
  for (const s of input.staff) {
    if (skip.has(s.id)) continue;
    if (isExcludedFromRun(s)) continue;
    if (!entitled(s, input.settings)) continue;
    if (s.is_floor_waiter) continue;
    if (isPlaceholderStaff(s)) continue;
    const workedDays = input.workedDaysFor(s.id);
    if (workedDays <= 0) continue;
    missed.push({ staff: s, workedDays });
  }
  if (missed.length === 0) return null;

  const shareList = input.settings.departmentShares
    .map((d) => d.label)
    .filter(Boolean)
    .join(", ");
  const names = missed
    .map((row) => {
      const emp = row.staff.emp_no?.trim();
      const dept = row.staff.department_name?.trim() || "no department";
      const daysLabel =
        row.workedDays === 1
          ? "1 worked day"
          : `${row.workedDays} worked days`;
      const who = emp ? `${row.staff.full_name} (${emp})` : row.staff.full_name;
      return `${who} — ${dept}, ${daysLabel}`;
    })
    .join("; ");
  return `These employees worked this period but were left off Allocations — their department is not on the distribution list (${shareList || "none"}), or they were not included on this run. Map the department or they will be missed: ${names}.`;
}

function pointsForStaff(
  staff: GratuityStaffInput,
  settings: HrGratuitySettings,
): number {
  if (staff.tip_points != null && Number.isFinite(staff.tip_points)) {
    return Number(staff.tip_points);
  }
  const mapped = findMappedBenefitPointTierForStaff(staff, settings.pointTiers);
  if (mapped) return mapped.points;
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
  /**
   * This run only: pay retain to collectors who are otherwise not entitled
   * (e.g. terminated) instead of booking it to collections.
   */
  waiveWithheldRetain?: boolean;
  /**
   * This run only: add withheld retain to the department allocation share
   * pool instead of booking it to collections or paying the collector.
   */
  withheldRetainToPool?: boolean;
}): GratuityCalcResult {
  const { settings, staff, waiterSales, scheduleDays } = input;
  const equalizeDepartmentPointValue = Boolean(
    input.equalizeDepartmentPointValue,
  );
  const waiveWithheldRetain = Boolean(input.waiveWithheldRetain);
  const withheldRetainToPool =
    Boolean(input.withheldRetainToPool) && !waiveWithheldRetain;
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
      collectionDates: Set<string>;
    }
  >();

  function addCollectionDates(target: Set<string>, dates: string[] | undefined) {
    for (const date of dates ?? []) {
      const key = String(date).slice(0, 10);
      if (key) target.add(key);
    }
  }

  function addContributor(args: {
    key: string;
    staffId: string | null;
    name: string;
    position: string;
    cash: number;
    cc: number;
    toPool: number;
    collectionDates?: string[];
  }) {
    if (args.cash <= 0 && args.cc <= 0 && args.toPool <= 0) return;
    const staff = args.staffId ? staffById.get(args.staffId) : null;
    const prev = contributorAcc.get(args.key);
    if (prev) {
      prev.cashCollected = round2(prev.cashCollected + args.cash);
      prev.ccCollected = round2(prev.ccCollected + args.cc);
      prev.contributedToPool = round2(prev.contributedToPool + args.toPool);
      addCollectionDates(prev.collectionDates, args.collectionDates);
      return;
    }
    const collectionDates = new Set<string>();
    addCollectionDates(collectionDates, args.collectionDates);
    contributorAcc.set(args.key, {
      staffId: args.staffId,
      empNo: staff?.emp_no ?? null,
      name: staff?.full_name || args.name,
      position: staff?.position_name || args.position || null,
      departmentName: staff?.department_name ?? null,
      cashCollected: round2(args.cash),
      ccCollected: round2(args.cc),
      contributedToPool: round2(args.toPool),
      collectionDates,
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
        const prevDates = Array.isArray(prev.collectionDates)
          ? (prev.collectionDates as string[])
          : [];
        const collectionDates = [
          ...new Set([...prevDates, ...(row.collectionDates ?? [])]),
        ].sort();
        waiterMetaByStaff.set(row.staff_id, {
          ...prev,
          bar: true,
          cashCollected: (Number(prev.cashCollected) || 0) + cash,
          ccCollected: (Number(prev.ccCollected) || 0) + cc,
          barCcPool: (Number(prev.barCcPool) || 0) + poolShare,
          barCcToBarStaff: (Number(prev.barCcToBarStaff) || 0) + barShare,
          barCashCollected: (Number(prev.barCashCollected) || 0) + cash,
          collectionDays: collectionDates.length,
          collectionDates,
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
        collectionDates: row.collectionDates,
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
      const collectionDates = [...(row.collectionDates ?? [])].sort();
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
        collectionDays: collectionDates.length,
        collectionDates,
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
      collectionDates: row.collectionDates,
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
  let generalNet = round2(
    tipPoolGross -
      poolDeductions.ose -
      poolDeductions.activities +
      disciplinaryFromContributors,
  );

  // Same set as the post-allocation collections booking: retain that will
  // not be paid because the collector is excluded or not entitled.
  let withheldRetainComputed = 0;
  for (const [staffId, retain] of retainedByStaff) {
    if (retain <= 0) continue;
    const s = staffById.get(staffId);
    if (!s || isExcludedFromRun(s) || !entitled(s, settings)) {
      withheldRetainComputed = round2(withheldRetainComputed + retain);
    }
  }

  let withheldRetain = 0;
  let withheldRetainAddedToPool = 0;
  if (waiveWithheldRetain) {
    withheldRetain = 0;
  } else if (withheldRetainToPool && withheldRetainComputed > 0) {
    withheldRetainAddedToPool = withheldRetainComputed;
    generalNet = round2(generalNet + withheldRetainAddedToPool);
    warnings.push(
      `Withheld retain ${withheldRetainAddedToPool.toFixed(2)} AED from staff not entitled to this run — moved to the allocation share pool.`,
    );
  } else if (withheldRetainComputed > 0) {
    withheldRetain = withheldRetainComputed;
    warnings.push(
      `Withheld retain ${withheldRetain.toFixed(2)} AED from staff not entitled to this run — moved to collections.`,
    );
  }
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
    if (isExcludedFromRun(s)) continue;
    if (!entitled(s, settings)) continue;
    if (s.is_floor_waiter) continue;
    if (isPlaceholderStaff(s)) continue;

    const labels = scheduleByStaff.get(s.id) ?? [];
    const workedDays = countBenefitsWorkedDays(labels, settings);
    if (workedDays <= 0) continue;

    const deptKey =
      matchDepartmentShareKey(s.department_name, settings.departmentShares) ??
      null;
    if (!deptKey || byDepartment[deptKey] == null) continue;

    const points = pointsForStaff(s, settings);
    const discMult = disciplinaryMultiplier(s.warning_level, settings);
    const weight = Math.max(0, points * workedDays * discMult);
    // Keep zero-weight rows (e.g. 100% disciplinary) so staff stay on the run.
    weights.push({ staff: s, deptKey, points, workedDays, weight, discMult });
  }

  const missedWarning = missedGratuityPoolRecipientWarning({
    staff,
    settings,
    workedDaysFor: (staffId) =>
      countBenefitsWorkedDays(scheduleByStaff.get(staffId) ?? [], settings),
    skipStaffIds: weights.map((row) => row.staff.id),
  });
  if (missedWarning) warnings.push(missedWarning);

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
    if (isExcludedFromRun(s)) return false;
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
    if (isExcludedFromRun(s)) return false;
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
    if (isExcludedFromRun(s)) continue;
    const retain = retainedByStaff.get(staffId) ?? 0;
    const isEntitled = entitled(s, settings);
    if (!isEntitled && !(waiveWithheldRetain && retain > 0)) continue;
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
        withheldWaived: !isEntitled && waiveWithheldRetain && retain > 0,
        waiter: waiterMeta,
      },
    });
  }

  const allocatedStaffIds = new Set(allocations.map((a) => a.staff_id));

  for (const s of staff) {
    if (!isExcludedFromRun(s) || s.is_floor_waiter) continue;
    if (allocatedStaffIds.has(s.id)) continue;
    const labels = scheduleByStaff.get(s.id) ?? [];
    const workedDays = countBenefitsWorkedDays(labels, settings);
    const points = pointsForStaff(s, settings);
    const discMult = disciplinaryMultiplier(s.warning_level, settings);
    const discPct = disciplinaryPercent(s.warning_level, settings);
    const deptKey = matchDepartmentShareKey(
      s.department_name,
      settings.departmentShares,
    );
    allocations.push({
      staff_id: s.id,
      benefit_type: "tips",
      points,
      worked_days: workedDays,
      amount: 0,
      meta: {
        excluded: true,
        obtain: 0,
        retain: 0,
        poolShare: 0,
        departmentKey: deptKey,
        departmentLabel:
          settings.departmentShares.find((d) => d.key === deptKey)?.label ??
          s.department_name,
        warningLevel: s.warning_level ?? null,
        disciplinaryPercent: discPct,
        disciplinaryMultiplier: discMult,
        pointsOverridden: s.tip_points != null,
        waiter: waiterMetaByStaff.get(s.id) ?? null,
      },
    });
    allocatedStaffIds.add(s.id);
  }

  allocations.sort((a, b) => b.amount - a.amount);

  const totalDistributed = round2(
    allocations.reduce((s, a) => s + a.amount, 0),
  );

  const contributors: BenefitContributor[] = [...contributorAcc.values()]
    .map((row) => {
      const collectionDates = [...row.collectionDates].sort();
      const waiterMeta = row.staffId
        ? waiterMetaByStaff.get(row.staffId)
        : undefined;
      const retainAmt = row.staffId
        ? round2(retainedByStaff.get(row.staffId) ?? 0)
        : 0;
      const withheld = Boolean(
        row.staffId && retainAmt > 0 && !allocatedStaffIds.has(row.staffId),
      );
      const asphRaw = Number(waiterMeta?.asph);
      const tipOutRaw = Number(waiterMeta?.ccTipOutPercent);
      return {
        staffId: row.staffId,
        empNo: row.empNo,
        name: row.name,
        position: row.position,
        departmentName: row.departmentName,
        cashCollected: row.cashCollected,
        ccCollected: row.ccCollected,
        contributedToPool: row.contributedToPool,
        retain: retainAmt > 0 ? retainAmt : null,
        withheld,
        asph: Number.isFinite(asphRaw) ? asphRaw : null,
        ccTipOutPercent: Number.isFinite(tipOutRaw) ? tipOutRaw : null,
        asphKpiMet:
          typeof waiterMeta?.asphKpiMet === "boolean"
            ? waiterMeta.asphKpiMet
            : null,
        collectionDays: collectionDates.length,
        collectionDates,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  // Only people who actually receive a payout leave an AED 5 remainder.
  // Withheld retain is collected in full, not floored as a payout.
  const roundingCollected = sumAed5RoundingRemainder(
    allocations.map((allocation) => allocation.amount),
  );

  const waiterCash = round2(waiterCashCollected);
  const waiterCc = round2(waiterCcCollected);
  const barCash = round2(barCashCollected);
  const barCc = round2(barCcCollected);
  const totals: BenefitRunTotals = {
    recipientCount: allocations.filter(
      (a) =>
        (a.meta as { excluded?: boolean }).excluded !== true &&
        (Number(a.amount) || 0) > 0,
    ).length,
    poolGross,
    poolNet,
    totalDistributed,
    totalTips: round2(waiterCash + waiterCc + barCash + barCc),
    waiterCashCollected: waiterCash,
    waiterCcCollected: waiterCc,
    barCashCollected: barCash,
    barCcCollected: barCc,
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
      oseFromPool: round2(poolDeductions.ose),
      oseFromRetain: round2(retainOse),
      activities,
      activitiesFromPool: round2(poolDeductions.activities),
      activitiesFromRetain: round2(retainActivities),
      roundingCollected,
      withheldRetain,
      withheldRetainToPool: withheldRetainAddedToPool,
      benefitDeductions: 0,
      net: poolNet,
      byDepartment,
    },
  };
}
