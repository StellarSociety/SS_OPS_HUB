import type { VenueTender } from "./tenders-types";
import type { VenueWaiter } from "./waiters-types";
import type { VenueWaiterDailySalesEntry } from "./waiter-sales-types";
import {
  parseExcelCount,
  parseExcelDate,
  parseExcelMoney,
  type SheetRow,
} from "./excel-utils";

const WAITER_HEADER = "waiter";
const DATE_HEADER = "date";

const SCALAR_COLUMNS = [
  { key: "total_sales_gs", label: "Sales Total" },
  { key: "total_payments_gs", label: "Payment Total" },
  { key: "gratuity_cc_gs", label: "Credit Card Gratuity" },
  { key: "gratuity_cash_gs", label: "Cash Gratuity" },
  { key: "groups_service_charge_gs", label: "Groups Service Charge" },
  { key: "total_covers", label: "Total Covers", type: "count" as const },
  { key: "voucher_comments", label: "Voucher Comments", type: "text" as const },
  { key: "deposit_comments", label: "Deposit Comments", type: "text" as const },
  { key: "on_accounts_comments", label: "On Accounts Comments", type: "text" as const },
] as const;

const TENDER_PREFIX = "tender:";

export type WaiterSalesImportPayload = {
  waiter_id: string;
  sale_date: string;
  total_sales_gs: number;
  total_payments_gs: number;
  gratuity_cc_gs: number;
  gratuity_cash_gs: number;
  groups_service_charge_gs: number;
  total_covers: number;
  voucher_comments: string;
  deposit_comments: string;
  on_accounts_comments: string;
  tender_amounts: Record<string, number>;
};

function normalizeName(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function buildHeaderAliases(tenders: VenueTender[]): Record<string, string> {
  const aliases: Record<string, string> = {
    date: DATE_HEADER,
    "sale date": DATE_HEADER,
    sale_date: DATE_HEADER,
    waiter: WAITER_HEADER,
    "waiter name": WAITER_HEADER,
    name: WAITER_HEADER,
  };

  for (const column of SCALAR_COLUMNS) {
    aliases[column.label.toLowerCase()] = column.key;
    aliases[column.key] = column.key;
    aliases[column.key.replace(/_/g, " ")] = column.key;
  }

  for (const tender of tenders) {
    aliases[`${TENDER_PREFIX}${tender.name.toLowerCase()}`] = `tender_${tender.id}`;
    aliases[tender.name.toLowerCase()] = `tender_${tender.id}`;
  }

  return aliases;
}

function resolveWaiterId(
  value: unknown,
  waiters: VenueWaiter[],
  rowNumber: number,
): { waiterId?: string; error?: string } {
  const name = normalizeName(value);
  if (!name) {
    return { error: `Row ${rowNumber}: Waiter is required.` };
  }

  const matches = waiters.filter((waiter) => normalizeName(waiter.name) === name);
  if (matches.length === 0) {
    return {
      error: `Row ${rowNumber}: Waiter "${String(value)}" not found. Use exact waiter names from Settings → Waiters.`,
    };
  }
  if (matches.length > 1) {
    return {
      error: `Row ${rowNumber}: Multiple waiters named "${String(value)}". Rename waiters to be unique before import.`,
    };
  }

  return { waiterId: matches[0].id };
}

export function parseWaiterSalesImportRows(
  rows: SheetRow[],
  waiters: VenueWaiter[],
  tenders: VenueTender[],
): {
  rows: WaiterSalesImportPayload[];
  errors: string[];
} {
  const aliases = buildHeaderAliases(tenders);
  const parsed: WaiterSalesImportPayload[] = [];
  const errors: string[] = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    let saleDate = "";
    let waiterId = "";
    const tenderAmounts: Record<string, number> = {};
    const payload = {
      total_sales_gs: 0,
      total_payments_gs: 0,
      gratuity_cc_gs: 0,
      gratuity_cash_gs: 0,
      groups_service_charge_gs: 0,
      total_covers: 0,
      voucher_comments: "",
      deposit_comments: "",
      on_accounts_comments: "",
    };

    for (const [header, rawValue] of Object.entries(row)) {
      const mapped = aliases[header];
      if (!mapped) continue;

      if (mapped === DATE_HEADER) {
        const date = parseExcelDate(rawValue);
        if (!date) {
          errors.push(
            `Row ${rowNumber}: invalid date "${String(rawValue)}". Use YYYY-MM-DD.`,
          );
          return;
        }
        saleDate = date;
        continue;
      }

      if (mapped === WAITER_HEADER) {
        const resolved = resolveWaiterId(rawValue, waiters, rowNumber);
        if (resolved.error) {
          errors.push(resolved.error);
          return;
        }
        waiterId = resolved.waiterId!;
        continue;
      }

      if (mapped.startsWith("tender_")) {
        const amount = parseExcelMoney(rawValue);
        if (amount > 0) tenderAmounts[mapped.slice("tender_".length)] = amount;
        continue;
      }

      const scalar = SCALAR_COLUMNS.find((column) => column.key === mapped);
      if (!scalar) continue;

      if ("type" in scalar && scalar.type === "text") {
        payload[scalar.key as keyof typeof payload] = String(rawValue ?? "").trim() as never;
        continue;
      }

      if ("type" in scalar && scalar.type === "count") {
        payload[scalar.key as keyof typeof payload] = parseExcelCount(rawValue) as never;
        continue;
      }

      payload[scalar.key as keyof typeof payload] = parseExcelMoney(rawValue) as never;
    }

    if (!saleDate) {
      errors.push(`Row ${rowNumber}: Date is required.`);
      return;
    }
    if (!waiterId) {
      errors.push(`Row ${rowNumber}: Waiter is required.`);
      return;
    }

    parsed.push({
      waiter_id: waiterId,
      sale_date: saleDate,
      ...payload,
      tender_amounts: tenderAmounts,
    });
  });

  return { rows: parsed, errors };
}

export function waiterSalesTemplateHeaders(tenders: VenueTender[]): string[] {
  return [
    "Date",
    "Waiter",
    ...SCALAR_COLUMNS.map((column) => column.label),
    ...tenders.map((tender) => `${TENDER_PREFIX}${tender.name}`),
  ];
}

export function waiterSalesEntryToTemplateRow(
  entry: VenueWaiterDailySalesEntry,
  waiters: VenueWaiter[],
  tenders: VenueTender[],
): (string | number)[] {
  const waiter = waiters.find((item) => item.id === entry.waiter_id);
  const row: (string | number)[] = [
    entry.sale_date,
    waiter?.name ?? entry.waiter_id,
    entry.total_sales_gs,
    entry.total_payments_gs,
    entry.gratuity_cc_gs,
    entry.gratuity_cash_gs,
    entry.groups_service_charge_gs,
    entry.total_covers,
    entry.voucher_comments,
    entry.deposit_comments,
    entry.on_accounts_comments,
  ];

  for (const tender of tenders) {
    row.push(entry.tender_amounts[tender.id] ?? 0);
  }

  return row;
}

export function waiterSalesTemplateInstructions(tenders: VenueTender[]): string[][] {
  const tenderList =
    tenders.length > 0
      ? tenders.map((tender) => `Tender: ${tender.name}`).join(", ")
      : "Configure tenders under Settings → Tenders first.";

  return [
    ["Waiter Sales Import Template"],
    [""],
    ["How to use"],
    ["1. Download this template (blank or with existing data)."],
    ["2. Fill in one row per waiter per date."],
    ["3. Waiter names must match Settings → Waiters exactly."],
    ["4. Tender columns use the prefix 'Tender:' followed by the tender name."],
    ["5. Upload the saved .xlsx file on Sales & Revenue → Settings → Data Management → Waiter Sales."],
    ["6. Import is idempotent: existing waiter+date rows are updated."],
    [""],
    ["Configured tenders", tenderList],
  ];
}
