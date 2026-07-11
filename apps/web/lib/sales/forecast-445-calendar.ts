/** Retail 4-4-5 week counts by calendar month (Jan = index 0). */
export const FOUR_FOUR_FIVE_WEEK_COUNTS = [4, 4, 5, 4, 4, 5, 4, 4, 5, 4, 4, 5] as const;

export function get445WeekCountForMonth(monthIndex: number): number {
  return FOUR_FOUR_FIVE_WEEK_COUNTS[monthIndex] ?? 4;
}

export function get445WeekCountForMonthKey(monthKey: string): number {
  const monthIndex = Number(monthKey.split("-")[1]) - 1;
  return get445WeekCountForMonth(monthIndex);
}

export function total445WeeksInYear(): number {
  return FOUR_FOUR_FIVE_WEEK_COUNTS.reduce((sum, count) => sum + count, 0);
}
