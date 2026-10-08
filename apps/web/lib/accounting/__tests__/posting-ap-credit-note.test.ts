import { describe, expect, it } from "vitest";
import {
  assertBalanced,
  buildApJournalLines,
  flipJournalLines,
} from "@/lib/accounting/posting-ap";
import type { TaxCodeRow, TaxRateRow } from "@/lib/accounting/tax";

const SP: TaxCodeRow = {
  id: "sp",
  code: "SP",
  label: "Standard purchase 5%",
  treatment: "input",
  input_recoverable: true,
  output_account_id: null,
  input_account_id: null,
};
const rates: TaxRateRow[] = [
  { id: "r", tax_code_id: "sp", rate: 0.05, valid_from: "2018-01-01", valid_to: null },
];
const accounts = {
  inputVatAccountId: "input-vat",
  outputVatAccountId: "output-vat",
  apControlAccountId: "ap",
};

describe("supplier credit note posting", () => {
  it("debits AP and credits the expense and input VAT", () => {
    const built = buildApJournalLines({
      lines: [{ description: "Returned stock", accountId: "food", netAmount: 300, taxCodeId: "sp" }],
      invoiceDate: "2026-10-08",
      taxCodes: [SP],
      taxRates: rates,
      accounts,
    });
    const lines = flipJournalLines(built.lines);
    const by = (id: string) => lines.find((l) => l.accountId === id)!;

    expect(by("ap")).toMatchObject({ debit: 315, credit: 0 });
    expect(by("food")).toMatchObject({ debit: 0, credit: 300 });
    expect(by("input-vat")).toMatchObject({ debit: 0, credit: 15 });
    expect(() => assertBalanced(lines)).not.toThrow();
    // No "Reversal:" prefix — a credit note isn't a reversal.
    expect(lines.every((l) => !l.description.startsWith("Reversal"))).toBe(true);
  });
});
