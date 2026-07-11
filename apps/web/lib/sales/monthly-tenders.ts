import type { VenueWaiterDailySalesEntry } from "./waiter-sales-types";
import type { VenueTender } from "./tenders-types";

export type MonthlyTenderSlice = {
  tenderId: string;
  name: string;
  totalGs: number;
  pct: number;
};

export function buildMonthlyTendersMtd(
  waiterRecords: VenueWaiterDailySalesEntry[],
  tenders: VenueTender[],
  currentMonthKey: string,
  mtdDay: number,
): { slices: MonthlyTenderSlice[]; total: number } {
  const totals = new Map<string, number>();

  for (const record of waiterRecords) {
    if (!record.sale_date.startsWith(currentMonthKey)) continue;
    const day = Number(record.sale_date.slice(8, 10));
    if (day < 1 || day > mtdDay) continue;
    for (const [tenderId, amount] of Object.entries(
      record.tender_amounts ?? {},
    )) {
      totals.set(tenderId, (totals.get(tenderId) ?? 0) + Number(amount));
    }
  }

  const total = Array.from(totals.values()).reduce((sum, value) => sum + value, 0);
  const nameById = new Map(tenders.map((tender) => [tender.id, tender.name]));

  const slices: MonthlyTenderSlice[] = [];
  const seen = new Set<string>();

  for (const tender of tenders) {
    const value = totals.get(tender.id) ?? 0;
    if (value <= 0) continue;
    slices.push({
      tenderId: tender.id,
      name: tender.name,
      totalGs: value,
      pct: total > 0 ? (value / total) * 100 : 0,
    });
    seen.add(tender.id);
  }

  for (const [tenderId, value] of totals) {
    if (seen.has(tenderId) || value <= 0) continue;
    slices.push({
      tenderId,
      name: nameById.get(tenderId) ?? "Other",
      totalGs: value,
      pct: total > 0 ? (value / total) * 100 : 0,
    });
  }

  slices.sort((a, b) => b.totalGs - a.totalGs);

  return { slices, total };
}
