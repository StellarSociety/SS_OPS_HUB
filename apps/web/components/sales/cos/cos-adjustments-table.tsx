"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { StatusBadge } from "@/components/sales/cos/cost-runs-panel";
import { Card } from "@/components/ui/card";
import {
  MONTH_LABELS,
  monthIndexForWeek,
  weeksInMonth,
} from "@/lib/sales/cos-calculations";
import type {
  CosAdjustmentSource,
  CostCentre,
  VenueCosRunWithAdjustments,
} from "@/lib/sales/cos-types";
import { formatMoney } from "@/lib/sales/daily-sales-calculations";
import { cn } from "@/lib/utils";

/** ISO date → DD/MM/YY. */
function ddmmyy(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

const SIGNED = (n: number) => (n < 0 ? `(-) ${formatMoney(-n)}` : formatMoney(n));

const SOURCE_LABEL: Record<CosAdjustmentSource, string> = {
  manual: "Manual",
  auto_discount: "Auto discount",
  stock: "Stock",
  other: "Other",
  transfer: "Transfer",
  neutral: "Manual",
};

type Side = "DB" | "CR" | "NEU";

const SIDE_LABEL: Record<Side, string> = {
  DB: "(+) Addition",
  CR: "(-) Deduction",
  NEU: "(=) Neutral",
};

const SIDE_BADGE: Record<Side, string> = {
  DB: "bg-emerald-100 text-emerald-800",
  CR: "bg-red-100 text-red-800",
  NEU: "bg-slate-100 text-slate-700",
};

type Line = {
  id: string;
  runId: string;
  weekNo: number;
  weekStart: string | null;
  weekEnd: string | null;
  status: VenueCosRunWithAdjustments["status"];
  reason: string;
  source: CosAdjustmentSource;
  side: Side;
  ledger: string;
  amount: number;
  recordedAt: string;
};

type Totals = { additions: number; deductions: number; neutral: number };

function totalsOf(lines: Line[]): Totals {
  return lines.reduce(
    (t, l) =>
      l.side === "NEU"
        ? { ...t, neutral: t.neutral + l.amount }
        : l.side === "CR"
          ? { ...t, deductions: t.deductions + l.amount }
          : { ...t, additions: t.additions + l.amount },
    { additions: 0, deductions: 0, neutral: 0 },
  );
}

const selectClass =
  "rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-[#3D421F]";

export function CosAdjustmentsTable({
  centre,
  fiscalYear,
  runs,
  monthSpans,
}: {
  centre: CostCentre;
  fiscalYear: number;
  runs: VenueCosRunWithAdjustments[];
  /** Accounting start/end per month index. */
  monthSpans: { start: string; end: string }[];
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const base = `/gp-cos/${centre}`;

  const lines: Line[] = runs.flatMap((run) =>
    run.adjustments.map((a) => {
      const amount = Number(a.amount_gs) || 0;
      return {
        id: a.id,
        runId: run.id,
        weekNo: run.week_no,
        weekStart: run.week_start,
        weekEnd: run.week_end,
        status: run.status,
        reason: a.reason || "—",
        source: a.source,
        side: a.source === "neutral" ? "NEU" : amount < 0 ? "CR" : "DB",
        ledger: a.ledger_account,
        amount,
        recordedAt: a.created_at,
      };
    }),
  );

  // Accounting months, most recent first; lines within a month newest week first.
  const months = [...new Set(lines.map((l) => monthIndexForWeek(l.weekNo)))]
    .sort((a, b) => b - a)
    .map((mi) => {
      const monthLines = lines
        .filter((l) => monthIndexForWeek(l.weekNo) === mi)
        .sort((a, b) => b.weekNo - a.weekNo);
      const wks = weeksInMonth(mi);
      return {
        monthIndex: mi,
        weekTag: `W${wks[0]}–W${wks.at(-1)}`,
        lines: monthLines,
        totals: totalsOf(monthLines),
      };
    });
  const yearTotals = totalsOf(lines);

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-2 p-3">
        <select
          value={fiscalYear}
          onChange={(e) => {
            const next = new URLSearchParams(sp.toString());
            next.set("year", e.target.value);
            router.push(`?${next.toString()}`);
          }}
          className={selectClass}
          aria-label="Year"
        >
          {[fiscalYear - 1, fiscalYear, fiscalYear + 1].map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <span className="ml-auto text-xs text-black/45">
          Adjustments recorded on {fiscalYear} cost runs · neutral lines don’t
          change cost of sales
        </span>
      </Card>

      <Card className="overflow-hidden">
        {lines.length === 0 ? (
          <div className="p-10 text-center text-sm text-black/45">
            No adjustments recorded on {fiscalYear} cost runs yet.
          </div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-[var(--venue-secondary,#F0F3DD)]">
                <tr className="border-b border-black/10 text-xs font-bold uppercase tracking-wide text-black">
                  <th className="px-3 py-2 text-left">Week</th>
                  <th className="px-3 py-2 text-left">Adjustment</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-left">Ledger</th>
                  <th className="px-3 py-2 text-left">Recorded</th>
                  <th className="px-3 py-2 text-left">Run</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                </tr>
              </thead>
              {months.map((m) => (
                <tbody key={m.monthIndex}>
                  <tr className="border-y border-black/10 bg-black/[0.03]">
                    <td colSpan={7} className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                        <span className="flex items-center gap-2 font-semibold text-[#3D421F]">
                          {MONTH_LABELS[m.monthIndex]} {fiscalYear}
                          <span className="rounded-md bg-[var(--venue-primary,#818a40)] px-2 py-0.5 text-xs font-semibold tabular-nums tracking-wide text-white">
                            {m.weekTag}
                          </span>
                          <span className="font-normal tabular-nums text-black/55">
                            {ddmmyy(monthSpans[m.monthIndex].start)} to{" "}
                            {ddmmyy(monthSpans[m.monthIndex].end)}
                          </span>
                        </span>
                        <MonthTotals totals={m.totals} />
                      </div>
                    </td>
                  </tr>
                  {m.lines.map((l) => (
                    <tr key={l.id} className="border-b border-black/5">
                      <td className="whitespace-nowrap px-3 py-2 text-left">
                        <span className="font-medium text-[#3D421F]">
                          W{l.weekNo}
                        </span>
                        <div className="text-[11px] text-black/45">
                          {ddmmyy(l.weekStart)} – {ddmmyy(l.weekEnd)}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-left text-[#3D421F]">
                        {l.reason}
                        <div className="text-[11px] text-black/45">
                          {SOURCE_LABEL[l.source]}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-left">
                        <span
                          className={cn(
                            "inline-flex rounded px-2 py-0.5 text-xs font-semibold",
                            SIDE_BADGE[l.side],
                          )}
                        >
                          {SIDE_LABEL[l.side]}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-left text-black/60">
                        {l.ledger || "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-left text-black/60">
                        {ddmmyy(l.recordedAt)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-left">
                        <Link
                          href={`${base}/cost-runs/${l.runId}`}
                          className="hover:opacity-80"
                          title={`Open the W${l.weekNo} cost run`}
                        >
                          <StatusBadge status={l.status} />
                        </Link>
                      </td>
                      <td
                        className={cn(
                          "whitespace-nowrap px-3 py-2 text-right tabular-nums",
                          l.side === "NEU" ? "text-black/45" : "text-[#3D421F]",
                        )}
                      >
                        {SIGNED(l.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              ))}
              <tfoot>
                <tr className="border-t border-black/15 bg-black/[0.05] text-[#3D421F]">
                  <td colSpan={7} className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      <span className="font-semibold">
                        Total {fiscalYear} · {lines.length} adjustment
                        {lines.length === 1 ? "" : "s"}
                      </span>
                      <MonthTotals totals={yearTotals} />
                    </div>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function MonthTotals({ totals }: { totals: Totals }) {
  const net = totals.additions + totals.deductions;
  return (
    <span className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-xs tabular-nums">
      <span className="text-black/50">
        Additions{" "}
        <span className="font-semibold text-emerald-800">
          {formatMoney(totals.additions)}
        </span>
      </span>
      <span className="text-black/50">
        Deductions{" "}
        <span className="font-semibold text-red-800">
          {SIGNED(totals.deductions)}
        </span>
      </span>
      {totals.neutral !== 0 ? (
        <span className="text-black/50">
          Neutral{" "}
          <span className="font-semibold text-slate-700">
            {SIGNED(totals.neutral)}
          </span>
        </span>
      ) : null}
      <span className="text-black/50">
        Net{" "}
        <span className="text-sm font-bold text-[#3D421F]">{SIGNED(net)}</span>
      </span>
    </span>
  );
}
