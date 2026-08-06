import {
  formatMonthLabel,
  getCurrentMonthKey,
  getWeekDayLabel,
} from "@/lib/sales/daily-sales-calculations";
import {
  computeCashJournalBalance,
  type CashJournalBalanceInput,
} from "@/lib/sales/cash-journal-calculations";
import type { CashSalesRecord } from "@/lib/sales/cash-sales-report";
import type { VenueCashJournalRecord } from "@/lib/sales/cash-journal-types";
import type { VenueDailySnapCashDrawerRow } from "@/lib/sales/daily-snap-store";
import { getDatesInMonth } from "@/lib/sales/sales-data-table-dates";

export type CashJournalReportDayRow = CashJournalBalanceInput & {
  saleDate: string;
  weekDay: string;
  comments: string;
  balanceGs: number;
  hasActivity: boolean;
};

export type CashJournalReportMonthSummary = {
  openTillGs: number;
  cashWithdrawGs: number;
  totalCashSalesGs: number;
  cashGratuityGs: number;
  cashExpensesGs: number;
  cashDepositGs: number;
  closingTillGs: number;
  balanceGs: number;
  activeDayCount: number;
};

export type CashJournalReportMonth = {
  monthKey: string;
  monthLabel: string;
  rows: CashJournalReportDayRow[];
  summary: CashJournalReportMonthSummary;
};

/** Minimal daily cash journal rows for the report / table. */
export type CashJournalRecord = CashJournalBalanceInput & {
  sale_date: string;
  comments: string;
};

export type CashGratuityRecord = {
  sale_date: string;
  gratuity_cash_gs: number;
};

/**
 * Merge persisted journal edits with Daily Snap till amounts, Cash tender sales,
 * and waiter cash gratuity. Till: journal override when set, otherwise Daily Snap.
 */
export function mergeCashJournalSyncedRecords(input: {
  journalRows: Pick<
    VenueCashJournalRecord,
    | "sale_date"
    | "open_till_gs"
    | "cash_withdraw_gs"
    | "cash_expenses_gs"
    | "cash_deposit_gs"
    | "closing_till_gs"
    | "comments"
  >[];
  cashDrawerRows: VenueDailySnapCashDrawerRow[];
  cashSalesRows: CashSalesRecord[];
  cashGratuityRows?: CashGratuityRecord[];
}): CashJournalRecord[] {
  const dates = new Set<string>();
  const journalByDate = new Map<
    string,
    Pick<
      VenueCashJournalRecord,
      | "open_till_gs"
      | "cash_withdraw_gs"
      | "cash_expenses_gs"
      | "cash_deposit_gs"
      | "closing_till_gs"
      | "comments"
    >
  >();
  const drawerByDate = new Map<string, VenueDailySnapCashDrawerRow>();
  const cashSalesByDate = new Map<string, number>();
  const cashGratuityByDate = new Map<string, number>();

  for (const row of input.journalRows) {
    dates.add(row.sale_date);
    journalByDate.set(row.sale_date, row);
  }
  for (const row of input.cashDrawerRows) {
    dates.add(row.sale_date);
    drawerByDate.set(row.sale_date, row);
  }
  for (const row of input.cashSalesRows) {
    dates.add(row.sale_date);
    cashSalesByDate.set(
      row.sale_date,
      roundMoney((cashSalesByDate.get(row.sale_date) ?? 0) + Number(row.amount_gs ?? 0)),
    );
  }
  for (const row of input.cashGratuityRows ?? []) {
    dates.add(row.sale_date);
    cashGratuityByDate.set(
      row.sale_date,
      roundMoney(
        (cashGratuityByDate.get(row.sale_date) ?? 0) +
          Number(row.gratuity_cash_gs ?? 0),
      ),
    );
  }

  return Array.from(dates)
    .sort((a, b) => a.localeCompare(b))
    .map((sale_date) => {
      const journal = journalByDate.get(sale_date);
      const drawer = drawerByDate.get(sale_date);
      return {
        sale_date,
        openTillGs:
          journal?.open_till_gs != null
            ? Number(journal.open_till_gs)
            : Number(drawer?.cash_drawer_opening_gs ?? 0),
        cashWithdrawGs: Number(journal?.cash_withdraw_gs ?? 0),
        totalCashSalesGs: cashSalesByDate.get(sale_date) ?? 0,
        cashGratuityGs: cashGratuityByDate.get(sale_date) ?? 0,
        cashExpensesGs: Number(journal?.cash_expenses_gs ?? 0),
        cashDepositGs: Number(journal?.cash_deposit_gs ?? 0),
        closingTillGs:
          journal?.closing_till_gs != null
            ? Number(journal.closing_till_gs)
            : Number(drawer?.cash_drawer_closing_gs ?? 0),
        comments: String(journal?.comments ?? "").trim(),
      };
    });
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function emptyDayValues(): CashJournalBalanceInput {
  return {
    openTillGs: 0,
    cashWithdrawGs: 0,
    totalCashSalesGs: 0,
    cashGratuityGs: 0,
    cashExpensesGs: 0,
    cashDepositGs: 0,
    closingTillGs: 0,
  };
}

function dayHasActivity(
  values: CashJournalBalanceInput,
  comments = "",
): boolean {
  return (
    values.openTillGs !== 0 ||
    values.cashWithdrawGs !== 0 ||
    values.totalCashSalesGs !== 0 ||
    values.cashGratuityGs !== 0 ||
    values.cashExpensesGs !== 0 ||
    values.cashDepositGs !== 0 ||
    values.closingTillGs !== 0 ||
    comments.trim().length > 0
  );
}

export function buildCashJournalReportMonth(
  records: CashJournalRecord[],
  monthKey: string,
): CashJournalReportMonth {
  const byDate = new Map<
    string,
    CashJournalBalanceInput & { comments: string }
  >();

  for (const record of records) {
    if (!record.sale_date.startsWith(monthKey)) continue;
    byDate.set(record.sale_date, {
      openTillGs: Number(record.openTillGs ?? 0),
      cashWithdrawGs: Number(record.cashWithdrawGs ?? 0),
      totalCashSalesGs: Number(record.totalCashSalesGs ?? 0),
      cashGratuityGs: Number(record.cashGratuityGs ?? 0),
      cashExpensesGs: Number(record.cashExpensesGs ?? 0),
      cashDepositGs: Number(record.cashDepositGs ?? 0),
      closingTillGs: Number(record.closingTillGs ?? 0),
      comments: String(record.comments ?? "").trim(),
    });
  }

  const rows: CashJournalReportDayRow[] = getDatesInMonth(monthKey).map(
    (saleDate) => {
      const stored = byDate.get(saleDate);
      const values = stored
        ? {
            openTillGs: stored.openTillGs,
            cashWithdrawGs: stored.cashWithdrawGs,
            totalCashSalesGs: stored.totalCashSalesGs,
            cashGratuityGs: stored.cashGratuityGs,
            cashExpensesGs: stored.cashExpensesGs,
            cashDepositGs: stored.cashDepositGs,
            closingTillGs: stored.closingTillGs,
          }
        : emptyDayValues();
      const comments = stored?.comments ?? "";
      const balanceGs = computeCashJournalBalance(values);
      return {
        saleDate,
        weekDay: getWeekDayLabel(saleDate),
        ...values,
        comments,
        balanceGs,
        hasActivity: dayHasActivity(values, comments) || byDate.has(saleDate),
      };
    },
  );

  const summary = rows.reduce<CashJournalReportMonthSummary>(
    (acc, row) => ({
      openTillGs: roundMoney(acc.openTillGs + row.openTillGs),
      cashWithdrawGs: roundMoney(acc.cashWithdrawGs + row.cashWithdrawGs),
      totalCashSalesGs: roundMoney(acc.totalCashSalesGs + row.totalCashSalesGs),
      cashGratuityGs: roundMoney(acc.cashGratuityGs + row.cashGratuityGs),
      cashExpensesGs: roundMoney(acc.cashExpensesGs + row.cashExpensesGs),
      cashDepositGs: roundMoney(acc.cashDepositGs + row.cashDepositGs),
      closingTillGs: roundMoney(acc.closingTillGs + row.closingTillGs),
      balanceGs: roundMoney(acc.balanceGs + row.balanceGs),
      activeDayCount: acc.activeDayCount + (row.hasActivity ? 1 : 0),
    }),
    {
      openTillGs: 0,
      cashWithdrawGs: 0,
      totalCashSalesGs: 0,
      cashGratuityGs: 0,
      cashExpensesGs: 0,
      cashDepositGs: 0,
      closingTillGs: 0,
      balanceGs: 0,
      activeDayCount: 0,
    },
  );

  return {
    monthKey,
    monthLabel: formatMonthLabel(monthKey),
    rows,
    summary,
  };
}

export function listCashJournalReportMonths(
  records: Pick<CashJournalRecord, "sale_date">[],
): string[] {
  const months = new Set<string>();
  months.add(getCurrentMonthKey());

  for (const record of records) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(record.sale_date)) {
      months.add(record.sale_date.slice(0, 7));
    }
  }

  return Array.from(months).sort((a, b) => b.localeCompare(a));
}

export function defaultCashJournalReportMonth(
  availableMonths: string[],
): string {
  const current = getCurrentMonthKey();
  if (availableMonths.includes(current)) return current;
  return availableMonths[0] ?? current;
}
