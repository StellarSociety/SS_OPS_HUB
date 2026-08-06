/** Tolerance for balanced cash journal (matches figures alerts). */
export const CASH_JOURNAL_BALANCE_TOLERANCE = 0.03;

export type CashJournalBalanceInput = {
  openTillGs: number;
  cashWithdrawGs: number;
  totalCashSalesGs: number;
  cashGratuityGs: number;
  cashExpensesGs: number;
  cashDepositGs: number;
  closingTillGs: number;
};

/**
 * Resolve open/closing till for Cash Journal display.
 * Journal null (or 0 from an empty numeric input) falls back to Daily Snap.
 */
export function coalesceCashJournalTillAmount(
  journalValue: number | null | undefined,
  snapValue: number,
): number {
  if (journalValue == null || journalValue === 0) {
    return Number(snapValue ?? 0);
  }
  return Number(journalValue);
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Open till + Cash Bank withdraw + Total cash sales + Cash gratuity
 * − Cash expenses − Cash Bank deposit − Closing till
 * Target: 0 when the till reconciles.
 */
export function computeCashJournalBalance(
  input: CashJournalBalanceInput,
): number {
  return roundMoney(
    input.openTillGs +
      input.cashWithdrawGs +
      input.totalCashSalesGs +
      input.cashGratuityGs -
      input.cashExpensesGs -
      input.cashDepositGs -
      input.closingTillGs,
  );
}

export function isCashJournalBalanced(balanceGs: number): boolean {
  return Math.abs(balanceGs) <= CASH_JOURNAL_BALANCE_TOLERANCE;
}
