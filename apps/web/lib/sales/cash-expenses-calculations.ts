import { CASH_JOURNAL_BALANCE_TOLERANCE } from "@/lib/sales/cash-journal-calculations";
import type { VenueCashExpenseLineRecord } from "@/lib/sales/cash-expenses-types";

export type CashExpenseJustificationLine = {
  id: string;
  description: string;
  grossGs: number;
  vatGs: number;
  netGs: number;
  /** Checked when the expense is recorded in Purchase Portal. */
  pchasePortal: boolean;
};

export function cashExpenseRecordToLine(
  record: VenueCashExpenseLineRecord,
): CashExpenseJustificationLine {
  return {
    id: record.id,
    description: record.description,
    grossGs: Number(record.gross_gs) || 0,
    vatGs: Number(record.vat_gs) || 0,
    netGs: Number(record.net_gs) || 0,
    pchasePortal: Boolean(record.pchase_portal),
  };
}

export function groupCashExpenseLinesByDate(
  records: VenueCashExpenseLineRecord[],
): Record<string, CashExpenseJustificationLine[]> {
  const map: Record<string, CashExpenseJustificationLine[]> = {};
  for (const record of records) {
    const line = cashExpenseRecordToLine(record);
    const bucket = map[record.sale_date] ?? [];
    bucket.push(line);
    map[record.sale_date] = bucket;
  }
  return map;
}

export type CashExpenseDayRow = {
  saleDate: string;
  cashExpensesGs: number;
  /** Sum of gross (cash paid) — compared to journal cash expenses. */
  justifiedGs: number;
  justifiedGrossGs: number;
  justifiedVatGs: number;
  justifiedNetGs: number;
  toJustifyGs: number;
  justified: boolean;
  lineCount: number;
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function sumJustificationGross(
  lines: Pick<CashExpenseJustificationLine, "grossGs">[],
): number {
  return roundMoney(
    lines.reduce((sum, line) => sum + (Number(line.grossGs) || 0), 0),
  );
}

export function sumJustificationVat(
  lines: Pick<CashExpenseJustificationLine, "vatGs">[],
): number {
  return roundMoney(
    lines.reduce((sum, line) => sum + (Number(line.vatGs) || 0), 0),
  );
}

export function sumJustificationNet(
  lines: Pick<CashExpenseJustificationLine, "netGs">[],
): number {
  return roundMoney(
    lines.reduce((sum, line) => sum + (Number(line.netGs) || 0), 0),
  );
}

/** Justified gross − Cash expenses (journal). Target: 0 when fully justified. */
export function computeCashExpenseToJustify(
  cashExpensesGs: number,
  justifiedGs: number,
): number {
  return roundMoney(justifiedGs - cashExpensesGs);
}

export function isCashExpenseJustified(toJustifyGs: number): boolean {
  return Math.abs(toJustifyGs) <= CASH_JOURNAL_BALANCE_TOLERANCE;
}

export function buildCashExpenseDayRow(input: {
  saleDate: string;
  cashExpensesGs: number;
  lines: Pick<
    CashExpenseJustificationLine,
    "grossGs" | "vatGs" | "netGs"
  >[];
}): CashExpenseDayRow {
  const cashExpensesGs = roundMoney(Number(input.cashExpensesGs) || 0);
  const justifiedGrossGs = sumJustificationGross(input.lines);
  const justifiedVatGs = sumJustificationVat(input.lines);
  const justifiedNetGs = sumJustificationNet(input.lines);
  const justifiedGs = justifiedGrossGs;
  const toJustifyGs = computeCashExpenseToJustify(cashExpensesGs, justifiedGs);
  return {
    saleDate: input.saleDate,
    cashExpensesGs,
    justifiedGs,
    justifiedGrossGs,
    justifiedVatGs,
    justifiedNetGs,
    toJustifyGs,
    justified: isCashExpenseJustified(toJustifyGs),
    lineCount: input.lines.length,
  };
}
