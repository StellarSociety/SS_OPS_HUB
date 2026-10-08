import type { SupabaseClient } from "@supabase/supabase-js";
import { autoDiscountAdjustment } from "@/lib/sales/cos-calculations";
import { cosWeekRange } from "@/lib/sales/cos-overview-data";
import { getCosLedgerPurchases } from "@/lib/sales/cos-purchases-data";
import { getCosDailySales } from "@/lib/sales/cos-sales-data";
import { getVenueCosSettings, listCosTransfers } from "@/lib/sales/cos-store";
import {
  COST_CENTRE_LABELS,
  DEFAULT_AUTO_ADJUSTMENT_PCT,
  type CostCentre,
  type VenueCosRunWithAdjustments,
  type VenueCosTransfer,
} from "@/lib/sales/cos-types";

/** What a cost run's computed figures should be right now for one week. */
export type CosLiveWeek = {
  weekNo: number;
  start: string;
  end: string;
  restaurantSales: number;
  sales: number;
  discount: number;
  /** Accounts ledger purchases; null when the centre has no linked ledgers. */
  purchases: number | null;
  autoAdjustment: number;
  autoAdjustmentReason: string;
  transfers: { reason: string; amount_gs: number }[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const same = (a: number, b: number) =>
  Math.abs((Number(a) || 0) - (Number(b) || 0)) < 0.01;

/** Transfers in/out of a centre in a date range, signed for that centre. */
export function transferAdjustmentsFor(
  transfers: VenueCosTransfer[],
  centre: CostCentre,
  from: string,
  to: string,
): { reason: string; amount_gs: number }[] {
  const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  return transfers
    .filter((t) => t.transfer_date >= from && t.transfer_date <= to)
    .filter((t) => t.to_centre === centre || t.from_centre === centre)
    .map((t) =>
      t.to_centre === centre
        ? {
            reason: `Transfer in from ${COST_CENTRE_LABELS[t.from_centre]} (${ddmm(t.transfer_date)})${t.note ? ` — ${t.note}` : ""}`,
            amount_gs: t.amount_net,
          }
        : {
            reason: `Transfer out to ${COST_CENTRE_LABELS[t.to_centre]} (${ddmm(t.transfer_date)})${t.note ? ` — ${t.note}` : ""}`,
            amount_gs: -t.amount_net,
          },
    );
}

/**
 * Live figures for weeks firstWeek..lastWeek of a fiscal year: Revenue sales and
 * discounts, Accounts ledger purchases, auto adjustment and transfers.
 * One pass over the year rather than a query per week.
 */
export async function getCosLiveWeeks(
  supabase: SupabaseClient,
  venueId: string,
  centre: CostCentre,
  fiscalYear: number,
  lastWeek: number,
  firstWeek = 1,
): Promise<Map<number, CosLiveWeek>> {
  const weeks = new Map<number, CosLiveWeek>();
  if (lastWeek < firstWeek) return weeks;
  const from = cosWeekRange(fiscalYear, firstWeek).start;
  const to = cosWeekRange(fiscalYear, lastWeek).end;

  const settings = await getVenueCosSettings(supabase, venueId, centre);
  const autoPct =
    settings?.auto_adjustment_pct ?? DEFAULT_AUTO_ADJUSTMENT_PCT[centre];
  const ledgerIds = settings?.ledger_account_ids ?? [];
  const [daily, ledgerLines, transfers] = await Promise.all([
    getCosDailySales(supabase, venueId, centre, from, to),
    ledgerIds.length
      ? getCosLedgerPurchases(venueId, ledgerIds, from, to)
      : Promise.resolve(null),
    listCosTransfers(supabase, venueId, { from, to }),
  ]);

  const label = COST_CENTRE_LABELS[centre].toLowerCase();
  for (let weekNo = firstWeek; weekNo <= lastWeek; weekNo++) {
    const { start, end } = cosWeekRange(fiscalYear, weekNo);
    const days = daily.rows.filter((r) => r.date >= start && r.date <= end);
    const discount = round2(
      days.reduce((s, r) => s + (r.centreDiscountNet ?? 0), 0),
    );
    weeks.set(weekNo, {
      weekNo,
      start,
      end,
      restaurantSales: round2(days.reduce((s, r) => s + r.restaurantSalesNet, 0)),
      sales: round2(days.reduce((s, r) => s + r.centreSalesNet, 0)),
      discount,
      purchases: ledgerLines
        ? round2(
            ledgerLines
              .filter((l) => l.date >= start && l.date <= end)
              .reduce((s, l) => s + l.net, 0),
          )
        : null,
      autoAdjustment: round2(autoDiscountAdjustment(discount, autoPct)),
      autoAdjustmentReason: `Auto adjustment (${autoPct}% of ${label} net discounts)`,
      transfers: transferAdjustmentsFor(transfers, centre, start, end),
    });
  }
  return weeks;
}

/** True when a run's computed figures no longer match the live ones. */
export function isCosRunStale(
  run: VenueCosRunWithAdjustments,
  live: CosLiveWeek | undefined,
): boolean {
  if (!live) return false;
  const sumBy = (source: string) =>
    run.adjustments
      .filter((a) => a.source === source)
      .reduce((s, a) => s + (Number(a.amount_gs) || 0), 0);
  return !(
    same(run.restaurant_sales_gs, live.restaurantSales) &&
    same(run.sales_gs, live.sales) &&
    same(run.sales_discount_gs, live.discount) &&
    (live.purchases == null || same(run.purchases_gs, live.purchases)) &&
    same(sumBy("auto_discount"), live.autoAdjustment) &&
    same(
      sumBy("transfer"),
      live.transfers.reduce((s, t) => s + t.amount_gs, 0),
    )
  );
}
