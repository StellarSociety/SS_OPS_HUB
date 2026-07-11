import type {
  VenueDailyDiscountsInputField,
  VenueDailyDiscountsRecord,
} from "./discounts-types";
import {
  parseExcelDate,
  parseExcelMoney,
  type SheetRow,
} from "./excel-utils";

export type DiscountsImportColumn = {
  key: VenueDailyDiscountsInputField | "sale_date";
  label: string;
  type: "date" | "money";
};

export const DISCOUNTS_IMPORT_COLUMNS: DiscountsImportColumn[] = [
  { key: "sale_date", label: "Date", type: "date" },
  { key: "food_discount_gs", label: "Food Discount GS", type: "money" },
  {
    key: "beverages_discount_gs",
    label: "Beverages Discount GS",
    type: "money",
  },
  { key: "wine_discount_gs", label: "Wine Discount GS", type: "money" },
  { key: "shisha_discount_gs", label: "Shisha Discount GS", type: "money" },
  { key: "others_discount_gs", label: "Others Discount GS", type: "money" },
];

const HEADER_ALIASES: Record<string, DiscountsImportColumn["key"]> = {};
for (const column of DISCOUNTS_IMPORT_COLUMNS) {
  HEADER_ALIASES[column.label.toLowerCase()] = column.key;
  HEADER_ALIASES[column.key] = column.key;
  HEADER_ALIASES[column.key.replace(/_/g, " ")] = column.key;
}

// Backwards compatibility: old templates split each category into a Lunch and a
// Dinner column. Map both to the single per-day column so their values are summed.
const LEGACY_SERVICE_ALIASES: Record<string, VenueDailyDiscountsInputField> = {
  lunch_food_discount_gs: "food_discount_gs",
  dinner_food_discount_gs: "food_discount_gs",
  lunch_beverages_discount_gs: "beverages_discount_gs",
  dinner_beverages_discount_gs: "beverages_discount_gs",
  lunch_wine_discount_gs: "wine_discount_gs",
  dinner_wine_discount_gs: "wine_discount_gs",
  lunch_shisha_discount_gs: "shisha_discount_gs",
  dinner_shisha_discount_gs: "shisha_discount_gs",
  lunch_others_discount_gs: "others_discount_gs",
  dinner_others_discount_gs: "others_discount_gs",
};
for (const [legacyKey, newKey] of Object.entries(LEGACY_SERVICE_ALIASES)) {
  const label = legacyKey
    .replace(/_gs$/, " GS")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  HEADER_ALIASES[legacyKey] = newKey;
  HEADER_ALIASES[legacyKey.replace(/_/g, " ")] = newKey;
  HEADER_ALIASES[label.toLowerCase()] = newKey;
}

export type DiscountsImportPayload = {
  sale_date: string;
  food_discount_gs: number;
  beverages_discount_gs: number;
  wine_discount_gs: number;
  shisha_discount_gs: number;
  others_discount_gs: number;
};

function emptyPayload(): DiscountsImportPayload {
  return {
    sale_date: "",
    food_discount_gs: 0,
    beverages_discount_gs: 0,
    wine_discount_gs: 0,
    shisha_discount_gs: 0,
    others_discount_gs: 0,
  };
}

function mapRowToPayload(row: SheetRow, rowNumber: number): {
  payload?: DiscountsImportPayload;
  error?: string;
} {
  const payload = emptyPayload();
  const columnByKey = new Map(
    DISCOUNTS_IMPORT_COLUMNS.map((column) => [column.key, column]),
  );

  for (const [header, rawValue] of Object.entries(row)) {
    const key = HEADER_ALIASES[header];
    if (!key) continue;

    const column = columnByKey.get(key);
    if (!column) continue;

    if (column.type === "date") {
      const date = parseExcelDate(rawValue);
      if (!date) {
        return {
          error: `Row ${rowNumber}: invalid date "${String(rawValue)}". Use YYYY-MM-DD.`,
        };
      }
      payload.sale_date = date;
      continue;
    }

    // Accumulate so legacy Lunch + Dinner columns collapse into one per-day value.
    payload[key as VenueDailyDiscountsInputField] += parseExcelMoney(rawValue);
  }

  if (!payload.sale_date) {
    return { error: `Row ${rowNumber}: Date is required.` };
  }

  return { payload };
}

export function parseDiscountsImportRows(rows: SheetRow[]): {
  rows: DiscountsImportPayload[];
  errors: string[];
} {
  const parsed: DiscountsImportPayload[] = [];
  const errors: string[] = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const result = mapRowToPayload(row, rowNumber);
    if (result.error) {
      errors.push(result.error);
      return;
    }
    if (result.payload) parsed.push(result.payload);
  });

  return { rows: parsed, errors };
}

export function discountsRecordToTemplateRow(
  record: VenueDailyDiscountsRecord,
): (string | number)[] {
  return DISCOUNTS_IMPORT_COLUMNS.map((column) => {
    if (column.key === "sale_date") {
      return record.sale_date;
    }
    return record[column.key];
  });
}

export function discountsTemplateHeaders(): string[] {
  return DISCOUNTS_IMPORT_COLUMNS.map((column) => column.label);
}

export function discountsTemplateInstructions(): string[][] {
  return [
    ["Discounts Import Template"],
    [""],
    ["How to use"],
    ["1. Download this template (blank or with existing data)."],
    ["2. Fill in or edit rows — one row per date."],
    ["3. Keep the column headers unchanged."],
    ["4. Dates must be YYYY-MM-DD (e.g. 2026-01-15)."],
    [
      "5. Upload the saved .xlsx file on Sales & Revenue → Settings → Data Management → Discounts.",
    ],
    ["6. Import is idempotent: existing dates are updated, new dates are added."],
    [""],
    ["Leave numeric cells blank or 0 when not applicable."],
  ];
}
