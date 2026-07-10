import { LOCALE } from "./locale";

export function formatDateTime(
  value: string | Date,
  options?: Intl.DateTimeFormatOptions,
) {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(LOCALE.language, {
    timeZone: LOCALE.timezone,
    dateStyle: "medium",
    timeStyle: "short",
    ...options,
  }).format(date);
}

export function formatCurrency(amountMinor: number) {
  return new Intl.NumberFormat(LOCALE.language, {
    style: "currency",
    currency: LOCALE.currency,
  }).format(amountMinor / 100);
}
