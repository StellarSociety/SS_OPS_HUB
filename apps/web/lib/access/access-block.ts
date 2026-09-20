const VENUE_TZ = "Asia/Dubai";

/** Calendar date in the venue timezone as `YYYY-MM-DD`. */
export function todayIsoInVenueTz(asOf: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: VENUE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(asOf);
}

export function isAccessBlockDue(
  until: string | null | undefined,
  asOf: Date = new Date(),
): boolean {
  const iso = until?.trim().slice(0, 10) ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  return iso <= todayIsoInVenueTz(asOf);
}
