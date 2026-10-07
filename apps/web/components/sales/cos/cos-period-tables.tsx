"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, X } from "lucide-react";
import { ScopedLink } from "@/components/layout/scoped-link";
import { Card } from "@/components/ui/card";
import { MONTH_LABELS, MONTH_SHORT } from "@/lib/sales/cos-calculations";
import type {
  CentreTotals,
  CentreWeekDetail,
  CosOverviewData,
} from "@/lib/sales/cos-overview-data";
import {
  COST_CENTRES,
  COST_CENTRE_LABELS,
  type CosRunStatus,
  type CostCentre,
} from "@/lib/sales/cos-types";
import { cn } from "@/lib/utils";

const AED = (n: number) =>
  n.toLocaleString("en-AE", { maximumFractionDigits: 0 });
const PCT = (n: number | null) => (n == null ? "—" : `${n.toFixed(1)}%`);
const pct = (cos: number, sales: number) =>
  sales > 0 ? (cos / sales) * 100 : null;

/**
 * "Adjustments" as shown on the overview: everything between purchases and
 * cost of sales, i.e. (opening − closing stock) + run adjustments
 * (additions − deductions). Purchases + net adjustments = cost of sales.
 */
const netAdjustments = (stockMovement: number, adjustments: number) =>
  stockMovement + adjustments;

type Metric = "sales" | "purchases" | "adjustments" | "costOfSales" | "costPct";

const METRICS: { key: Metric; label: string }[] = [
  { key: "sales", label: "Sales" },
  { key: "purchases", label: "Purchases" },
  { key: "adjustments", label: "Adjustments" },
  { key: "costOfSales", label: "Cost of sales" },
  { key: "costPct", label: "Cost %" },
];

function metricValue(t: CentreTotals, metric: Metric): string {
  switch (metric) {
    case "sales":
      return AED(t.sales);
    case "purchases":
      return AED(t.purchases);
    case "adjustments":
      return AED(netAdjustments(t.stockMovement, t.adjustments));
    case "costOfSales":
      return AED(t.costOfSales);
    case "costPct":
      return PCT(t.costPct);
  }
}

function sumTotals(list: CentreTotals[]): CentreTotals {
  const t: CentreTotals = {
    costCentre: "food",
    restaurantSales: 0,
    sales: 0,
    discount: 0,
    purchases: 0,
    adjustments: 0,
    stockMovement: 0,
    costOfSales: 0,
    grossProfit: 0,
    costPct: null,
    gpPct: null,
  };
  for (const x of list) {
    t.sales += x.sales;
    t.purchases += x.purchases;
    t.adjustments += x.adjustments;
    t.stockMovement += x.stockMovement;
    t.costOfSales += x.costOfSales;
    t.grossProfit += x.grossProfit;
  }
  t.costPct = pct(t.costOfSales, t.sales);
  t.gpPct = t.sales > 0 ? (t.grossProfit / t.sales) * 100 : null;
  return t;
}

type Drill = {
  kind: "mtd" | "ytd";
  centre: CostCentre | "all";
  metric: Metric;
};

export function CosPeriodTables({ data }: { data: CosOverviewData }) {
  const [drill, setDrill] = useState<Drill | null>(null);

  const mtdMonth = data.mtdWeeks.length
    ? MONTH_LABELS[
        data.weeks.food.find((w) => w.weekNo === data.mtdWeeks[0])
          ?.monthIndex ?? data.monthIndex
      ]
    : MONTH_LABELS[data.monthIndex];
  const mtdRange = data.mtdWeeks.length
    ? `W${data.mtdWeeks[0]}–W${data.mtdWeeks[data.mtdWeeks.length - 1]}`
    : "";

  return (
    <>
      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
        <PeriodCard
          title="Month-to-date"
          subtitle={`${mtdMonth} ${data.fiscalYear}${mtdRange ? ` · ${mtdRange}` : ""} · click a value for the weekly breakdown`}
          totals={data.mtd}
          onOpen={(centre, metric) => setDrill({ kind: "mtd", centre, metric })}
        />
        <PeriodCard
          title="Year-to-date"
          subtitle={`${data.fiscalYear} · click a value for the monthly breakdown`}
          totals={data.ytd}
          onOpen={(centre, metric) => setDrill({ kind: "ytd", centre, metric })}
        />
      </div>
      {drill ? (
        <BreakdownDialog
          data={data}
          drill={drill}
          onClose={() => setDrill(null)}
        />
      ) : null}
    </>
  );
}

function PeriodCard({
  title,
  subtitle,
  totals,
  onOpen,
}: {
  title: string;
  subtitle: string;
  totals: Record<CostCentre, CentreTotals>;
  onOpen: (centre: CostCentre | "all", metric: Metric) => void;
}) {
  const all = sumTotals(COST_CENTRES.map((c) => totals[c]));
  const rows: { key: CostCentre | "all"; label: string; t: CentreTotals }[] = [
    ...COST_CENTRES.map((c) => ({
      key: c,
      label: COST_CENTRE_LABELS[c],
      t: totals[c],
    })),
    { key: "all", label: "Total", t: all },
  ];

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-black/5 p-4">
        <h3 className="font-serif text-lg text-[#3D421F]">{title}</h3>
        <p className="mt-0.5 text-xs text-black/45">{subtitle}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-black/10 bg-[var(--venue-secondary,#F0F3DD)]/50 text-xs font-bold uppercase tracking-wide text-black">
              <th className="px-3 py-2 text-left">Cost centre</th>
              {METRICS.map((m) => (
                <th
                  key={m.key}
                  className="whitespace-nowrap px-3 py-2 text-right"
                  title={
                    m.key === "adjustments"
                      ? "(Opening stock − closing stock) + run adjustments (additions − deductions)"
                      : undefined
                  }
                >
                  {m.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.key}
                className={cn(
                  "border-b border-black/5",
                  row.key === "all" &&
                    "border-t border-black/10 bg-black/[0.02] font-semibold",
                )}
              >
                <td className="px-3 py-2 text-left font-medium">{row.label}</td>
                {METRICS.map((m) => (
                  <td key={m.key} className="px-3 py-2 text-right tabular-nums">
                    <button
                      type="button"
                      onClick={() => onOpen(row.key, m.key)}
                      title={`${row.label} · ${m.label} — open breakdown`}
                      className="rounded px-1 text-[#3D421F] underline decoration-[var(--venue-primary,#818a40)]/40 decoration-dotted underline-offset-4 transition hover:bg-[var(--venue-secondary,#F0F3DD)] hover:decoration-solid"
                    >
                      {metricValue(row.t, m.key)}
                    </button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

type BreakdownRow = {
  key: string;
  label: string;
  sublabel?: string;
  sales: number;
  purchases: number;
  openingStock: number | null;
  closingStock: number | null;
  stockMovement: number;
  adjustments: number;
  costOfSales: number;
  /** Week rows: the cost run to open (single centre only). */
  runHref?: string | null;
  status?: CosRunStatus | null;
  /** Month rows: weeks with a cost run out of weeks in the month. */
  coverage?: string;
};

function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCDate()} ${MONTH_SHORT[d.getUTCMonth()].toLowerCase().replace(/^./, (ch) => ch.toUpperCase())}`;
}

/** Combine the same week across the selected centre(s). */
function weekRows(
  data: CosOverviewData,
  centres: CostCentre[],
  weekNos: number[],
): BreakdownRow[] {
  return weekNos.map((wk) => {
    const parts = centres
      .map((c) => data.weeks[c].find((w) => w.weekNo === wk))
      .filter((w): w is CentreWeekDetail => Boolean(w));
    const first = parts[0];
    const single = centres.length === 1 ? first : null;
    return {
      key: `w${wk}`,
      label: `Week ${wk}`,
      sublabel: first ? `${shortDate(first.start)} – ${shortDate(first.end)}` : "",
      sales: parts.reduce((s, w) => s + w.sales, 0),
      purchases: parts.reduce((s, w) => s + w.purchases, 0),
      openingStock: parts.reduce((s, w) => s + w.openingStock, 0),
      closingStock: parts.reduce((s, w) => s + w.closingStock, 0),
      stockMovement: parts.reduce(
        (s, w) => s + (w.openingStock - w.closingStock),
        0,
      ),
      adjustments: parts.reduce((s, w) => s + w.adjustments, 0),
      costOfSales: parts.reduce((s, w) => s + w.costOfSales, 0),
      runHref:
        single?.runId != null
          ? `/gp-cos/${centres[0]}/cost-runs/${single.runId}`
          : null,
      status: single ? single.status : undefined,
      coverage: single
        ? undefined
        : `${parts.filter((w) => w.runId).length}/${centres.length} centres`,
    };
  });
}

/** Roll weeks up into retail months (only months with any activity). */
function monthRows(
  data: CosOverviewData,
  centres: CostCentre[],
): BreakdownRow[] {
  const rows: BreakdownRow[] = [];
  for (let m = 0; m < 12; m++) {
    const weeks = centres.flatMap((c) =>
      data.weeks[c].filter((w) => w.monthIndex === m),
    );
    const sales = weeks.reduce((s, w) => s + w.sales, 0);
    const purchases = weeks.reduce((s, w) => s + w.purchases, 0);
    const withRun = weeks.filter((w) => w.runId);
    if (sales === 0 && purchases === 0 && withRun.length === 0) continue;

    // Month opening = first entered week's opening; closing = last entered week's closing.
    const byCentre = centres.map((c) =>
      data.weeks[c].filter((w) => w.monthIndex === m && w.runId),
    );
    const opening = byCentre.reduce((s, ws) => s + (ws[0]?.openingStock ?? 0), 0);
    const closing = byCentre.reduce(
      (s, ws) => s + (ws[ws.length - 1]?.closingStock ?? 0),
      0,
    );
    const weekCount = data.weeks[centres[0]].filter(
      (w) => w.monthIndex === m,
    ).length;
    const first = data.weeks[centres[0]].find((w) => w.monthIndex === m);
    const last = [...data.weeks[centres[0]]]
      .reverse()
      .find((w) => w.monthIndex === m);

    rows.push({
      key: `m${m}`,
      label: MONTH_LABELS[m],
      sublabel: first && last ? `W${first.weekNo}–W${last.weekNo}` : "",
      sales,
      purchases,
      openingStock: withRun.length ? opening : null,
      closingStock: withRun.length ? closing : null,
      stockMovement: weeks.reduce(
        (s, w) => s + (w.openingStock - w.closingStock),
        0,
      ),
      adjustments: weeks.reduce((s, w) => s + w.adjustments, 0),
      costOfSales: weeks.reduce((s, w) => s + w.costOfSales, 0),
      coverage: `${withRun.length}/${weekCount * centres.length} ${centres.length === 1 ? "weeks" : "runs"}`,
    });
  }
  return rows;
}

const STATUS_BADGE: Record<CosRunStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-black/5 text-black/60" },
  pending_approval: {
    label: "Pending",
    className: "bg-amber-100 text-amber-800",
  },
  approved: { label: "Approved", className: "bg-emerald-100 text-emerald-800" },
};

const DETAIL_COLUMNS: {
  key: string;
  label: string;
  metric?: Metric;
  title?: string;
}[] = [
  { key: "sales", label: "Sales", metric: "sales" },
  { key: "purchases", label: "Purchases", metric: "purchases" },
  { key: "opening", label: "Opening stock", metric: "adjustments" },
  { key: "closing", label: "Closing stock", metric: "adjustments" },
  {
    key: "stock",
    label: "Stock diff.",
    metric: "adjustments",
    title: "Opening − closing stock (adds to cost)",
  },
  {
    key: "named",
    label: "Run adj.",
    metric: "adjustments",
    title: "Run adjustments: additions − deductions",
  },
  {
    key: "net",
    label: "Adjustments",
    metric: "adjustments",
    title: "Stock diff. + run adjustments",
  },
  { key: "cos", label: "Cost of sales", metric: "costOfSales" },
  { key: "pct", label: "Cost %", metric: "costPct" },
];

function cell(row: BreakdownRow, key: string): string {
  switch (key) {
    case "sales":
      return AED(row.sales);
    case "purchases":
      return AED(row.purchases);
    case "opening":
      return row.openingStock == null ? "—" : AED(row.openingStock);
    case "closing":
      return row.closingStock == null ? "—" : AED(row.closingStock);
    case "stock":
      return AED(row.stockMovement);
    case "named":
      return row.adjustments < 0
        ? `(-) ${AED(-row.adjustments)}`
        : AED(row.adjustments);
    case "net":
      return AED(netAdjustments(row.stockMovement, row.adjustments));
    case "cos":
      return AED(row.costOfSales);
    case "pct":
      return PCT(pct(row.costOfSales, row.sales));
    default:
      return "";
  }
}

function BreakdownDialog({
  data,
  drill,
  onClose,
}: {
  data: CosOverviewData;
  drill: Drill;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const centres = drill.centre === "all" ? [...COST_CENTRES] : [drill.centre];
  const centreLabel =
    drill.centre === "all" ? "All cost centres" : COST_CENTRE_LABELS[drill.centre];
  const isWeeks = drill.kind === "mtd";
  const rows = isWeeks
    ? weekRows(data, centres, data.mtdWeeks)
    : monthRows(data, centres);
  const total: BreakdownRow = {
    key: "total",
    label: "Total",
    sales: rows.reduce((s, r) => s + r.sales, 0),
    purchases: rows.reduce((s, r) => s + r.purchases, 0),
    openingStock: rows.find((r) => r.openingStock != null)?.openingStock ?? null,
    closingStock:
      [...rows].reverse().find((r) => r.closingStock != null)?.closingStock ??
      null,
    stockMovement: rows.reduce((s, r) => s + r.stockMovement, 0),
    adjustments: rows.reduce((s, r) => s + r.adjustments, 0),
    costOfSales: rows.reduce((s, r) => s + r.costOfSales, 0),
  };
  const metricLabel = METRICS.find((m) => m.key === drill.metric)?.label ?? "";

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cos-breakdown-title"
        className="flex max-h-[min(92dvh,48rem)] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-black/10 bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-black/8 px-5 py-4">
          <div>
            <h3
              id="cos-breakdown-title"
              className="font-serif text-lg text-[#3D421F]"
            >
              {centreLabel} · {isWeeks ? "Month-to-date" : "Year-to-date"}{" "}
              {metricLabel.toLowerCase()}
            </h3>
            <p className="mt-0.5 text-sm text-black/50">
              {isWeeks ? "Weekly references" : "Monthly references"} ·{" "}
              {data.fiscalYear}. Cost of sales = purchases + (opening − closing
              stock) + adjustments (additions − deductions).
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-black/45 transition hover:bg-black/5 hover:text-[#3D421F]"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-[var(--venue-secondary,#F0F3DD)]">
              <tr className="text-xs font-bold uppercase tracking-wide text-black/70">
                <th className="px-3 py-2 text-left">
                  {isWeeks ? "Week" : "Month"}
                </th>
                <th className="px-3 py-2 text-left">
                  {isWeeks && drill.centre !== "all" ? "Cost run" : "Entered"}
                </th>
                {DETAIL_COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    title={col.title}
                    className={cn(
                      "whitespace-nowrap px-3 py-2 text-right",
                      col.metric === drill.metric &&
                        "bg-[var(--venue-primary,#818a40)]/15 text-[#3D421F]",
                    )}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={DETAIL_COLUMNS.length + 2}
                    className="px-3 py-10 text-center text-black/45"
                  >
                    No activity in this period yet.
                  </td>
                </tr>
              ) : null}
              {rows.map((row) => {
                const missing =
                  isWeeks && drill.centre !== "all" && !row.runHref;
                return (
                  <tr
                    key={row.key}
                    className={cn(
                      "border-b border-black/5",
                      missing && "bg-red-50/60",
                    )}
                  >
                    <td className="whitespace-nowrap px-3 py-2 text-left">
                      <div className="font-medium text-[#3D421F]">
                        {row.label}
                      </div>
                      {row.sublabel ? (
                        <div className="text-[11px] text-black/45">
                          {row.sublabel}
                        </div>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-left text-xs">
                      {row.runHref ? (
                        <ScopedLink
                          href={row.runHref}
                          className="inline-flex items-center gap-1.5 text-[var(--venue-primary,#818a40)] hover:underline"
                        >
                          {row.status ? (
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                                STATUS_BADGE[row.status].className,
                              )}
                            >
                              {STATUS_BADGE[row.status].label}
                            </span>
                          ) : null}
                          Open
                          <ArrowUpRight className="h-3 w-3" />
                        </ScopedLink>
                      ) : missing ? (
                        <span className="font-medium text-red-700">
                          No cost run
                        </span>
                      ) : (
                        <span className="text-black/55">
                          {row.coverage ?? "—"}
                        </span>
                      )}
                    </td>
                    {DETAIL_COLUMNS.map((col) => (
                      <td
                        key={col.key}
                        className={cn(
                          "whitespace-nowrap px-3 py-2 text-right tabular-nums text-black/70",
                          col.metric === drill.metric &&
                            "bg-[var(--venue-primary,#818a40)]/[0.06] font-medium text-[#3D421F]",
                        )}
                      >
                        {cell(row, col.key)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
            {rows.length > 0 ? (
              <tfoot>
                <tr className="border-t border-black/15 bg-black/[0.03] font-semibold text-[#3D421F]">
                  <td className="px-3 py-2 text-left">Total</td>
                  <td className="px-3 py-2" />
                  {DETAIL_COLUMNS.map((col) => (
                    <td
                      key={col.key}
                      className="whitespace-nowrap px-3 py-2 text-right tabular-nums"
                    >
                      {cell(total, col.key)}
                    </td>
                  ))}
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </div>
    </div>,
    document.body,
  );
}
