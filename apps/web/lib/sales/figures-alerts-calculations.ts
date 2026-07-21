import {
  computeDailySales,
  getIsoWeekNumber,
  getWeekDayLabel,
  grossToNet,
} from "@/lib/sales/daily-sales-calculations";
import { computeDailyDiscounts } from "@/lib/sales/discounts-calculations";
import type { VenueDailyDiscountsRecord } from "@/lib/sales/discounts-types";
import type {
  VenueDailySalesRecord,
  VenueSalesTaxSettings,
} from "@/lib/sales/daily-sales-types";
import type { VenueDailyTenderTotal } from "@/lib/sales/daily-tender-totals-store";
import {
  sumSalesMatchingTenderAmounts,
  sumTenderAmounts,
} from "@/lib/sales/tenders-calculations";
import type { VenueTender } from "@/lib/sales/tenders-types";
import { computeWaiterSalesReconciliation } from "@/lib/sales/waiter-sales-calculations";
import type { VenueWaiterDailySalesEntry } from "@/lib/sales/waiter-sales-types";

/** Ignore money diffs within this amount (multi-step rounding). */
export const FIGURES_ALERTS_TOLERANCE = 0.03;

export type FiguresAlertCategory =
  | "tender_verification"
  | "tax_collection"
  | "waiter_balance"
  | "daily_vs_waiters"
  | "discounts";

export type FiguresAlertComparison = {
  /** Short field label shown in the comparison row. */
  label: string;
  /** Page / section where this value lives. */
  page: string;
  value: number;
  unit: "money" | "count";
};

export type FiguresAlertComparisonPair = {
  left: FiguresAlertComparison;
  right: FiguresAlertComparison;
  /** left.value − right.value */
  difference: number;
  matched: boolean;
};

export type FiguresAlertCheck = {
  category: FiguresAlertCategory;
  /** Check title shown in the alert card. */
  label: string;
  /** Primary page to open to investigate. */
  pageName: string;
  balanced: boolean;
  differenceGs: number;
  /** One-line explanation of what failed. */
  summary: string;
  /** Paired values with an explicit difference. */
  pairs: FiguresAlertComparisonPair[];
  /** Explicit mismatch sentences (only when unbalanced). */
  mismatches: string[];
  href: string;
};

export type FiguresAlertsDay = {
  sale_date: string;
  weekNumber: number;
  weekDay: string;
  hasActivity: boolean;
  balanced: boolean;
  checks: FiguresAlertCheck[];
  alertCount: number;
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function amountsMatch(a: number, b: number, unit: "money" | "count" = "money"): boolean {
  if (unit === "count") return a === b;
  return Math.abs(roundMoney(a) - roundMoney(b)) <= FIGURES_ALERTS_TOLERANCE;
}

function makePair(
  left: FiguresAlertComparison,
  right: FiguresAlertComparison,
): FiguresAlertComparisonPair {
  const unit = left.unit;
  const leftValue = unit === "money" ? roundMoney(left.value) : left.value;
  const rightValue = unit === "money" ? roundMoney(right.value) : right.value;
  const difference =
    unit === "money"
      ? roundMoney(leftValue - rightValue)
      : leftValue - rightValue;

  return {
    left: { ...left, value: leftValue },
    right: { ...right, value: rightValue },
    difference,
    matched: amountsMatch(leftValue, rightValue, unit),
  };
}

function entryHref(path: string, saleDate: string): string {
  return `${path}?date=${saleDate}`;
}

export function computeTaxCollectionExpected(
  venueRevenueGross: number,
  taxSettings: VenueSalesTaxSettings,
  totalTaxPct: number,
) {
  const netSales = roundMoney(grossToNet(venueRevenueGross, totalTaxPct));
  const vatOnServiceEffectivePct =
    taxSettings.service_charge_pct *
    (taxSettings.vat_on_service_charge_pct / 100);

  const serviceChargeExpected = roundMoney(
    netSales * (taxSettings.service_charge_pct / 100),
  );
  const municipalityExpected = roundMoney(
    netSales * (taxSettings.municipality_fee_pct / 100),
  );
  const vatExpected = roundMoney(
    netSales * ((taxSettings.vat_pct + vatOnServiceEffectivePct) / 100),
  );
  const expectedTotal = roundMoney(
    vatExpected + municipalityExpected + serviceChargeExpected,
  );

  return {
    netSales,
    vatExpected,
    municipalityExpected,
    serviceChargeExpected,
    expectedTotal,
  };
}

function buildTenderCheck(
  saleDate: string,
  dailyTenderAmounts: Record<string, number>,
  waiterTenderAmounts: Record<string, number>,
  waiterGratuityCc: number,
  venueRevenueGross: number,
  tenders: ReadonlyArray<Pick<VenueTender, "id" | "name">>,
  hasDailyTenders: boolean,
  hasWaiterTenders: boolean,
): FiguresAlertCheck | null {
  if (!hasDailyTenders && !hasWaiterTenders) return null;

  const enteredTotal = sumTenderAmounts(dailyTenderAmounts);
  const waitersTotal = sumTenderAmounts(waiterTenderAmounts);
  const overallDiff = roundMoney(enteredTotal - waitersTotal);

  const waitersSalesMatching = sumSalesMatchingTenderAmounts(
    waiterTenderAmounts,
    tenders,
  );
  const waitersExGratuity = roundMoney(waitersSalesMatching - waiterGratuityCc);
  const salesVsRevenueDiff = roundMoney(waitersExGratuity - venueRevenueGross);

  const tenderIds = new Set([
    ...Object.keys(dailyTenderAmounts),
    ...Object.keys(waiterTenderAmounts),
  ]);
  let mismatchedTenders = 0;
  for (const tenderId of tenderIds) {
    const daily = dailyTenderAmounts[tenderId] ?? 0;
    const waiters = waiterTenderAmounts[tenderId] ?? 0;
    if (!amountsMatch(daily, waiters)) mismatchedTenders += 1;
  }

  const balanced =
    amountsMatch(enteredTotal, waitersTotal) &&
    amountsMatch(waitersExGratuity, venueRevenueGross);

  const mismatches: string[] = [];
  if (!amountsMatch(enteredTotal, waitersTotal)) {
    mismatches.push(
      overallDiff > 0
        ? `Daily Sales → Total Tenders (${formatMoneyPlain(enteredTotal)}) is higher than Waiter Sales tender sum (${formatMoneyPlain(waitersTotal)}) by ${formatMoneyPlain(Math.abs(overallDiff))}.`
        : `Waiter Sales tender sum (${formatMoneyPlain(waitersTotal)}) is higher than Daily Sales → Total Tenders (${formatMoneyPlain(enteredTotal)}) by ${formatMoneyPlain(Math.abs(overallDiff))}.`,
    );
  }
  if (!amountsMatch(waitersExGratuity, venueRevenueGross)) {
    mismatches.push(
      salesVsRevenueDiff > 0
        ? `Waiter Sales total excl. CC gratuity & Voucher Issue (${formatMoneyPlain(waitersExGratuity)}) is higher than Daily Sales → Total Revenue (${formatMoneyPlain(venueRevenueGross)}) by ${formatMoneyPlain(Math.abs(salesVsRevenueDiff))}.`
        : `Daily Sales → Total Revenue (${formatMoneyPlain(venueRevenueGross)}) is higher than Waiter Sales total excl. CC gratuity & Voucher Issue (${formatMoneyPlain(waitersExGratuity)}) by ${formatMoneyPlain(Math.abs(salesVsRevenueDiff))}.`,
    );
  }
  if (mismatchedTenders > 0) {
    mismatches.push(
      `${mismatchedTenders} individual tender type${mismatchedTenders === 1 ? "" : "s"} differ between Daily Sales and Waiter Sales.`,
    );
  }

  return {
    category: "tender_verification",
    label: "Tender Verification",
    pageName: "Daily Sales → Entry",
    balanced,
    differenceGs: overallDiff !== 0 ? overallDiff : salesVsRevenueDiff,
    summary: balanced
      ? "Daily Sales tenders match Waiter Sales tenders."
      : "Tender totals do not match between Daily Sales and Waiter Sales.",
    pairs: [
      makePair(
        {
          label: "Total Tenders",
          page: "Daily Sales → Entry",
          value: enteredTotal,
          unit: "money",
        },
        {
          label: "Tenders sum (all waiters)",
          page: "Waiter Sales → Entry",
          value: waitersTotal,
          unit: "money",
        },
      ),
      makePair(
        {
          label: "Total Revenue",
          page: "Daily Sales → Entry",
          value: venueRevenueGross,
          unit: "money",
        },
        {
          label: "Sales excl. CC gratuity & Voucher Issue",
          page: "Waiter Sales → Entry",
          value: waitersExGratuity,
          unit: "money",
        },
      ),
    ],
    mismatches,
    href: entryHref("/sales/daily/entry", saleDate),
  };
}

function buildTaxCheck(
  saleDate: string,
  dailyRecord: VenueDailySalesRecord | undefined,
  venueRevenueGross: number,
  taxSettings: VenueSalesTaxSettings,
  totalTaxPct: number,
): FiguresAlertCheck | null {
  if (!dailyRecord) return null;

  const enteredTotal = roundMoney(
    (dailyRecord.vat_collected_gs ?? 0) +
      (dailyRecord.municipality_fee_collected_gs ?? 0) +
      (dailyRecord.service_charge_collected_gs ?? 0),
  );
  const hasTaxActivity = enteredTotal > 0 || venueRevenueGross > 0;
  if (!hasTaxActivity) return null;

  const expected = computeTaxCollectionExpected(
    venueRevenueGross,
    taxSettings,
    totalTaxPct,
  );
  const differenceGs = roundMoney(enteredTotal - expected.expectedTotal);
  const balanced = amountsMatch(enteredTotal, expected.expectedTotal);

  const mismatches: string[] = [];
  if (!balanced) {
    mismatches.push(
      differenceGs > 0
        ? `Tax collected entered on Daily Sales (${formatMoneyPlain(enteredTotal)}) is higher than the expected amount from Total Revenue (${formatMoneyPlain(expected.expectedTotal)}) by ${formatMoneyPlain(Math.abs(differenceGs))}.`
        : `Expected tax from Daily Sales → Total Revenue (${formatMoneyPlain(expected.expectedTotal)}) is higher than tax collected entered (${formatMoneyPlain(enteredTotal)}) by ${formatMoneyPlain(Math.abs(differenceGs))}.`,
    );
  }

  return {
    category: "tax_collection",
    label: "Tax Collection",
    pageName: "Daily Sales → Entry",
    balanced,
    differenceGs,
    summary: balanced
      ? "Tax collected matches the expected amount from venue tax settings."
      : "Tax collected on Daily Sales does not match the expected amount.",
    pairs: [
      makePair(
        {
          label: "Tax collected (entered)",
          page: "Daily Sales → Entry · Tax Collection",
          value: enteredTotal,
          unit: "money",
        },
        {
          label: "Tax expected (from revenue)",
          page: "Computed from Daily Sales → Total Revenue",
          value: expected.expectedTotal,
          unit: "money",
        },
      ),
    ],
    mismatches,
    href: entryHref("/sales/daily/entry", saleDate),
  };
}

function buildWaiterBalanceCheck(
  saleDate: string,
  waiterRecords: VenueWaiterDailySalesEntry[],
  tenders: ReadonlyArray<Pick<VenueTender, "id" | "name">>,
): FiguresAlertCheck | null {
  if (waiterRecords.length === 0) return null;

  let unbalancedCount = 0;
  let maxAbsDiff = 0;
  let paymentsDiffTotal = 0;
  let tendersDiffTotal = 0;

  for (const record of waiterRecords) {
    const tendersTotalForBalance = sumSalesMatchingTenderAmounts(
      record.tender_amounts ?? {},
      tenders,
    );
    const reconciliation = computeWaiterSalesReconciliation(
      record,
      tendersTotalForBalance,
    );
    if (!reconciliation.isBalanced) {
      unbalancedCount += 1;
      maxAbsDiff = Math.max(
        maxAbsDiff,
        Math.abs(reconciliation.paymentsDifferenceGs),
        Math.abs(reconciliation.tendersDifferenceGs),
      );
      if (reconciliation.paymentsDifferenceGs !== 0) {
        paymentsDiffTotal += 1;
      }
      if (reconciliation.tendersDifferenceGs !== 0) {
        tendersDiffTotal += 1;
      }
    }
  }

  const balanced = unbalancedCount === 0;
  const mismatches: string[] = [];
  if (!balanced) {
    mismatches.push(
      `${unbalancedCount} of ${waiterRecords.length} waiter entr${unbalancedCount === 1 ? "y is" : "ies are"} out of balance on Waiter Sales → Entry.`,
    );
    if (paymentsDiffTotal > 0) {
      mismatches.push(
        `Payment Total does not equal Sales Total + Credit Card Gratuity on ${paymentsDiffTotal} entr${paymentsDiffTotal === 1 ? "y" : "ies"}.`,
      );
    }
    if (tendersDiffTotal > 0) {
      mismatches.push(
        `Tenders total does not equal Sales Total + Credit Card Gratuity on ${tendersDiffTotal} entr${tendersDiffTotal === 1 ? "y" : "ies"}.`,
      );
    }
  }

  return {
    category: "waiter_balance",
    label: "Waiter Balance Check",
    pageName: "Waiter Sales → Entry",
    balanced,
    differenceGs: roundMoney(maxAbsDiff),
    summary: balanced
      ? "All waiter entries pass the balance check."
      : "One or more waiter entries fail the Balance check.",
    pairs: [
      makePair(
        {
          label: "Expected unbalanced entries",
          page: "Waiter Sales → Entry · Balance check",
          value: 0,
          unit: "count",
        },
        {
          label: "Actual unbalanced entries",
          page: "Waiter Sales → Entry · Balance check",
          value: unbalancedCount,
          unit: "count",
        },
      ),
    ],
    mismatches,
    href: entryHref("/sales/waiter/entry", saleDate),
  };
}

function buildDailyVsWaitersCheck(
  saleDate: string,
  dailyCovers: number,
  dailyGrossSales: number,
  waiterCovers: number,
  waiterGrossSales: number,
  hasDailyRecord: boolean,
  hasWaiterRecords: boolean,
): FiguresAlertCheck | null {
  if (!hasDailyRecord && !hasWaiterRecords) return null;

  const coversDiff = dailyCovers - waiterCovers;
  const salesDiff = roundMoney(dailyGrossSales - waiterGrossSales);
  const coversMatched = amountsMatch(dailyCovers, waiterCovers, "count");
  const salesMatched = amountsMatch(dailyGrossSales, waiterGrossSales, "money");
  const balanced = coversMatched && salesMatched;

  const mismatches: string[] = [];
  if (!coversMatched) {
    mismatches.push(
      coversDiff > 0
        ? `Daily Sales covers (${dailyCovers}) are higher than Waiter Sales covers (${waiterCovers}) by ${coversDiff}.`
        : `Waiter Sales covers (${waiterCovers}) are higher than Daily Sales covers (${dailyCovers}) by ${Math.abs(coversDiff)}.`,
    );
  }
  if (!salesMatched) {
    mismatches.push(
      salesDiff > 0
        ? `Daily Sales → Total Revenue (${formatMoneyPlain(dailyGrossSales)}) is higher than Waiter Sales → Sales Total sum (${formatMoneyPlain(waiterGrossSales)}) by ${formatMoneyPlain(Math.abs(salesDiff))}.`
        : `Waiter Sales → Sales Total sum (${formatMoneyPlain(waiterGrossSales)}) is higher than Daily Sales → Total Revenue (${formatMoneyPlain(dailyGrossSales)}) by ${formatMoneyPlain(Math.abs(salesDiff))}.`,
    );
  }

  return {
    category: "daily_vs_waiters",
    label: "Daily vs Waiters",
    pageName: "Verification → Daily vs Waiters",
    balanced,
    differenceGs: !salesMatched ? salesDiff : coversDiff,
    summary: balanced
      ? "Covers and gross sales match between Daily Sales and Waiter Sales."
      : !coversMatched && salesMatched
        ? "Covers differ between Daily Sales and Waiter Sales (sales match)."
        : coversMatched && !salesMatched
          ? "Gross sales differ between Daily Sales and Waiter Sales (covers match)."
          : "Covers and gross sales differ between Daily Sales and Waiter Sales.",
    pairs: [
      makePair(
        {
          label: "Covers",
          page: "Daily Sales → Entry",
          value: dailyCovers,
          unit: "count",
        },
        {
          label: "Covers (all waiters)",
          page: "Waiter Sales → Entry",
          value: waiterCovers,
          unit: "count",
        },
      ),
      makePair(
        {
          label: "Total Revenue",
          page: "Daily Sales → Entry",
          value: dailyGrossSales,
          unit: "money",
        },
        {
          label: "Sales Total (all waiters)",
          page: "Waiter Sales → Entry",
          value: waiterGrossSales,
          unit: "money",
        },
      ),
    ],
    mismatches,
    href: "/sales/daily-vs-waiters",
  };
}

function buildDiscountsCheck(
  saleDate: string,
  discountsRecord: VenueDailyDiscountsRecord | undefined,
  allDayDiscountGs: number,
  waiterDiscountsTotalGs: number,
  totalTaxPct: number,
): FiguresAlertCheck | null {
  const discountsTotal = discountsRecord
    ? (() => {
        const computed = computeDailyDiscounts(discountsRecord, totalTaxPct);
        return roundMoney(
          computed.totalFoodDiscountGs +
            computed.totalBeveragesDiscountGs +
            computed.totalWineDiscountGs +
            computed.totalShishaDiscountGs +
            computed.totalOthersDiscountGs,
        );
      })()
    : 0;

  const hasData =
    discountsTotal > 0 || allDayDiscountGs > 0 || waiterDiscountsTotalGs > 0;
  if (!hasData) return null;

  const balanced =
    amountsMatch(discountsTotal, allDayDiscountGs) &&
    amountsMatch(discountsTotal, waiterDiscountsTotalGs);
  const spread = roundMoney(
    Math.max(discountsTotal, allDayDiscountGs, waiterDiscountsTotalGs) -
      Math.min(discountsTotal, allDayDiscountGs, waiterDiscountsTotalGs),
  );

  const mismatches: string[] = [];
  if (!amountsMatch(discountsTotal, allDayDiscountGs)) {
    const diff = roundMoney(allDayDiscountGs - discountsTotal);
    mismatches.push(
      diff > 0
        ? `Daily Sales → All day Discounts (${formatMoneyPlain(allDayDiscountGs)}) is higher than Discounts → Entry total (${formatMoneyPlain(discountsTotal)}) by ${formatMoneyPlain(Math.abs(diff))}.`
        : `Discounts → Entry total (${formatMoneyPlain(discountsTotal)}) is higher than Daily Sales → All day Discounts (${formatMoneyPlain(allDayDiscountGs)}) by ${formatMoneyPlain(Math.abs(diff))}.`,
    );
  }
  if (!amountsMatch(discountsTotal, waiterDiscountsTotalGs)) {
    const diff = roundMoney(waiterDiscountsTotalGs - discountsTotal);
    mismatches.push(
      diff > 0
        ? `Waiter Sales → Total Discounts sum (${formatMoneyPlain(waiterDiscountsTotalGs)}) is higher than Discounts → Entry total (${formatMoneyPlain(discountsTotal)}) by ${formatMoneyPlain(Math.abs(diff))}.`
        : `Discounts → Entry total (${formatMoneyPlain(discountsTotal)}) is higher than Waiter Sales → Total Discounts sum (${formatMoneyPlain(waiterDiscountsTotalGs)}) by ${formatMoneyPlain(Math.abs(diff))}.`,
    );
  }

  return {
    category: "discounts",
    label: "Discounts",
    pageName: "Discounts → Entry",
    balanced,
    differenceGs: spread,
    summary: balanced
      ? "Discounts match across Discounts Entry, Daily Sales, and Waiter Sales."
      : "Discount totals do not match across Discounts Entry, Daily Sales, and Waiter Sales.",
    pairs: [
      makePair(
        {
          label: "Category discounts total",
          page: "Discounts → Entry",
          value: discountsTotal,
          unit: "money",
        },
        {
          label: "All day Discounts",
          page: "Daily Sales → Entry",
          value: allDayDiscountGs,
          unit: "money",
        },
      ),
      makePair(
        {
          label: "Category discounts total",
          page: "Discounts → Entry",
          value: discountsTotal,
          unit: "money",
        },
        {
          label: "Total Discounts (all waiters)",
          page: "Waiter Sales → Entry",
          value: waiterDiscountsTotalGs,
          unit: "money",
        },
      ),
    ],
    mismatches,
    href: entryHref("/sales/discounts/entry", saleDate),
  };
}

function formatMoneyPlain(value: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export type BuildFiguresAlertsInput = {
  dailyRecords: VenueDailySalesRecord[];
  waiterRecords: VenueWaiterDailySalesEntry[];
  dailyTenderTotals: VenueDailyTenderTotal[];
  discountsRecords: VenueDailyDiscountsRecord[];
  taxSettings: VenueSalesTaxSettings;
  totalTaxPct: number;
  dates: string[];
  tenders: ReadonlyArray<Pick<VenueTender, "id" | "name">>;
};

export function buildFiguresAlertsDays(
  input: BuildFiguresAlertsInput,
): FiguresAlertsDay[] {
  const {
    dailyRecords,
    waiterRecords,
    dailyTenderTotals,
    discountsRecords,
    taxSettings,
    totalTaxPct,
    dates,
    tenders,
  } = input;

  const dailyByDate = new Map(
    dailyRecords.map((record) => [record.sale_date, record]),
  );
  const discountsByDate = new Map(
    discountsRecords.map((record) => [record.sale_date, record]),
  );

  const dailyTendersByDate = new Map<string, Record<string, number>>();
  for (const row of dailyTenderTotals) {
    const current = dailyTendersByDate.get(row.sale_date) ?? {};
    current[row.tender_id] = Number(row.amount_gs);
    dailyTendersByDate.set(row.sale_date, current);
  }

  const waiterRecordsByDate = new Map<string, VenueWaiterDailySalesEntry[]>();
  const waiterTendersByDate = new Map<string, Record<string, number>>();
  const waiterGratuityByDate = new Map<string, number>();
  const waiterCoversByDate = new Map<string, number>();
  const waiterSalesByDate = new Map<string, number>();
  const waiterDiscountsByDate = new Map<string, number>();

  for (const record of waiterRecords) {
    const list = waiterRecordsByDate.get(record.sale_date) ?? [];
    list.push(record);
    waiterRecordsByDate.set(record.sale_date, list);

    const tenders = waiterTendersByDate.get(record.sale_date) ?? {};
    for (const [tenderId, amount] of Object.entries(
      record.tender_amounts ?? {},
    )) {
      tenders[tenderId] = (tenders[tenderId] ?? 0) + Number(amount);
    }
    waiterTendersByDate.set(record.sale_date, tenders);

    waiterGratuityByDate.set(
      record.sale_date,
      roundMoney(
        (waiterGratuityByDate.get(record.sale_date) ?? 0) +
          Number(record.gratuity_cc_gs ?? 0),
      ),
    );
    waiterCoversByDate.set(
      record.sale_date,
      (waiterCoversByDate.get(record.sale_date) ?? 0) +
        Number(record.total_covers ?? 0),
    );
    waiterSalesByDate.set(
      record.sale_date,
      roundMoney(
        (waiterSalesByDate.get(record.sale_date) ?? 0) +
          Number(record.total_sales_gs ?? 0),
      ),
    );
    waiterDiscountsByDate.set(
      record.sale_date,
      roundMoney(
        (waiterDiscountsByDate.get(record.sale_date) ?? 0) +
          Number(record.total_discounts_gs ?? 0),
      ),
    );
  }

  for (const [date, tenders] of waiterTendersByDate) {
    for (const key of Object.keys(tenders)) {
      tenders[key] = roundMoney(tenders[key]);
    }
    waiterTendersByDate.set(date, tenders);
  }

  return dates.map((saleDate) => {
    const dailyRecord = dailyByDate.get(saleDate);
    const dailyComputed = dailyRecord
      ? computeDailySales(dailyRecord, totalTaxPct)
      : null;
    const venueRevenueGross = dailyComputed?.totalVenueGs ?? 0;
    const dailyCovers = dailyComputed?.totalCovers ?? 0;
    const dailyTenders = dailyTendersByDate.get(saleDate) ?? {};
    const waiterTenders = waiterTendersByDate.get(saleDate) ?? {};
    const waiterEntries = waiterRecordsByDate.get(saleDate) ?? [];

    const checks = [
      buildTenderCheck(
        saleDate,
        dailyTenders,
        waiterTenders,
        waiterGratuityByDate.get(saleDate) ?? 0,
        venueRevenueGross,
        tenders,
        Object.keys(dailyTenders).length > 0,
        Object.keys(waiterTenders).length > 0,
      ),
      buildTaxCheck(
        saleDate,
        dailyRecord,
        venueRevenueGross,
        taxSettings,
        totalTaxPct,
      ),
      buildWaiterBalanceCheck(saleDate, waiterEntries, tenders),
      buildDailyVsWaitersCheck(
        saleDate,
        dailyCovers,
        venueRevenueGross,
        waiterCoversByDate.get(saleDate) ?? 0,
        waiterSalesByDate.get(saleDate) ?? 0,
        Boolean(dailyRecord),
        waiterEntries.length > 0,
      ),
      buildDiscountsCheck(
        saleDate,
        discountsByDate.get(saleDate),
        dailyRecord?.all_day_discount_gs ?? 0,
        waiterDiscountsByDate.get(saleDate) ?? 0,
        totalTaxPct,
      ),
    ].filter((check): check is FiguresAlertCheck => check !== null);

    const alertCount = checks.filter((check) => !check.balanced).length;
    const hasActivity = checks.length > 0;

    return {
      sale_date: saleDate,
      weekNumber: getIsoWeekNumber(saleDate),
      weekDay: getWeekDayLabel(saleDate),
      hasActivity,
      balanced: hasActivity && alertCount === 0,
      checks,
      alertCount,
    };
  });
}

export function summarizeFiguresAlertsDays(days: FiguresAlertsDay[]) {
  const activeDays = days.filter((day) => day.hasActivity);
  return {
    activeDays: activeDays.length,
    balancedDays: activeDays.filter((day) => day.balanced).length,
    alertDays: activeDays.filter((day) => !day.balanced).length,
    totalAlerts: activeDays.reduce((sum, day) => sum + day.alertCount, 0),
  };
}
