/**
 * HR Benefits — gratuity (tips) & service charge settlement runs + policy settings.
 */

export const BENEFIT_KINDS = ["gratuity", "service_charge"] as const;
export type BenefitKind = (typeof BENEFIT_KINDS)[number];

export const BENEFIT_KIND_LABELS: Record<BenefitKind, string> = {
  gratuity: "Gratuity",
  service_charge: "Service Charge",
};

export const BENEFIT_RUN_STATUSES = [
  "draft",
  "calculated",
  "review",
  "finalized",
  "applied_to_payroll",
  "cancelled",
] as const;
export type BenefitRunStatus = (typeof BENEFIT_RUN_STATUSES)[number];

export const BENEFIT_RUN_STATUS_LABELS: Record<BenefitRunStatus, string> = {
  draft: "Draft",
  calculated: "Calculated",
  review: "In review",
  finalized: "Finalized",
  applied_to_payroll: "Applied to payroll",
  cancelled: "Cancelled",
};

/** Finalized / applied runs are view-only until explicitly reopened. */
export function isBenefitRunLocked(status: string): boolean {
  return (
    status === "finalized" ||
    status === "applied_to_payroll" ||
    status === "cancelled"
  );
}

export function canReopenBenefitRun(status: string): boolean {
  return status === "finalized" || status === "applied_to_payroll";
}

export type BenefitRunTotals = {
  recipientCount?: number;
  poolGross?: number;
  poolNet?: number;
  totalDistributed?: number;
  /**
   * Actually paid after benefit deductions and the AED 5 floor.
   * Matches Total distributed on the run page.
   */
  totalDistributedPaid?: number;
  /** Bar + waiter cash + waiter CC collected this period. */
  totalTips?: number;
  /**
   * OS&E + staff activities + rounding + withheld retain + benefit deductions.
   * Matches Collections → Total on the run page.
   */
  collectionsTotal?: number;
  waiterCashCollected?: number;
  waiterCcCollected?: number;
  barCashCollected?: number;
  barCcCollected?: number;
  serviceChargeCollected?: number;
  /** Portion of collected reserved for venue expenses (not staff). */
  serviceChargeExpensesReserve?: number;
  /** Portion of collected allocated to the staff distribution pool. */
  serviceChargeStaffPool?: number;
  /** Policy % of collected that goes to staff (e.g. 50). */
  serviceChargeStaffDistributablePercent?: number;
};

/** Waiters / bar staff who contributed tip collections into the distribution pool. */
export type BenefitContributor = {
  staffId: string | null;
  empNo: string | null;
  name: string;
  position: string | null;
  departmentName: string | null;
  cashCollected: number;
  ccCollected: number;
  /** Amount tipped into the general pool (cash tip-out + CC tip-out / bar CC pool). */
  contributedToPool: number;
  /** Net retain after tip-out / runner / OS&E / activities (0 when nothing was kept). */
  retain?: number | null;
  /**
   * True when retain was computed but the person is not entitled to a payout
   * (e.g. terminated). The amount is booked to collections instead.
   */
  withheld?: boolean;
  asph?: number | null;
  ccTipOutPercent?: number | null;
  asphKpiMet?: boolean | null;
  /** Distinct sale dates with cash or CC gratuity > 0. */
  collectionDays?: number;
  /** ISO dates corresponding to collectionDays (for the Contributors calendar). */
  collectionDates?: string[];
};

export type BenefitPeriodMode = "calendar_month" | "payroll_period";

/** Waiter CC tip-out engine. */
export type WaiterCcTipOutMode =
  /** Tip-out % of individual gross sales, rate depends on ASPH KPI. */
  | "asph_kpi"
  /** Flat % of the waiter's CC tip collection contributed to the general pool. */
  | "collection_percent";

export type DisciplinaryWarningLevel =
  | "verbal"
  | "first_written"
  | "second_written"
  | "final";

export type BenefitPointTier = {
  key: string;
  label: string;
  points: number;
  /** HR position IDs assigned to this tier (explicit mapping). */
  positionIds?: string[];
};

export type BenefitDepartmentShare = {
  key: string;
  label: string;
  percent: number;
};

export type GratuityDisciplinaryDeduction = {
  level: DisciplinaryWarningLevel;
  label: string;
  percent: number;
};

export type HrGratuitySettings = {
  /** How the tip period window is resolved for a named month. */
  periodMode: BenefitPeriodMode;
  /**
   * When periodMode is calendar_month, optional start day (1–28).
   * End is always the last day of the named month (or periodEndDay if set ≤ 28).
   */
  periodStartDay: number;
  periodEndDay: number;
  /** Day of month tips are distributed (SOP: 15). */
  distributionDayOfMonth: number;
  /**
   * 0 = same calendar month as benefit month; 1 = following month (SOP default).
   */
  distributionMonthOffset: number;

  // --- Cash tips – waiters (§2) ---
  waiterCashRetainPercent: number;
  waiterCashPoolPercent: number;

  // --- Credit card tips – waiters (§3) ---
  waiterCcTipOutMode: WaiterCcTipOutMode;
  /** Used when waiterCcTipOutMode === 'collection_percent' (current practice: 30). */
  waiterCcCollectionTipOutPercent: number;
  /** Tip-out of individual gross sales when ASPH KPI is achieved (§3.1). */
  waiterCcTipOutPctWhenKpiMet: number;
  /** Tip-out of individual gross sales when ASPH KPI is not met (§3.1). */
  waiterCcTipOutPctWhenKpiMissed: number;
  /** When false, ASPH KPI path is ignored even if mode is asph_kpi. */
  asphKpiEnabled: boolean;
  /**
   * After tip-out, % of retained CC balance deducted for food runners &
   * housekeepers (§3.3).
   */
  runnerHousekeeperDeductPercent: number;

  // --- General tips pool (§4) ---
  poolOseDeductPercent: number;
  poolStaffActivitiesDeductPercent: number;
  departmentShares: BenefitDepartmentShare[];

  // --- Points / worked days / discipline (§5) ---
  pointTiers: BenefitPointTier[];
  /** Regular days off count as worked (SOP: included). Public holidays do not. */
  includeRegularDaysOffInWorkedDays: boolean;
  includePublicHolidaysInWorkedDays: boolean;
  /** Leave (vacation, unpaid, sick, annual) excluded from worked days. */
  excludeLeaveFromWorkedDays: boolean;
  disciplinaryDeductions: GratuityDisciplinaryDeduction[];

  // --- Bar tips (§6) ---
  barCashEqualSplit: boolean;
  barCcPoolPercent: number;
  barCcBarStaffPercent: number;

  // --- Special cases (§8) ---
  resignationEntitled: boolean;
  terminationEntitled: boolean;

  notes: string;
};

export type HrServiceChargeSettings = {
  periodMode: BenefitPeriodMode;
  periodStartDay: number;
  periodEndDay: number;
  distributionDayOfMonth: number;
  distributionMonthOffset: number;

  /**
   * % of collected service charge paid to staff.
   * Remainder is held for venue expenses (not distributed).
   */
  staffDistributablePercent: number;
  pointTiers: BenefitPointTier[];
  includeRegularDaysOffInWorkedDays: boolean;
  includePublicHolidaysInWorkedDays: boolean;
  excludeLeaveFromWorkedDays: boolean;
  disciplinaryDeductions: GratuityDisciplinaryDeduction[];
  resignationEntitled: boolean;
  terminationEntitled: boolean;
  notes: string;
};

export const DEFAULT_GRATUITY_POINT_TIERS: BenefitPointTier[] = [
  { key: "management", label: "Management Level", points: 2.0, positionIds: [] },
  { key: "supervisory", label: "Supervisory Level", points: 1.7, positionIds: [] },
  { key: "general", label: "General Staff (excl. waiters)", points: 1.5, positionIds: [] },
  { key: "commis_helper", label: "Commis Chef & Helpers", points: 1.0, positionIds: [] },
];

export const DEFAULT_GRATUITY_DEPARTMENT_SHARES: BenefitDepartmentShare[] = [
  { key: "kitchen", label: "Kitchen", percent: 43 },
  { key: "beverage", label: "Beverage", percent: 20 },
  { key: "floor_manager", label: "Floor Manager", percent: 14 },
  { key: "reception", label: "Reception", percent: 10 },
  { key: "office", label: "Office", percent: 10 },
];

export const DEFAULT_GRATUITY_DISCIPLINARY: GratuityDisciplinaryDeduction[] = [
  { level: "verbal", label: "Verbal Warning", percent: 15 },
  { level: "first_written", label: "First Written Warning", percent: 25 },
  { level: "second_written", label: "Second Written Warning", percent: 50 },
  { level: "final", label: "Final Warning", percent: 100 },
];

/**
 * Orilla tip SOP defaults.
 * Current operational mode: ASPH tip-out on hold → 30% of waiter CC collection
 * to the general pot (waiterCcTipOutMode = collection_percent).
 */
export const DEFAULT_HR_GRATUITY_SETTINGS: HrGratuitySettings = {
  periodMode: "calendar_month",
  periodStartDay: 1,
  periodEndDay: 31,
  distributionDayOfMonth: 15,
  distributionMonthOffset: 1,

  waiterCashRetainPercent: 70,
  waiterCashPoolPercent: 30,

  waiterCcTipOutMode: "collection_percent",
  waiterCcCollectionTipOutPercent: 30,
  waiterCcTipOutPctWhenKpiMet: 1.5,
  waiterCcTipOutPctWhenKpiMissed: 2,
  asphKpiEnabled: false,
  runnerHousekeeperDeductPercent: 3,

  poolOseDeductPercent: 2,
  poolStaffActivitiesDeductPercent: 1,
  departmentShares: DEFAULT_GRATUITY_DEPARTMENT_SHARES.map((d) => ({ ...d })),
  pointTiers: DEFAULT_GRATUITY_POINT_TIERS.map((t) => ({ ...t })),
  includeRegularDaysOffInWorkedDays: true,
  includePublicHolidaysInWorkedDays: false,
  excludeLeaveFromWorkedDays: true,
  disciplinaryDeductions: DEFAULT_GRATUITY_DISCIPLINARY.map((d) => ({ ...d })),

  barCashEqualSplit: true,
  barCcPoolPercent: 50,
  barCcBarStaffPercent: 50,

  resignationEntitled: true,
  terminationEntitled: false,

  notes: "",
};

export const DEFAULT_HR_SERVICE_CHARGE_SETTINGS: HrServiceChargeSettings = {
  periodMode: "calendar_month",
  periodStartDay: 1,
  periodEndDay: 31,
  distributionDayOfMonth: 15,
  distributionMonthOffset: 1,
  staffDistributablePercent: 50,
  pointTiers: DEFAULT_GRATUITY_POINT_TIERS.map((t) => ({ ...t })),
  includeRegularDaysOffInWorkedDays: true,
  includePublicHolidaysInWorkedDays: false,
  excludeLeaveFromWorkedDays: true,
  disciplinaryDeductions: DEFAULT_GRATUITY_DISCIPLINARY.map((d) => ({ ...d })),
  resignationEntitled: true,
  terminationEntitled: false,
  notes: "",
};

function asNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true" || value === "on" || value === "1") return true;
  if (value === "false" || value === "off" || value === "0") return false;
  return fallback;
}

function mergeDepartmentShares(
  partial: unknown,
  fallback: BenefitDepartmentShare[],
): BenefitDepartmentShare[] {
  if (!Array.isArray(partial) || partial.length === 0) {
    return fallback.map((d) => ({ ...d }));
  }
  return partial.map((raw, i) => {
    const row = (raw ?? {}) as Record<string, unknown>;
    const fb = fallback[i] ?? fallback[0]!;
    return {
      key: String(row.key ?? fb.key),
      label: String(row.label ?? fb.label),
      percent: asNumber(row.percent, fb.percent),
    };
  });
}

/** Each HR position may belong to at most one points tier (first tier wins). */
export function normalizePointTierPositionIds(
  tiers: BenefitPointTier[],
): BenefitPointTier[] {
  const seen = new Set<string>();
  return tiers.map((tier) => ({
    ...tier,
    positionIds: (tier.positionIds ?? []).filter((id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    }),
  }));
}

function mergePointTiers(
  partial: unknown,
  fallback: BenefitPointTier[],
): BenefitPointTier[] {
  if (!Array.isArray(partial) || partial.length === 0) {
    return normalizePointTierPositionIds(fallback.map((t) => ({ ...t })));
  }
  const merged = partial.map((raw, i) => {
    const row = (raw ?? {}) as Record<string, unknown>;
    const fb = fallback[i] ?? fallback[0]!;
    const positionIdsRaw = row.positionIds ?? row.position_ids;
    const positionIds = Array.isArray(positionIdsRaw)
      ? positionIdsRaw.map((id) => String(id)).filter(Boolean)
      : (fb.positionIds ?? []);
    return {
      key: String(row.key ?? fb.key),
      label: String(row.label ?? fb.label),
      points: asNumber(row.points, fb.points),
      positionIds,
    };
  });
  return normalizePointTierPositionIds(merged);
}

function mergeDisciplinary(
  partial: unknown,
  fallback: GratuityDisciplinaryDeduction[],
): GratuityDisciplinaryDeduction[] {
  if (!Array.isArray(partial) || partial.length === 0) {
    return fallback.map((d) => ({ ...d }));
  }
  return partial.map((raw, i) => {
    const row = (raw ?? {}) as Record<string, unknown>;
    const fb = fallback[i] ?? fallback[0]!;
    const level = String(row.level ?? fb.level) as DisciplinaryWarningLevel;
    return {
      level,
      label: String(row.label ?? fb.label),
      percent: asNumber(row.percent, fb.percent),
    };
  });
}

export function mergeGratuitySettings(
  partial?: Partial<HrGratuitySettings> | null,
): HrGratuitySettings {
  const base = DEFAULT_HR_GRATUITY_SETTINGS;
  const p = partial ?? {};
  const mode =
    p.waiterCcTipOutMode === "asph_kpi" ||
    p.waiterCcTipOutMode === "collection_percent"
      ? p.waiterCcTipOutMode
      : base.waiterCcTipOutMode;
  const periodMode =
    p.periodMode === "payroll_period" || p.periodMode === "calendar_month"
      ? p.periodMode
      : base.periodMode;

  return {
    ...base,
    ...p,
    periodMode,
    waiterCcTipOutMode: mode,
    departmentShares: mergeDepartmentShares(
      p.departmentShares,
      base.departmentShares,
    ),
    pointTiers: mergePointTiers(p.pointTiers, base.pointTiers),
    disciplinaryDeductions: mergeDisciplinary(
      p.disciplinaryDeductions,
      base.disciplinaryDeductions,
    ),
    // SHIFT + OFF only. PH / PH-REPL and leave never count.
    includeRegularDaysOffInWorkedDays: true,
    includePublicHolidaysInWorkedDays: false,
    excludeLeaveFromWorkedDays: true,
    asphKpiEnabled: asBool(p.asphKpiEnabled, base.asphKpiEnabled),
    barCashEqualSplit: asBool(p.barCashEqualSplit, base.barCashEqualSplit),
    resignationEntitled: asBool(p.resignationEntitled, base.resignationEntitled),
    terminationEntitled: asBool(p.terminationEntitled, base.terminationEntitled),
    notes: String(p.notes ?? base.notes),
  };
}

export function mergeServiceChargeSettings(
  partial?: Partial<HrServiceChargeSettings> | null,
): HrServiceChargeSettings {
  const base = DEFAULT_HR_SERVICE_CHARGE_SETTINGS;
  const p = partial ?? {};
  const periodMode =
    p.periodMode === "payroll_period" || p.periodMode === "calendar_month"
      ? p.periodMode
      : base.periodMode;

  const staffDistributablePercent = Math.min(
    100,
    Math.max(
      0,
      asNumber(p.staffDistributablePercent, base.staffDistributablePercent),
    ),
  );

  return {
    ...base,
    ...p,
    periodMode,
    staffDistributablePercent,
    pointTiers: mergePointTiers(p.pointTiers, base.pointTiers),
    disciplinaryDeductions: mergeDisciplinary(
      p.disciplinaryDeductions,
      base.disciplinaryDeductions,
    ),
    // SHIFT + OFF only. PH / PH-REPL and leave never count.
    includeRegularDaysOffInWorkedDays: true,
    includePublicHolidaysInWorkedDays: false,
    excludeLeaveFromWorkedDays: true,
    resignationEntitled: asBool(p.resignationEntitled, base.resignationEntitled),
    terminationEntitled: asBool(p.terminationEntitled, base.terminationEntitled),
    notes: String(p.notes ?? base.notes),
  };
}

export type BenefitPeriod = {
  benefitMonth: string;
  periodStart: string;
  periodEnd: string;
  distributionDate: string;
};
