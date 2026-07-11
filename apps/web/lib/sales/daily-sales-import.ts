import type { VenueDailySalesInputField, VenueDailySalesRecord } from "./daily-sales-types";
import {
  parseExcelCount,
  parseExcelDate,
  parseExcelMoney,
  type SheetRow,
} from "./excel-utils";

export type DailySalesImportColumn = {
  key: VenueDailySalesInputField | "sale_date";
  label: string;
  type: "date" | "money" | "count";
};

export const DAILY_SALES_IMPORT_COLUMNS: DailySalesImportColumn[] = [
  { key: "sale_date", label: "Date", type: "date" },
  { key: "lunch_food_gs", label: "Lunch Food GS", type: "money" },
  { key: "lunch_beverages_gs", label: "Lunch Beverages GS", type: "money" },
  { key: "lunch_wine_gs", label: "Lunch Wine GS", type: "money" },
  { key: "lunch_shisha_gs", label: "Lunch Shisha GS", type: "money" },
  { key: "lunch_tobacco_gs", label: "Lunch Tobacco GS", type: "money" },
  { key: "lunch_others_gs", label: "Lunch Others GS", type: "money" },
  { key: "lunch_service_fees_gs", label: "Lunch Service Fees GS", type: "money" },
  { key: "lunch_covers", label: "Lunch Covers", type: "count" },
  { key: "lunch_bookings", label: "Lunch Bookings", type: "count" },
  { key: "lunch_walkin_tables", label: "Lunch Walk-in Tables", type: "count" },
  { key: "lunch_walkin_covers", label: "Lunch Walk-in Covers", type: "count" },
  { key: "dinner_food_gs", label: "Dinner Food GS", type: "money" },
  { key: "dinner_beverages_gs", label: "Dinner Beverages GS", type: "money" },
  { key: "dinner_wine_gs", label: "Dinner Wine GS", type: "money" },
  { key: "dinner_shisha_gs", label: "Dinner Shisha GS", type: "money" },
  { key: "dinner_tobacco_gs", label: "Dinner Tobacco GS", type: "money" },
  { key: "dinner_others_gs", label: "Dinner Others GS", type: "money" },
  { key: "dinner_service_fees_gs", label: "Dinner Service Fees GS", type: "money" },
  { key: "dinner_covers", label: "Dinner Covers", type: "count" },
  { key: "dinner_bookings", label: "Dinner Bookings", type: "count" },
  { key: "dinner_walkin_tables", label: "Dinner Walk-in Tables", type: "count" },
  { key: "dinner_walkin_covers", label: "Dinner Walk-in Covers", type: "count" },
];

const HEADER_ALIASES: Record<string, DailySalesImportColumn["key"]> = {};
for (const column of DAILY_SALES_IMPORT_COLUMNS) {
  HEADER_ALIASES[column.label.toLowerCase()] = column.key;
  HEADER_ALIASES[column.key] = column.key;
  HEADER_ALIASES[column.key.replace(/_/g, " ")] = column.key;
}

export type DailySalesImportPayload = {
  sale_date: string;
  lunch_food_gs: number;
  lunch_beverages_gs: number;
  lunch_wine_gs: number;
  lunch_shisha_gs: number;
  lunch_tobacco_gs: number;
  lunch_others_gs: number;
  lunch_service_fees_gs: number;
  lunch_covers: number;
  lunch_bookings: number;
  lunch_walkin_tables: number;
  lunch_walkin_covers: number;
  dinner_food_gs: number;
  dinner_beverages_gs: number;
  dinner_wine_gs: number;
  dinner_shisha_gs: number;
  dinner_tobacco_gs: number;
  dinner_others_gs: number;
  dinner_service_fees_gs: number;
  dinner_covers: number;
  dinner_bookings: number;
  dinner_walkin_tables: number;
  dinner_walkin_covers: number;
};

type DailySalesNumericField = Exclude<keyof DailySalesImportPayload, "sale_date">;

function emptyPayload(): DailySalesImportPayload {
  return {
    sale_date: "",
    lunch_food_gs: 0,
    lunch_beverages_gs: 0,
    lunch_wine_gs: 0,
    lunch_shisha_gs: 0,
    lunch_tobacco_gs: 0,
    lunch_others_gs: 0,
    lunch_service_fees_gs: 0,
    lunch_covers: 0,
    lunch_bookings: 0,
    lunch_walkin_tables: 0,
    lunch_walkin_covers: 0,
    dinner_food_gs: 0,
    dinner_beverages_gs: 0,
    dinner_wine_gs: 0,
    dinner_shisha_gs: 0,
    dinner_tobacco_gs: 0,
    dinner_others_gs: 0,
    dinner_service_fees_gs: 0,
    dinner_covers: 0,
    dinner_bookings: 0,
    dinner_walkin_tables: 0,
    dinner_walkin_covers: 0,
  };
}

function mapRowToPayload(row: SheetRow, rowNumber: number): {
  payload?: DailySalesImportPayload;
  error?: string;
} {
  const payload = emptyPayload();
  const columnByKey = new Map(
    DAILY_SALES_IMPORT_COLUMNS.map((column) => [column.key, column]),
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

    if (column.type === "money") {
      payload[key as DailySalesNumericField] = parseExcelMoney(rawValue);
      continue;
    }

    payload[key as DailySalesNumericField] = parseExcelCount(rawValue);
  }

  if (!payload.sale_date) {
    return { error: `Row ${rowNumber}: Date is required.` };
  }

  return { payload };
}

export function parseDailySalesImportRows(rows: SheetRow[]): {
  rows: DailySalesImportPayload[];
  errors: string[];
} {
  const parsed: DailySalesImportPayload[] = [];
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

export function dailySalesRecordToTemplateRow(
  record: VenueDailySalesRecord,
): (string | number)[] {
  return DAILY_SALES_IMPORT_COLUMNS.map((column) => {
    if (column.key === "sale_date") {
      return record.sale_date;
    }
    return record[column.key];
  });
}

export function dailySalesTemplateHeaders(): string[] {
  return DAILY_SALES_IMPORT_COLUMNS.map((column) => column.label);
}

export function dailySalesTemplateInstructions(): string[][] {
  return [
    ["Daily Sales Import Template"],
    [""],
    ["How to use"],
    ["1. Download this template (blank or with existing data)."],
    ["2. Fill in or edit rows — one row per date."],
    ["3. Keep the column headers unchanged."],
    ["4. Dates must be YYYY-MM-DD (e.g. 2026-01-15)."],
    ["5. Upload the saved .xlsx file on Sales & Revenue → Settings → Data Management → Daily Sales."],
    ["6. Import is idempotent: existing dates are updated, new dates are added."],
    [""],
    ["Leave numeric cells blank or 0 when not applicable."],
  ];
}
