import { cn } from "@/lib/utils";

export const SALES_TABLE_HEADER_SECTION_BG = "bg-[#E2E8C8]";
export const SALES_TABLE_HEADER_COLUMN_BG = "bg-[var(--venue-secondary,#F0F3DD)]";
export const SALES_TABLE_STICKY_BODY_META_BG = "bg-[#ECEEE2]";
export const SALES_TABLE_TOTALS_ROW_BG = "bg-[#E2E8C8]";
export const SALES_TABLE_ACTION_COLUMN_WIDTH = "6rem";
export const SALES_TABLE_DATA_COLUMN_MIN_WIDTH = "4.25rem";

export const SALES_TABLE_FIXED_STICKY_COLUMNS = [
  { key: "sale_date", width: "6.25rem", left: "0px" },
  { key: "weekNumber", width: "3.5rem", left: "6.25rem" },
  { key: "weekDay", width: "4rem", left: "9.75rem" },
] as const;

export const SALES_TABLE_STICKY_BORDER = "border-black/15";
export const SALES_TABLE_CELL_BORDER = "border-black/10";

export const SALES_TABLE_ACTION_STICKY_CLASS =
  "sticky right-0 z-20 border-l border-black/15 bg-white shadow-[-6px_0_8px_-4px_rgba(0,0,0,0.12)]";

export const SALES_TABLE_ACTION_HEADER_STICKY_CLASS =
  "sticky right-0 z-30 border-l border-black/15 shadow-[-6px_0_8px_-4px_rgba(0,0,0,0.12)]";

export type SalesTableStickyColumn = {
  key: string;
  width: string;
  left: string;
};

export function salesTableFilterFieldClass() {
  return "min-w-[6.5rem] flex-1 shrink text-xs";
}

export function salesTableFilterControlClass() {
  return "mt-0.5 h-9 w-full min-w-0";
}

export function salesTableFilterButtonClass() {
  return "inline-flex h-9 min-w-[6.25rem] shrink-0 items-center justify-center rounded-md border border-[var(--venue-primary)] bg-[var(--venue-primary)] px-3 text-sm font-bold text-white transition-opacity hover:opacity-90";
}

export function salesTableFilterClearButtonClass() {
  return "inline-flex h-9 min-w-[6.25rem] shrink-0 items-center justify-center rounded-md border border-[var(--venue-primary)]/30 bg-[var(--venue-primary)]/12 px-3 text-sm font-bold text-[#3D421F] transition-colors hover:bg-[var(--venue-primary)]/20";
}

export function salesTableCellInputClass(
  editable: boolean,
  isCoversOrBookings = false,
) {
  return editable
    ? cn(
        "h-8 w-full min-w-0 rounded border border-black/15 bg-white px-2 text-xs tabular-nums text-[#3D421F] focus:border-[var(--venue-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--venue-primary)]/30",
        isCoversOrBookings ? "text-center" : "text-right",
      )
    : "";
}

export function isSalesTableCoversOrBookingsKey(key: string): boolean {
  return (
    key.endsWith("_covers") ||
    key.endsWith("_bookings") ||
    key === "totalCovers" ||
    key === "totalBookings"
  );
}

export function salesTableNumericCellClass(isCoversOrBookings: boolean): string {
  return cn(
    "block truncate text-xs tabular-nums text-black/80",
    isCoversOrBookings ? "text-center" : "text-right",
  );
}
