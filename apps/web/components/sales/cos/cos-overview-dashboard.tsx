"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Bar,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { Card } from "@/components/ui/card";
import { MONTH_SHORT } from "@/lib/sales/cos-calculations";
import {
  COST_CENTRES,
  COST_CENTRE_LABELS,
  type CostCentre,
} from "@/lib/sales/cos-types";
import type {
  CentreTotals,
  CosOverviewData,
} from "@/lib/sales/cos-overview-data";

const AED = (n: number) =>
  n.toLocaleString("en-AE", { maximumFractionDigits: 0 });
const PCT = (n: number | null) => (n == null ? "—" : `${n.toFixed(1)}%`);

const CENTRE_COLOR: Record<CostCentre, string> = {
  food: "#8A9A5B",
  beverage: "#4E6151",
  wine: "#A15C38",
  other: "#D9A441",
};

export function CosOverviewDashboard({
  venueName,
  data,
}: {
  venueName: string;
  data: CosOverviewData;
}) {
  const router = useRouter();
  const sp = useSearchParams();

  function setParam(patch: Record<string, string>) {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) next.set(k, v);
    router.push(`?${next.toString()}`);
  }

  const scope = data.scope;
  const years = [data.fiscalYear - 1, data.fiscalYear, data.fiscalYear + 1];

  // Totals across all cost centres for the headline (period scope).
  const totalPeriod = sumCentres(Object.values(data.period));

  return (
    <div className="space-y-6">
      {/* Filter bar */}
      <Card className="flex flex-wrap items-center gap-2 p-3">
        <div className="inline-flex rounded-lg bg-black/[0.04] p-1">
          {(["week", "month", "year"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setParam({ scope: s })}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold capitalize transition ${
                scope === s
                  ? "bg-[var(--venue-primary,#818a40)] text-white"
                  : "text-black/60 hover:text-black"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <select
          value={data.fiscalYear}
          onChange={(e) => setParam({ year: e.target.value })}
          className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>

        {scope === "month" ? (
          <select
            value={data.monthIndex}
            onChange={(e) => setParam({ month: e.target.value })}
            className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
          >
            {MONTH_SHORT.map((m, i) => (
              <option key={m} value={i}>
                {m}
              </option>
            ))}
          </select>
        ) : null}

        {scope === "week" ? (
          <select
            value={data.weekNo}
            onChange={(e) => setParam({ week: e.target.value })}
            className="rounded-lg border border-black/10 bg-white px-3 py-2 text-sm"
          >
            {Array.from({ length: 52 }, (_, i) => i + 1).map((w) => (
              <option key={w} value={w}>
                Week {w}
              </option>
            ))}
          </select>
        ) : null}

        <span className="ml-auto text-xs text-black/45">{venueName}</span>
      </Card>

      {/* Headline cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <HeadlineCard
          label="Restaurant sales"
          value={AED(totalPeriod.restaurantSales)}
          sub={`${scopeLabel(data)} · total`}
        />
        <HeadlineCard
          label="Food cost %"
          value={PCT(data.period.food.costPct)}
          sub={`Target ${data.targetByCentre.food}%`}
          tone={toneFor(data.period.food.costPct, data.targetByCentre.food)}
        />
        <HeadlineCard
          label="Beverage cost %"
          value={PCT(data.period.beverage.costPct)}
          sub={`Target ${data.targetByCentre.beverage}%`}
          tone={toneFor(data.period.beverage.costPct, data.targetByCentre.beverage)}
        />
        <HeadlineCard
          label="Gross profit"
          value={AED(totalPeriod.grossProfit)}
          sub={`${PCT(totalPeriod.gpPct)} of sales`}
        />
      </div>

      {/* Per cost-centre strip */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {COST_CENTRES.map((c) => (
          <CentrePanel
            key={c}
            centre={c}
            totals={data.period[c]}
            target={data.targetByCentre[c]}
            weekly={data.weekly[c]}
          />
        ))}
      </div>

      {/* MTD / YTD table */}
      <Card className="overflow-hidden">
        <div className="border-b border-black/5 p-4">
          <h3 className="font-serif text-lg text-[#3D421F]">
            Month-to-date &amp; Year-to-date
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-black/10 bg-[var(--venue-secondary,#F0F3DD)]/50 text-xs font-bold uppercase tracking-wide text-black">
                <th className="px-3 py-2 text-left">Cost centre</th>
                <th className="px-3 py-2 text-right">MTD sales</th>
                <th className="px-3 py-2 text-right">MTD purchases</th>
                <th className="px-3 py-2 text-right">MTD cost %</th>
                <th className="px-3 py-2 text-right">YTD sales</th>
                <th className="px-3 py-2 text-right">YTD purchases</th>
                <th className="px-3 py-2 text-right">YTD cost %</th>
              </tr>
            </thead>
            <tbody>
              {COST_CENTRES.map((c) => (
                <tr key={c} className="border-b border-black/5">
                  <td className="px-3 py-2 text-left font-medium">
                    {COST_CENTRE_LABELS[c]}
                  </td>
                  <td className="px-3 py-2 text-right">{AED(data.mtd[c].sales)}</td>
                  <td className="px-3 py-2 text-right">{AED(data.mtd[c].purchases)}</td>
                  <td className="px-3 py-2 text-right">{PCT(data.mtd[c].costPct)}</td>
                  <td className="px-3 py-2 text-right">{AED(data.ytd[c].sales)}</td>
                  <td className="px-3 py-2 text-right">{AED(data.ytd[c].purchases)}</td>
                  <td className="px-3 py-2 text-right">{PCT(data.ytd[c].costPct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function CentrePanel({
  centre,
  totals,
  target,
  weekly,
}: {
  centre: CostCentre;
  totals: CentreTotals;
  target: number;
  weekly: CosOverviewData["weekly"][CostCentre];
}) {
  const chartData = weekly.slice(-10).map((p) => ({
    name: `W${p.weekNo}`,
    Sales: Math.round(p.sales),
    Purchases: Math.round(p.purchases),
  }));
  const color = CENTRE_COLOR[centre];

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-serif text-lg text-[#3D421F]">
          {COST_CENTRE_LABELS[centre]}
        </h3>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            totals.costPct == null
              ? "bg-black/5 text-black/50"
              : totals.costPct <= target
                ? "bg-emerald-100 text-emerald-700"
                : totals.costPct <= target + 5
                  ? "bg-amber-100 text-amber-700"
                  : "bg-red-100 text-red-700"
          }`}
        >
          Cost {PCT(totals.costPct)}
        </span>
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2 text-sm">
        <Mini label="Sales" value={AED(totals.sales)} />
        <Mini label="Purchases" value={AED(totals.purchases)} />
        <Mini label="GP" value={AED(totals.grossProfit)} />
      </div>

      <div className="h-40">
        {chartData.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-black/40">
            No data yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#00000010" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#3D421F" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#3D421F" }} axisLine={false} tickLine={false} width={40} tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : `${v}`)} />
              <Tooltip formatter={(v) => AED(Number(v))} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Bar dataKey="Sales" fill={color} radius={[3, 3, 0, 0]} barSize={14} />
              <Line type="monotone" dataKey="Purchases" stroke="#C45C3E" strokeWidth={2} dot={{ r: 2 }} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}

function HeadlineCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "warn" | "bad";
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-700"
      : tone === "warn"
        ? "text-amber-600"
        : tone === "bad"
          ? "text-red-600"
          : "text-[#3D421F]";
  return (
    <Card className="p-5">
      <div className="text-xs text-black/50">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${toneClass}`}>{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-black/45">{sub}</div> : null}
    </Card>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-black/[0.03] px-2 py-1.5">
      <div className="text-[11px] text-black/45">{label}</div>
      <div className="text-sm font-semibold text-[#3D421F]">{value}</div>
    </div>
  );
}

function toneFor(
  costPct: number | null,
  target: number,
): "good" | "warn" | "bad" | undefined {
  if (costPct == null) return undefined;
  if (costPct <= target) return "good";
  if (costPct <= target + 5) return "warn";
  return "bad";
}

function scopeLabel(data: CosOverviewData): string {
  if (data.scope === "year") return `${data.fiscalYear}`;
  if (data.scope === "month") return `${MONTH_SHORT[data.monthIndex]} ${data.fiscalYear}`;
  return `Week ${data.weekNo}`;
}

function sumCentres(list: CentreTotals[]): CentreTotals {
  const t: CentreTotals = {
    costCentre: "food",
    restaurantSales: 0,
    sales: 0,
    discount: 0,
    purchases: 0,
    adjustments: 0,
    costOfSales: 0,
    grossProfit: 0,
    costPct: null,
    gpPct: null,
  };
  // Restaurant sales are identical across centres (same daily total) — take max,
  // not sum, to avoid 4x counting.
  t.restaurantSales = Math.max(0, ...list.map((x) => x.restaurantSales));
  for (const x of list) {
    t.sales += x.sales;
    t.purchases += x.purchases;
    t.costOfSales += x.costOfSales;
    t.grossProfit += x.grossProfit;
  }
  t.gpPct = t.sales > 0 ? (t.grossProfit / t.sales) * 100 : null;
  t.costPct = t.sales > 0 ? (t.costOfSales / t.sales) * 100 : null;
  return t;
}
