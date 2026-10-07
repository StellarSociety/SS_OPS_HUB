"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Pencil, CheckCircle2, Clock, Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  MONTH_SHORT,
  MONTH_START_WEEK,
  MONTH_WEEK_COUNTS,
  TOTAL_WEEKS,
  monthIndexForWeek,
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
  canEdit: boolean;
};

const AED = (n: number) =>
  n.toLocaleString("en-AE", { maximumFractionDigits: 0 });
const PCT = (n: number | null) => (n == null ? "—" : `${n.toFixed(1)}%`);

const healthClass: Record<CostHealth, string> = {
  good: "text-emerald-700",
  warn: "text-amber-600",
  bad: "text-red-600",
  none: "text-black/40",
};

type GridRow =
  | { kind: "month"; monthIndex: number }
  | { kind: "mtd"; monthIndex: number }
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
  canEdit,
}: Props) {
  const [showAllWeeks, setShowAllWeeks] = useState(false);

  const runByWeek = useMemo(() => {
    const m = new Map<number, VenueCosRunWithAdjustments>();
    for (const r of runs) m.set(r.week_no, r);
    return m;
  }, [runs]);

  // Determine how many weeks to display: through the latest entered week,
  // unless "show all 52" is toggled.
  const lastEnteredWeek = runs.reduce((max, r) => Math.max(max, r.week_no), 0);
  const throughWeek = showAllWeeks
    ? TOTAL_WEEKS
    : Math.max(lastEnteredWeek, Math.min(lastEnteredWeek + 1, TOTAL_WEEKS)) ||
      0;

  const gridRows = useMemo<GridRow[]>(() => {
    const rows: GridRow[] = [];
    if (throughWeek === 0) return rows;
    let currentMonth = -1;
    for (let w = 1; w <= throughWeek; w++) {
      const mi = monthIndexForWeek(w);
      if (mi !== currentMonth) {
        if (currentMonth !== -1) rows.push({ kind: "mtd", monthIndex: currentMonth });
        currentMonth = mi;
        rows.push({ kind: "month", monthIndex: mi });
      }
      rows.push({ kind: "week", weekNo: w, run: runByWeek.get(w) ?? null });
      if (w === throughWeek) rows.push({ kind: "mtd", monthIndex: currentMonth });
    }
    return rows;
  }, [throughWeek, runByWeek]);

  function monthTotals(monthIndex: number) {
    const start = MONTH_START_WEEK[monthIndex];
    const count = MONTH_WEEK_COUNTS[monthIndex];
    const weeks = Array.from({ length: count }, (_, i) => start + i);
    let sales = 0;
    let discount = 0;
    let purchases = 0;
    let adj = 0;
    let cos = 0;
    for (const w of weeks) {
      const run = runByWeek.get(w);
      if (!run) continue;
      const d = deriveCosRunWithAdjustments(run);
      sales += d.sales;
      discount += run.sales_discount_gs;
      purchases += d.purchases;
      adj += d.adjustmentsTotal;
      cos += d.costOfSales;
    }
    const costPct = sales > 0 ? (cos / sales) * 100 : null;
    return { sales, discount, purchases, adj, cos, costPct };
  }

  const base = `/gp-cos/${costCentre}`;

  return (
    <Card className="overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/5 p-4">
        <div className="text-sm text-black/60">
          Target cost{" "}
          <span className="font-semibold text-[#3D421F]">{targetCostPct}%</span>
          {lastEnteredWeek > 0 ? (
            <>
              {" "}
              · <span>{runs.length} week{runs.length === 1 ? "" : "s"} entered</span>
            </>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAllWeeks((v) => !v)}
            className="rounded-lg border border-black/10 bg-white px-3 py-2 text-xs font-semibold text-[#3D421F] hover:bg-black/5"
          >
            {showAllWeeks ? "Show entered only" : "Show all 52 weeks"}
          </button>
          {canEdit ? (
            <Link
              href={`${base}/cost-runs/new?year=${fiscalYear}`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--venue-primary,#818a40)] px-3 py-2 text-xs font-semibold text-white hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> New entry
            </Link>
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
              <th className="px-3 py-2 text-right">Cost %</th>
              <th className="px-3 py-2 text-right">GP %</th>
              <th className="px-3 py-2 text-center">Status</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {gridRows.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-3 py-10 text-center text-black/50">
                  No cost runs yet.{" "}
                  {canEdit ? "Click “New entry” to add the first week." : ""}
                </td>
              </tr>
            ) : (
              gridRows.map((row, i) => {
                if (row.kind === "month") {
                  return (
                    <tr key={`m-${i}`}>
                      <td
                        colSpan={11}
                        className="bg-[var(--venue-primary,#818a40)] px-3 py-1.5 text-left text-xs font-bold uppercase tracking-wide text-white"
                      >
                        {MONTH_SHORT[row.monthIndex]} {fiscalYear}
                      </td>
                    </tr>
                  );
                }
                if (row.kind === "mtd") {
                  const t = monthTotals(row.monthIndex);
                  const h = costHealth(t.costPct, targetCostPct);
                  const gpPct = t.sales > 0 ? 100 - (t.costPct ?? 0) : null;
                  return (
                    <tr key={`t-${i}`} className="bg-[var(--venue-secondary,#F0F3DD)]/40 font-semibold">
                      <td className="px-3 py-2 text-left" colSpan={2}>
                        {MONTH_SHORT[row.monthIndex]} month-to-date
                      </td>
                      <td className="px-3 py-2 text-right">{AED(t.sales + 0)}</td>
                      <td className="px-3 py-2 text-right">{AED(t.sales)}</td>
                      <td className="px-3 py-2 text-right">{AED(t.discount)}</td>
                      <td className="px-3 py-2 text-right">{AED(t.adj)}</td>
                      <td className="px-3 py-2 text-right">{AED(t.cos)}</td>
                      <td className={`px-3 py-2 text-right ${healthClass[h]}`}>
                        {PCT(t.costPct)}
                      </td>
                      <td className={`px-3 py-2 text-right ${healthClass[h]}`}>
                        {PCT(gpPct)}
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
                      <td className="px-3 py-2 text-left text-red-600" colSpan={8}>
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
                const h = costHealth(d.costPct, targetCostPct);
                return (
                  <tr key={`w-${weekNo}`} className="border-b border-black/5 hover:bg-black/[0.02]">
                    <td className="px-3 py-2 text-left font-medium">{weekNo}</td>
                    <td className="px-3 py-2 text-left text-black/60">
                      {fmtRange(run.week_start, run.week_end)}
                    </td>
                    <td className="px-3 py-2 text-right">{AED(run.restaurant_sales_gs)}</td>
                    <td className="px-3 py-2 text-right">{AED(d.sales)}</td>
                    <td className="px-3 py-2 text-right">{AED(run.sales_discount_gs)}</td>
                    <td className="px-3 py-2 text-right">{AED(d.adjustmentsTotal)}</td>
                    <td className="px-3 py-2 text-right">{AED(d.costOfSales)}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${healthClass[h]}`}>
                      {PCT(d.costPct)}
                    </td>
                    <td className={`px-3 py-2 text-right ${healthClass[h]}`}>
                      {PCT(d.gpPct)}
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
    </Card>
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
