"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { MONTH_LABELS, weeksInMonth } from "@/lib/sales/cos-calculations";
import type { CosDailySalesRow } from "@/lib/sales/cos-sales-data";
import { COST_CENTRE_LABELS, type CostCentre } from "@/lib/sales/cos-types";
import { formatMoney } from "@/lib/sales/daily-sales-calculations";
import { cn } from "@/lib/utils";

export type CosSalesScope = "week" | "month" | "range";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** ISO date → DD/MM/YY. */
function ddmmyy(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

function weekday(iso: string): string {
  return WEEKDAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()];
}

/** a as a % of b, or — when b is zero. */
function pctOf(a: number, b: number): string {
  return b > 0 ? `${((a / b) * 100).toFixed(1)}%` : "—";
}

type DisplayRow = {
  key: string;
  label: string;
  sublabel: string | null;
  weekLabel: string | null;
  isToday: boolean;
  /** Daily: past day without a sales entry. Weekly: count of such days. */
  missingDays: number;
  hasSales: boolean;
  restaurant: number;
  sales: number;
  totalDiscount: number;
  discount: number;
};

const numCell = "px-3 py-2 text-right tabular-nums";
/** Number cell that carries a % right after it (no gap on the right). */
const numWithPct = "py-2 pl-3 pr-1.5 text-right tabular-nums";
/** The % reads as part of the number on its left, not as its own column. */
const pctCell =
  "whitespace-nowrap py-2 pl-0 pr-4 text-left tabular-nums text-[11px] text-black/45";
const pctHead = "py-2 pl-0 pr-4";
const headWithPct = "py-2 pl-3 pr-1.5 text-right";

const selectClass =
  "rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-[#3D421F]";

export function CosSalesDiscountsTable({
  centre,
  scope,
  fiscalYear,
  weekNo,
  monthIndex,
  from,
  to,
  today,
  weeks,
  rows,
  totalTaxPct,
}: {
  centre: CostCentre;
  scope: CosSalesScope;
  fiscalYear: number;
  weekNo: number;
  monthIndex: number;
  from: string;
  to: string;
  today: string;
  weeks: { weekNo: number; start: string; end: string }[];
  rows: CosDailySalesRow[];
  totalTaxPct: number;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [rangeFrom, setRangeFrom] = useState(from);
  const [rangeTo, setRangeTo] = useState(to);
  const label = COST_CENTRE_LABELS[centre];

  function setParams(patch: Record<string, string | null>) {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v == null) next.delete(k);
      else next.set(k, v);
    }
    router.push(`?${next.toString()}`);
  }

  const weekOf = (date: string) =>
    weeks.find((w) => date >= w.start && date <= w.end)?.weekNo ?? null;

  // Today's figures are usually entered after close, so only past days count as missing.
  const isMissing = (r: CosDailySalesRow) => !r.hasSales && r.date < today;

  const dailyRows: DisplayRow[] = rows.map((r) => {
    const wk = weekOf(r.date);
    return {
      key: r.date,
      label: `${weekday(r.date)} ${ddmmyy(r.date)}`,
      sublabel: null,
      weekLabel: wk ? `W${wk}` : null,
      isToday: r.date === today,
      missingDays: isMissing(r) ? 1 : 0,
      hasSales: r.hasSales,
      restaurant: r.restaurantSalesNet,
      sales: r.centreSalesNet,
      totalDiscount: r.totalDiscountNet,
      discount: r.centreDiscountNet,
    };
  });

  // Month view: one row per retail week.
  const weeklyRows: DisplayRow[] = weeks
    .filter((w) => w.end >= from && w.start <= to)
    .map((w) => {
      const days = rows.filter((r) => r.date >= w.start && r.date <= w.end);
      return {
        key: `w${w.weekNo}`,
        label: `W${w.weekNo}`,
        sublabel: `${ddmmyy(w.start)} – ${ddmmyy(w.end)}`,
        weekLabel: null,
        isToday: today >= w.start && today <= w.end,
        missingDays: days.filter(isMissing).length,
        hasSales: days.some((r) => r.hasSales),
        restaurant: days.reduce((s, r) => s + r.restaurantSalesNet, 0),
        sales: days.reduce((s, r) => s + r.centreSalesNet, 0),
        totalDiscount: days.reduce((s, r) => s + r.totalDiscountNet, 0),
        discount: days.reduce((s, r) => s + r.centreDiscountNet, 0),
      };
    });

  const byWeek = scope === "month";
  const displayRows = byWeek ? weeklyRows : dailyRows;

  const totals = rows.reduce(
    (t, r) => ({
      restaurant: t.restaurant + r.restaurantSalesNet,
      sales: t.sales + r.centreSalesNet,
      totalDiscount: t.totalDiscount + r.totalDiscountNet,
      discount: t.discount + r.centreDiscountNet,
    }),
    { restaurant: 0, sales: 0, totalDiscount: 0, discount: 0 },
  );
  const missingPast = rows.filter(isMissing).length;

  const periodLabel =
    scope === "month"
      ? `${MONTH_LABELS[monthIndex]} ${fiscalYear} · W${weeksInMonth(monthIndex)[0]}–W${weeksInMonth(monthIndex).at(-1)}`
      : scope === "range"
        ? `${ddmmyy(from)} to ${ddmmyy(to)}`
        : `W${weekNo} · ${ddmmyy(from)} to ${ddmmyy(to)}`;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card className="flex flex-wrap items-center gap-2 p-3">
        <div className="inline-flex rounded-lg bg-black/[0.04] p-1">
          {(
            [
              ["week", "Week"],
              ["month", "Month"],
              ["range", "Custom"],
            ] as const
          ).map(([value, text]) => (
            <button
              key={value}
              type="button"
              onClick={() =>
                setParams(
                  value === "range"
                    ? { scope: value, from, to }
                    : { scope: value, from: null, to: null },
                )
              }
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-semibold transition",
                scope === value
                  ? "bg-[var(--venue-primary,#818a40)] text-white"
                  : "text-black/60 hover:text-black",
              )}
            >
              {text}
            </button>
          ))}
        </div>

        {scope !== "range" ? (
          <select
            value={fiscalYear}
            onChange={(e) => setParams({ year: e.target.value })}
            className={selectClass}
            aria-label="Year"
          >
            {[fiscalYear - 1, fiscalYear, fiscalYear + 1].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        ) : null}

        {scope === "week" ? (
          <select
            value={weekNo}
            onChange={(e) => setParams({ week: e.target.value })}
            className={selectClass}
            aria-label="Week"
          >
            {weeks.map((w) => (
              <option key={w.weekNo} value={w.weekNo}>
                W{w.weekNo} - {ddmmyy(w.start)} to {ddmmyy(w.end)}
              </option>
            ))}
          </select>
        ) : null}

        {scope === "month" ? (
          <select
            value={monthIndex}
            onChange={(e) => setParams({ month: e.target.value })}
            className={selectClass}
            aria-label="Month"
          >
            {MONTH_LABELS.map((m, i) => (
              <option key={m} value={i}>
                {m}
              </option>
            ))}
          </select>
        ) : null}

        {scope === "range" ? (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (rangeFrom && rangeTo && rangeFrom <= rangeTo) {
                setParams({ scope: "range", from: rangeFrom, to: rangeTo });
              }
            }}
          >
            <input
              type="date"
              value={rangeFrom}
              onChange={(e) => setRangeFrom(e.target.value)}
              className={selectClass}
              aria-label="From"
            />
            <span className="text-sm text-black/45">to</span>
            <input
              type="date"
              value={rangeTo}
              min={rangeFrom}
              onChange={(e) => setRangeTo(e.target.value)}
              className={selectClass}
              aria-label="To"
            />
            <button
              type="submit"
              disabled={!rangeFrom || !rangeTo || rangeFrom > rangeTo}
              className="rounded-lg bg-[var(--venue-primary,#818a40)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              Apply
            </button>
          </form>
        ) : null}

        <span className="ml-auto text-xs text-black/45">
          NET of VAT, municipality fee &amp; service charge (
          {totalTaxPct.toFixed(2)}%)
        </span>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-black/5 p-4">
          <h3 className="font-serif text-lg text-[#3D421F]">{periodLabel}</h3>
          {missingPast > 0 ? (
            <span className="text-xs font-medium text-red-700">
              {missingPast} day{missingPast === 1 ? "" : "s"} without a Revenue
              sales entry
            </span>
          ) : null}
        </div>
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-[var(--venue-secondary,#F0F3DD)]">
              <tr className="border-b border-black/10 text-xs font-bold uppercase tracking-wide text-black">
                <th className="px-3 py-2 text-left">
                  {byWeek ? "Week" : "Date"}
                </th>
                {byWeek ? null : <th className="px-3 py-2 text-left">Wk</th>}
                <th className="px-3 py-2 text-right">Restaurant sales</th>
                <th
                  className={headWithPct}
                  title={`% = ${label} sales ÷ restaurant sales`}
                >
                  {label} sales
                </th>
                <th className={pctHead} aria-hidden />
                <th
                  className={headWithPct}
                  title="% = total discounts ÷ restaurant sales"
                >
                  Total discounts
                </th>
                <th className={pctHead} aria-hidden />
                <th
                  className={headWithPct}
                  title={`% = ${label} discounts ÷ total discounts`}
                >
                  {label} discounts
                </th>
                <th className={pctHead} aria-hidden />
              </tr>
            </thead>
            <tbody>
              {displayRows.map((r) => {
                const missingDay = !byWeek && r.missingDays > 0;
                return (
                  <tr
                    key={r.key}
                    className={cn(
                      "border-b border-black/5",
                      missingDay && "bg-red-50/60",
                      r.isToday && "bg-[var(--venue-secondary,#F0F3DD)]/40",
                    )}
                  >
                    <td className="whitespace-nowrap px-3 py-2 text-left">
                      <span className="font-medium text-[#3D421F]">
                        {r.label}
                      </span>
                      {r.isToday && !byWeek ? (
                        <span className="ml-2 text-[10px] font-semibold uppercase text-[var(--venue-primary,#818a40)]">
                          Today
                        </span>
                      ) : null}
                      {r.sublabel ? (
                        <div className="text-[11px] text-black/45">
                          {r.sublabel}
                          {byWeek && r.missingDays > 0 ? (
                            <span className="ml-1.5 text-red-700">
                              · {r.missingDays} day
                              {r.missingDays === 1 ? "" : "s"} missing
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </td>
                    {byWeek ? null : (
                      <td className="px-3 py-2 text-left text-black/50">
                        {r.weekLabel ?? "—"}
                      </td>
                    )}
                    {r.hasSales ? (
                      <>
                        <td className={numCell}>{formatMoney(r.restaurant)}</td>
                        <td className={numWithPct}>{formatMoney(r.sales)}</td>
                        <td className={pctCell}>
                          {pctOf(r.sales, r.restaurant)}
                        </td>
                        <td className={numWithPct}>
                          {formatMoney(r.totalDiscount)}
                        </td>
                        <td className={pctCell}>
                          {pctOf(r.totalDiscount, r.restaurant)}
                        </td>
                        <td className={numWithPct}>
                          {formatMoney(r.discount)}
                        </td>
                        <td className={pctCell}>
                          {pctOf(r.discount, r.totalDiscount)}
                        </td>
                      </>
                    ) : (
                      <td
                        colSpan={7}
                        className={cn(
                          "px-3 py-2 text-right text-xs",
                          r.missingDays > 0 ? "text-red-700" : "text-black/35",
                        )}
                      >
                        {r.missingDays > 0 ? "No sales entry" : "—"}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-black/15 bg-black/[0.03] font-semibold text-[#3D421F]">
                <td className="px-3 py-2 text-left" colSpan={byWeek ? 1 : 2}>
                  Total · {rows.length} day{rows.length === 1 ? "" : "s"}
                </td>
                <td className={numCell}>{formatMoney(totals.restaurant)}</td>
                <td className={numWithPct}>{formatMoney(totals.sales)}</td>
                <td className={pctCell}>
                  {pctOf(totals.sales, totals.restaurant)}
                </td>
                <td className={numWithPct}>
                  {formatMoney(totals.totalDiscount)}
                </td>
                <td className={pctCell}>
                  {pctOf(totals.totalDiscount, totals.restaurant)}
                </td>
                <td className={numWithPct}>{formatMoney(totals.discount)}</td>
                <td className={pctCell}>
                  {pctOf(totals.discount, totals.totalDiscount)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </div>
  );
}
