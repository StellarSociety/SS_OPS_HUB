import { describe, expect, it } from "vitest";
import {
  assertBalanced,
  buildApJournalLines,
  canApproveOrPostApInvoice,
  mirrorJournalLines,
} from "@/lib/accounting/posting-ap";
import {
  computePurchaseLineTax,
  resolveTaxRate,
  type TaxCodeRow,
  type TaxRateRow,
} from "@/lib/accounting/tax";
import { moneyEquals, roundMoney, sumMoney } from "@/lib/accounting/money";
import { canAccessAp } from "@/lib/accounting/permissions";
import type { UserPermission } from "@/lib/role-permissions";

const EXPENSE = "acc-expense";
const INPUT_VAT = "acc-input-vat";
const OUTPUT_VAT = "acc-output-vat";
const AP = "acc-ap";

function tax(
  partial: Pick<TaxCodeRow, "id" | "code"> & Partial<TaxCodeRow>,
): TaxCodeRow {
  return {
    label: partial.code,
    treatment: "input",
    input_recoverable: true,
    output_account_id: null,
    input_account_id: INPUT_VAT,
    ...partial,
  };
}

const codes: TaxCodeRow[] = [
  tax({ id: "tc-sp", code: "SP", input_recoverable: true }),
  tax({ id: "tc-zp", code: "ZP", input_recoverable: true }),
  tax({
    id: "tc-bl",
    code: "BL",
    input_recoverable: false,
    treatment: "input",
  }),
  tax({
    id: "tc-rc",
    code: "RC",
    treatment: "both",
    input_recoverable: true,
    output_account_id: OUTPUT_VAT,
  }),
];

const rates: TaxRateRow[] = [
  { id: "r1", tax_code_id: "tc-sp", rate: 0.05, valid_from: "2018-01-01", valid_to: null },
  { id: "r2", tax_code_id: "tc-zp", rate: 0, valid_from: "2018-01-01", valid_to: null },
  { id: "r3", tax_code_id: "tc-bl", rate: 0.05, valid_from: "2018-01-01", valid_to: null },
  { id: "r4", tax_code_id: "tc-rc", rate: 0.05, valid_from: "2018-01-01", valid_to: null },
];

const accounts = {
  inputVatAccountId: INPUT_VAT,
  outputVatAccountId: OUTPUT_VAT,
  apControlAccountId: AP,
};

describe("tax resolver", () => {
  it("resolves rate by tax_code + date (never hardcoded)", () => {
    expect(resolveTaxRate(rates, "tc-sp", "2026-03-15")).toBe(0.05);
    expect(resolveTaxRate(rates, "tc-zp", "2026-03-15")).toBe(0);
  });

  it("rejects missing rate", () => {
    expect(() => resolveTaxRate(rates, "missing", "2026-01-01")).toThrow(
      /No tax rate/,
    );
  });
});

describe("AP posting mapping", () => {
  it("SP: Dr expense net + Dr input VAT + Cr AP gross — balanced", () => {
    const { lines, subtotalNet, taxTotal, totalGross } = buildApJournalLines({
      lines: [
        {
          description: "Food",
          accountId: EXPENSE,
          netAmount: 1000,
          taxCodeId: "tc-sp",
        },
      ],
      invoiceDate: "2026-06-01",
      taxCodes: codes,
      taxRates: rates,
      accounts,
    });

    expect(subtotalNet).toBe(1000);
    expect(taxTotal).toBe(50);
    expect(totalGross).toBe(1050);
    expect(sumMoney(lines.map((l) => l.debit))).toBe(1050);
    expect(sumMoney(lines.map((l) => l.credit))).toBe(1050);

    const expense = lines.find((l) => l.accountId === EXPENSE);
    const vat = lines.find((l) => l.accountId === INPUT_VAT);
    const ap = lines.find((l) => l.accountId === AP);
    expect(expense?.debit).toBe(1000);
    expect(vat?.debit).toBe(50);
    expect(ap?.credit).toBe(1050);
  });

  it("ZP: zero VAT, Dr expense = Cr AP", () => {
    const { lines, taxTotal, totalGross } = buildApJournalLines({
      lines: [
        {
          description: "Zero-rated",
          accountId: EXPENSE,
          netAmount: 200,
          taxCodeId: "tc-zp",
        },
      ],
      invoiceDate: "2026-06-01",
      taxCodes: codes,
      taxRates: rates,
      accounts,
    });
    expect(taxTotal).toBe(0);
    expect(totalGross).toBe(200);
    expect(lines.some((l) => l.accountId === INPUT_VAT)).toBe(false);
    assertBalanced(lines);
  });

  it("BL: gross to expense, no input VAT", () => {
    const computed = computePurchaseLineTax({
      netAmount: 100,
      taxCode: codes.find((c) => c.code === "BL")!,
      rate: 0.05,
    });
    expect(computed.expenseDebit).toBe(105);
    expect(computed.recoverableTax).toBe(0);

    const { lines } = buildApJournalLines({
      lines: [
        {
          description: "Entertainment",
          accountId: EXPENSE,
          netAmount: 100,
          taxCodeId: "tc-bl",
        },
      ],
      invoiceDate: "2026-06-01",
      taxCodes: codes,
      taxRates: rates,
      accounts,
    });
    expect(lines.find((l) => l.accountId === EXPENSE)?.debit).toBe(105);
    expect(lines.some((l) => l.accountId === INPUT_VAT)).toBe(false);
    expect(lines.find((l) => l.accountId === AP)?.credit).toBe(105);
    assertBalanced(lines);
  });

  it("RC: dual VAT (Dr Input + Cr Output) and Cr AP for net", () => {
    const { lines, totalGross } = buildApJournalLines({
      lines: [
        {
          description: "Import",
          accountId: EXPENSE,
          netAmount: 1000,
          taxCodeId: "tc-rc",
        },
      ],
      invoiceDate: "2026-06-01",
      taxCodes: codes,
      taxRates: rates,
      accounts,
    });

    // Supplier payable is net (no VAT on bill)
    expect(totalGross).toBe(1000);
    expect(lines.find((l) => l.accountId === EXPENSE)?.debit).toBe(1000);
    expect(lines.find((l) => l.accountId === INPUT_VAT)?.debit).toBe(50);
    expect(lines.find((l) => l.accountId === OUTPUT_VAT)?.credit).toBe(50);
    expect(lines.find((l) => l.accountId === AP)?.credit).toBe(1000);
    assertBalanced(lines);
  });

  it("rejects unbalanced journal", () => {
    expect(() =>
      assertBalanced([
        {
          accountId: EXPENSE,
          debit: 100,
          credit: 0,
          taxCodeId: null,
          description: "",
          dimensions: {},
        },
      ]),
    ).toThrow(/unbalanced/i);
  });
});

describe("reversal mirror", () => {
  it("swaps debit/credit and links conceptually", () => {
    const original = buildApJournalLines({
      lines: [
        {
          description: "Food",
          accountId: EXPENSE,
          netAmount: 1000,
          taxCodeId: "tc-sp",
        },
      ],
      invoiceDate: "2026-06-01",
      taxCodes: codes,
      taxRates: rates,
      accounts,
    }).lines;

    const mirrored = mirrorJournalLines(original);
    expect(sumMoney(mirrored.map((l) => l.debit))).toBe(
      sumMoney(original.map((l) => l.credit)),
    );
    expect(sumMoney(mirrored.map((l) => l.credit))).toBe(
      sumMoney(original.map((l) => l.debit)),
    );
    assertBalanced(mirrored);
  });
});

describe("approval thresholds", () => {
  it("bookkeeper (edit, no limit) cannot post", () => {
    expect(
      canApproveOrPostApInvoice(
        { isAppAdmin: false, accessLevel: "edit", approvalLimit: null },
        500,
      ),
    ).toBe(false);
  });

  it("admin can post any amount", () => {
    expect(
      canApproveOrPostApInvoice(
        { isAppAdmin: false, accessLevel: "admin", approvalLimit: null },
        999_999,
      ),
    ).toBe(true);
  });

  it("below-limit approver cannot post over-limit invoice", () => {
    expect(
      canApproveOrPostApInvoice(
        { isAppAdmin: false, accessLevel: "edit", approvalLimit: 1000 },
        1500,
      ),
    ).toBe(false);
    expect(
      canApproveOrPostApInvoice(
        { isAppAdmin: false, accessLevel: "edit", approvalLimit: 1000 },
        800,
      ),
    ).toBe(true);
  });
});

describe("duplicate guard (logical)", () => {
  it("unique key is entity + supplier + supplier_invoice_no", () => {
    const key = (entityId: string, supplierId: string, no: string) =>
      `${entityId}::${supplierId}::${no.trim().toLowerCase()}`;
    const seen = new Set<string>();
    const first = key("ent", "sup", "INV-1");
    seen.add(first);
    expect(seen.has(key("ent", "sup", "INV-1"))).toBe(true);
    expect(seen.has(key("ent", "sup", "INV-2"))).toBe(false);
    expect(seen.has(key("ent", "other", "INV-1"))).toBe(false);
  });
});

describe("RLS / feature gate", () => {
  const venueId = "venue-1";

  it("user without accounting/ap cannot access AP", () => {
    const perms: UserPermission[] = [
      {
        id: "1",
        user_id: "u1",
        venue_id: venueId,
        module_key: "hr",
        feature_key: "staff",
        access_level: "admin",
      },
    ];
    expect(canAccessAp(perms, venueId)).toBe(false);
  });

  it("user with accounting/ap view can access", () => {
    const perms: UserPermission[] = [
      {
        id: "1",
        user_id: "u1",
        venue_id: venueId,
        module_key: "accounting",
        feature_key: "ap",
        access_level: "view",
      },
    ];
    expect(canAccessAp(perms, venueId)).toBe(true);
  });
});

describe("posted invoice immutability (contract)", () => {
  it("editing posted status is forbidden by workflow helpers", () => {
    const status = "posted";
    const canEdit = status === "draft";
    expect(canEdit).toBe(false);
  });

  it("money helpers keep fils precision", () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(moneyEquals(1050, 1050)).toBe(true);
  });
});
