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
