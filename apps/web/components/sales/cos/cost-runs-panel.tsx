"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Pencil, CheckCircle2, Clock, Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  CostRunWeekPickerDialog,
  type CosWeekRange,
} from "@/components/sales/cos/cost-run-week-picker-dialog";
import {
  MONTH_LABELS,
  MONTH_START_WEEK,
  MONTH_WEEK_COUNTS,
  TOTAL_WEEKS,
  monthIndexForWeek,
  weeksInMonth,
  deriveCosRunWithAdjustments,
  costHealth,
  type CostHealth,
} from "@/lib/sales/cos-calculations";
import type {
  CostCentre,
  VenueCosRunWithAdjustments,
} from "@/lib/sales/cos-types";

type Props = {
  costCentre: CostCentre;
  fiscalYear: number;
  runs: VenueCosRunWithAdjustments[];
  targetCostPct: number;
  /** Effective target cost % per retail month (index 0 = January). */
  targetByMonth: number[];
  canEdit: boolean;
  /** Retail week dates for the fiscal year (index = week − 1). */
  weekRanges: CosWeekRange[];
  today: string;
  todayWeek: number;
};

const AED = (n: number) =>
  n.toLocaleString("en-AE", { maximumFractionDigits: 0 });
const PCT = (n: number | null) => (n == null ? "—" : `${n.toFixed(1)}%`);
/** Accounting style: 2 decimals, negatives in brackets, zero as a dash. */
const ACC = (n: number) => {
  if (Math.abs(n) < 0.005) return "-";
  const s = Math.abs(n).toLocaleString("en-AE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return n < 0 ? `(${s})` : s;
};

const healthClass: Record<CostHealth, string> = {
  good: "text-emerald-700",
  warn: "text-amber-600",
  bad: "text-red-600",
  none: "text-black/40",
};

type ViewScope = "recent" | "month" | "week" | "year";

const SCOPES: { value: ViewScope; label: string }[] = [
  { value: "recent", label: "Recent" },
  { value: "month", label: "Month" },
  { value: "week", label: "Week" },
  { value: "year", label: "Full year" },
];

const filterSelectClass =
  "rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-[#3D421F]";

function ddmmyy(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

type GridRow =
  | { kind: "month"; monthIndex: number }
  | {
      kind: "week";
      weekNo: number;
      run: VenueCosRunWithAdjustments | null;
    };

export function CostRunsPanel({
  costCentre,
  fiscalYear,
  runs,
  targetCostPct,
  targetByMonth,
  canEdit,
  weekRanges,
  today,
  todayWeek,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentMonth = monthIndexForWeek(todayWeek);
  const [scope, setScope] = useState<ViewScope>("recent");
  const [selMonth, setSelMonth] = useState(currentMonth);
  const [selWeek, setSelWeek] = useState(todayWeek);
  const [pickerOpen, setPickerOpen] = useState(false);

  const runByWeek = useMemo(() => {
    const m = new Map<number, VenueCosRunWithAdjustments>();
    for (const r of runs) m.set(r.week_no, r);
    return m;
  }, [runs]);

  // Weeks that haven't started yet only appear once they have a run.
  const isListed = (w: number) =>
    runByWeek.has(w) || (weekRanges[w - 1]?.start ?? "") <= today;

  function weeksInScope(): number[] {
    const all = Array.from({ length: TOTAL_WEEKS }, (_, i) => i + 1);
    if (scope === "week") return [selWeek];
    if (scope === "month") return weeksInMonth(selMonth).filter(isListed);
    if (scope === "year") return all.filter(isListed);
    // Recent: current month and the previous one.
    const months = new Set([currentMonth, Math.max(0, currentMonth - 1)]);
    return all.filter((w) => months.has(monthIndexForWeek(w)) && isListed(w));
  }

  // Newest first: months descending (totals on the month row), weeks descending.
  const gridRows: GridRow[] = [];
  const visible = weeksInScope().sort((a, b) => b - a);
  let openMonth = -1;
  for (const w of visible) {
    const mi = monthIndexForWeek(w);
    if (mi !== openMonth) {
      openMonth = mi;
      gridRows.push({ kind: "month", monthIndex: mi });
    }
    gridRows.push({ kind: "week", weekNo: w, run: runByWeek.get(w) ?? null });
  }

  function changeYear(year: string) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("year", year);
    router.push(`?${next.toString()}`);
  }

  function monthTotals(monthIndex: number) {
    const start = MONTH_START_WEEK[monthIndex];
    const count = MONTH_WEEK_COUNTS[monthIndex];
    const weeks = Array.from({ length: count }, (_, i) => start + i);
    let restaurant = 0;
    let sales = 0;
    let discount = 0;
    let purchases = 0;
    let adj = 0;
    let cos = 0;
    for (const w of weeks) {
      const run = runByWeek.get(w);
      if (!run) continue;
      const d = deriveCosRunWithAdjustments(run);
      restaurant += Number(run.restaurant_sales_gs) || 0;
      sales += d.sales;
      discount += run.sales_discount_gs;
      purchases += d.purchases;
      adj += d.adjustmentsTotal;
      cos += d.costOfSales;
    }
    const costPct = sales > 0 ? (cos / sales) * 100 : null;
    return { restaurant, sales, discount, purchases, adj, cos, costPct };
  }

  const base = `/gp-cos/${costCentre}`;

  return (
    <Card className="overflow-hidden">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-black/5 p-3">
        <div className="inline-flex rounded-lg bg-black/[0.04] p-1">
          {SCOPES.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setScope(s.value)}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                scope === s.value
                  ? "bg-[var(--venue-primary,#818a40)] text-white"
                  : "text-black/60 hover:text-black"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <select
          value={fiscalYear}
          onChange={(e) => changeYear(e.target.value)}
          className={filterSelectClass}
          aria-label="Year"
        >
          {[fiscalYear - 1, fiscalYear, fiscalYear + 1].map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>

        {scope === "month" ? (
          <select
            value={selMonth}
            onChange={(e) => setSelMonth(Number(e.target.value))}
            className={filterSelectClass}
            aria-label="Month"
          >
            {MONTH_LABELS.map((m, i) => (
              <option key={m} value={i}>
                {m}
              </option>
            ))}
          </select>
        ) : null}

        {scope === "week" ? (
          <select
            value={selWeek}
            onChange={(e) => setSelWeek(Number(e.target.value))}
            className={filterSelectClass}
            aria-label="Week"
          >
            {weekRanges.map((w) => (
              <option key={w.weekNo} value={w.weekNo}>
                W{w.weekNo} - {ddmmyy(w.start)} to {ddmmyy(w.end)}
                {runByWeek.has(w.weekNo) ? " ✓" : ""}
              </option>
            ))}
          </select>
        ) : null}

        <div className="ml-auto flex items-center gap-3">
          <div className="text-sm text-black/60">
            {runs.length > 0 ? (
              <span>
                {runs.length} week{runs.length === 1 ? "" : "s"} entered
              </span>
            ) : null}
          </div>
          {canEdit ? (
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--venue-primary,#818a40)] px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> New entry
            </button>
          ) : null}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-black/10 bg-[var(--venue-secondary,#F0F3DD)]/50 text-xs font-bold uppercase tracking-wide text-black">
              <th className="px-3 py-2 text-left">Wk</th>
              <th className="px-3 py-2 text-left">Dates</th>
              <th className="px-3 py-2 text-right">R. Sales</th>
              <th className="px-3 py-2 text-right">{labelFor(costCentre)} Sales</th>
              <th className="px-3 py-2 text-right">Discount</th>
              <th className="px-3 py-2 text-right">Adjust</th>
              <th className="px-3 py-2 text-right">Cost of Sales</th>
              <th className="px-3 py-2 text-right">GP %</th>
              <th className="px-3 py-2 text-right">Cost %</th>
              <th className="px-3 py-2 text-center">Status</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {gridRows.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-3 py-10 text-center text-black/50">
                  No weeks in this period yet.
                </td>
              </tr>
            ) : (
              gridRows.map((row, i) => {
                if (row.kind === "month") {
                  // Month band carries the month's totals (weeks with a run).
                  const t = monthTotals(row.monthIndex);
                  const gpPct = t.sales > 0 ? 100 - (t.costPct ?? 0) : null;
                  const total = "px-3 py-2 text-right tabular-nums";
                  const num = "underline underline-offset-2";
                  return (
                    <tr
                      key={`m-${i}`}
                      className="bg-[var(--venue-primary,#818a40)] text-sm font-bold text-white"
                    >
                      <td
                        colSpan={2}
                        className="px-3 py-2 text-left uppercase tracking-wide"
                      >
                        {MONTH_LABELS[row.monthIndex].toUpperCase()} {fiscalYear}
                      </td>
                      <td className={total}>
                        <span className={num}>{ACC(t.restaurant)}</span>
                      </td>
                      <td className={total}>
                        <span className={num}>{ACC(t.sales)}</span>
                        <ShareOf part={t.sales} whole={t.restaurant} />
                      </td>
                      <td className={total}>
                        <span className={num}>{ACC(t.discount)}</span>
                        <ShareOf part={t.discount} whole={t.restaurant} />
                      </td>
                      <td className={total}>
                        <span className={num}>{ACC(t.adj)}</span>
                      </td>
                      <td className={total}>
                        <span className={num}>{ACC(t.cos)}</span>
                      </td>
                      <td className={total}>
                        <span className={num}>{PCT(gpPct)}</span>
                      </td>
                      <td className={total}>
                        <span className={num}>{PCT(t.costPct)}</span>
                      </td>
                      <td colSpan={2} />
                    </tr>
                  );
                }

                // week row
                const { weekNo, run } = row;
                if (!run) {
                  // Missing entry → red-highlighted row
                  return (
                    <tr key={`w-${weekNo}`} className="bg-red-50">
                      <td className="px-3 py-2 text-left font-medium text-red-700">
                        {weekNo}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-left text-red-600/80">
                        {fmtRange(
                          weekRanges[weekNo - 1]?.start ?? null,
                          weekRanges[weekNo - 1]?.end ?? null,
                        )}
                      </td>
                      <td className="px-3 py-2 text-left text-red-600" colSpan={7}>
                        No entry for this week
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                          Missing
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {canEdit ? (
                          <Link
                            href={`${base}/cost-runs/new?year=${fiscalYear}&week=${weekNo}`}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--venue-primary,#818a40)] hover:underline"
                          >
                            <Plus className="h-3.5 w-3.5" /> Add
                          </Link>
                        ) : null}
                      </td>
                    </tr>
                  );
                }

                const d = deriveCosRunWithAdjustments(run);
                const h = costHealth(
                  d.costPct,
                  targetByMonth[monthIndexForWeek(weekNo)] ?? targetCostPct,
                );
                return (
                  <tr key={`w-${weekNo}`} className="border-b border-black/5 hover:bg-black/[0.02]">
                    <td className="px-3 py-2 text-left font-medium">{weekNo}</td>
                    <td className="px-3 py-2 text-left text-black/60">
                      {fmtRange(run.week_start, run.week_end)}
                    </td>
                    <td className="px-3 py-2 text-right">{AED(run.restaurant_sales_gs)}</td>
                    <td className="px-3 py-2 text-right">
                      {AED(d.sales)}
                      <ShareOf part={d.sales} whole={run.restaurant_sales_gs} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      {AED(run.sales_discount_gs)}
                      <ShareOf
                        part={run.sales_discount_gs}
                        whole={run.restaurant_sales_gs}
                      />
                    </td>
                    <td className="px-3 py-2 text-right">{AED(d.adjustmentsTotal)}</td>
                    <td className="px-3 py-2 text-right">{AED(d.costOfSales)}</td>
                    <td className={`px-3 py-2 text-right ${healthClass[h]}`}>
                      {PCT(d.gpPct)}
                    </td>
                    <td className={`px-3 py-2 text-right font-semibold ${healthClass[h]}`}>
                      {PCT(d.costPct)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <StatusBadge status={run.status} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`${base}/cost-runs/${run.id}`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--venue-primary,#818a40)] hover:underline"
                      >
                        {run.status === "approved" ? (
                          <>View</>
                        ) : (
                          <>
                            <Pencil className="h-3.5 w-3.5" /> Edit
                          </>
                        )}
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {pickerOpen ? (
        <CostRunWeekPickerDialog
          costCentre={costCentre}
          fiscalYear={fiscalYear}
          runByWeek={runByWeek}
          weekRanges={weekRanges}
          today={today}
          todayWeek={todayWeek}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
    </Card>
  );
}

/** Small % of `whole`, attached to the right of the value it describes. */
function ShareOf({ part, whole }: { part: number; whole: number }) {
  const w = Number(whole) || 0;
  return (
    <span className="ml-1.5 inline-block w-11 text-left text-[10px] font-normal tabular-nums opacity-70">
      {w > 0 ? `${((Number(part) / w) * 100).toFixed(1)}%` : "—"}
    </span>
  );
}

function StatusBadge({
  status,
}: {
  status: "draft" | "pending_approval" | "approved";
}) {
  if (status === "approved") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
        <Lock className="h-3 w-3" /> Approved
      </span>
    );
  }
  if (status === "pending_approval") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
        <Clock className="h-3 w-3" /> Pending
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-black/5 px-2 py-0.5 text-xs font-semibold text-black/60">
      <CheckCircle2 className="h-3 w-3" /> Draft
    </span>
  );
}

function labelFor(centre: CostCentre): string {
  return { food: "Food", beverage: "Bev", wine: "Wine", other: "Other" }[centre];
}

function fmtRange(start: string | null, end: string | null): string {
  if (!start) return "—";
  const s = new Date(`${start}T00:00:00`);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  if (!end) return fmt(s);
  return `${fmt(s)} – ${fmt(new Date(`${end}T00:00:00`))}`;
}
