/** Local calendar date as YYYY-MM-DD (venue/user timezone). */
export function getLocalTodayIsoDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isValidIsoDate(isoDate: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(isoDate);
}

/** True when the date is after today (entries cannot be created for future days). */
export function isFutureSalesEntryDate(
  isoDate: string,
  todayIso = getLocalTodayIsoDate(),
): boolean {
  return isValidIsoDate(isoDate) && isoDate > todayIso;
}

export const FUTURE_SALES_ENTRY_ERROR =
  "Entries cannot be created for a future date.";

/** Server/client guard when inserting a new dated sales entry. */
export function salesEntryCreateDateError(
  saleDate: string,
  isCreate: boolean,
): string | null {
  if (!isCreate) return null;
  if (isFutureSalesEntryDate(saleDate)) {
    return FUTURE_SALES_ENTRY_ERROR;
  }
  return null;
}

export function canCreateSalesEntryForDate(
  saleDate: string,
  isExisting: boolean,
): boolean {
  return isExisting || !isFutureSalesEntryDate(saleDate);
}
