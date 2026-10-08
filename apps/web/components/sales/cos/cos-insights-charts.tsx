"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import { MONTH_LABELS, weeksInMonth } from "@/lib/sales/cos-calculations";
import type {
  CosInsightsData,
  CosInsightWeek,
} from "@/lib/sales/cos-insights-data";
import {
  COST_CENTRES,
  COST_CENTRE_LABELS,
  type CostCentre,
} from "@/lib/sales/cos-types";
import { formatMoney } from "@/lib/sales/daily-sales-calculations";
import { cn } from "@/lib/utils";

// Validated (CVD + normal-vision, all pairs) on the light card surface.
const BAR = "#7a8a1e";
const LINE = "#2f6fc0";
const CENTRE_COLOR: Record<CostCentre, string> = {
  food: "#7a8a1e",
  beverage: "#2f6fc0",
  wine: "#8a3f8f",
  other: "#d39b00",
};
const PCT_LINE = "#8a3f8f";
/** Monthly backdrop bar: light step of the line hue, labelled in the axis. */
const MONTH_BAR = "#b7d3f6";
const INK = "#3D421F";

/** Mix a hex colour toward black by `amount` (0–1). */
function darken(hex: string, amount = 0.18): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift: number) =>
    Math.round(((n >> shift) & 255) * (1 - amount))
      .toString(16)
      .padStart(2, "0");
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}

const GRADIENT_COLORS = [
  BAR,
  LINE,
  MONTH_BAR,
  ...Object.values(CENTRE_COLOR),
].filter((c, i, all) => all.indexOf(c) === i);

/** Fill for a mark: its colour with a light top-to-bottom darkening. */
const grad = (hex: string) => `url(#cos-insights-${hex.slice(1)})`;
/** Same gradient for HTML swatches (legends, tooltips). */
const gradCss = (hex: string) =>
  `linear-gradient(180deg, ${hex}, ${darken(hex)})`;

/** One shared set of gradient definitions for every chart on the page. */
function GradientDefs() {
  return (
    <svg width={0} height={0} className="absolute" aria-hidden>
      <defs>
        {GRADIENT_COLORS.map((c) => (
          <linearGradient
            key={c}
            id={`cos-insights-${c.slice(1)}`}
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop offset="0%" stopColor={c} />
            <stop offset="100%" stopColor={darken(c)} />
          </linearGradient>
        ))}
      </defs>
    </svg>
  );
}
const MUTED = "rgba(0,0,0,0.45)";

/** ISO date → DD/MM/YY. */
function ddmmyy(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

/** Point/bar label: compact, and blank for zero so empty weeks stay quiet. */
function pointLabel(v: unknown): string {
  return Number(v) ? compact(v) : "";
}

/** 38,688 → 38.7k; small values stay whole. */
function compact(v: unknown): string {
  if (v == null || v === "") return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
  if (a >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toFixed(0);
}

const selectClass =
  "rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-xs text-[#3D421F]";

const axisTick = { fontSize: 10, fill: INK };

type MonthKey = { year: number; monthIndex: number };
const monthKeyStr = (m: MonthKey) => `${m.year}:${m.monthIndex}`;

export function CosInsightsCharts({ data }: { data: CosInsightsData }) {
  const label = COST_CENTRE_LABELS[data.centre];
  const { weeks, fiscalYear } = data;

  // Accounting months covered, oldest first (previous FY Jan → current month).
  const months = useMemo(() => {
    const seen = new Map<string, MonthKey & { weeks: CosInsightWeek[] }>();
    for (const w of weeks) {
      const key = monthKeyStr({ year: w.year, monthIndex: w.monthIndex });
      const m = seen.get(key) ?? {
        year: w.year,
        monthIndex: w.monthIndex,
        weeks: [],
      };
      m.weeks.push(w);
      seen.set(key, m);
    }
    return [...seen.values()];
  }, [weeks]);
  const last12 = months.slice(-12);
  const purchasesNote =
    data.purchasesSource === "accounts"
      ? "Purchases from Accounts invoices on the linked ledgers"
      : "Purchases from cost runs (no ledgers linked in Settings)";

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <GradientDefs />
      <WeeklySalesCostChart
        centre={data.centre}
        label={label}
        weeks={weeks.slice(-8)}
      />
      <CostPctByMonthChart label={label} months={months.slice(-4)} />
      <SalesVsPurchasesChart
        centre={data.centre}
        label={label}
        months={last12}
        note={purchasesNote}
      />
      <PurchasesVsTargetChart
        label={label}
        months={last12}
        note={purchasesNote}
      />
      <CentreMixChart weeks={weeks} months={months} fiscalYear={fiscalYear} />
      <StockVsTargetChart label={label} weeks={weeks.slice(-8)} />
    </div>
  );
}

const pctText = (v: unknown) =>
  v == null || v === "" ? "" : `${Number(v).toFixed(1)}%`;

/** Cost % over a set of weeks: total cost of sales ÷ total cost-run sales. */
function pooledCostPct(weeks: CosInsightWeek[]): number | null {
  const withRun = weeks.filter((w) => w.costOfSales != null && w.runSales);
  const sales = withRun.reduce((s, w) => s + (w.runSales ?? 0), 0);
  if (!sales) return null;
  return (withRun.reduce((s, w) => s + (w.costOfSales ?? 0), 0) / sales) * 100;
}

// ---------------------------------------------------------------------------
// A. Last 8 weeks: sales bar with purchases inside it, cost % line below
// ---------------------------------------------------------------------------
function WeeklySalesCostChart({
  centre,
  label,
  weeks,
}: {
  centre: CostCentre;
  label: string;
  weeks: CosInsightWeek[];
}) {
  const rows = weeks.map((w) => ({
    name: `W${w.weekNo}`,
    full: `W${w.weekNo} ${w.year} · ${ddmmyy(w.start)} – ${ddmmyy(w.end)}`,
    sales: w.salesNet[centre],
    purchases: w.purchases,
    costPct: w.costPct,
  }));
  const margin = { top: 24, right: 12, left: 0, bottom: 0 };

  return (
    <ChartCard
      title={`${label} sales, purchases & cost % · last 8 weeks`}
      subtitle="NET of tax · cost % from cost runs (cost of sales ÷ sales)"
      legend={[
        { kind: "bar", color: BAR, text: `${label} sales` },
        { kind: "bar", color: LINE, text: "Purchases (inside the sales bar)" },
        { kind: "line", color: PCT_LINE, text: "Cost %" },
      ]}
    >
      <div>
        <ResponsiveContainer width="100%" height={210}>
          <ComposedChart data={rows} margin={margin} syncId="weekly-sales-cost">
            <CartesianGrid stroke="#0000000d" vertical={false} />
            <XAxis dataKey="name" xAxisId="sales" hide />
            <XAxis dataKey="name" xAxisId="purchases" hide />
            <YAxis
              tick={axisTick}
              axisLine={false}
              tickLine={false}
              width={44}
              tickFormatter={compact}
            />
            <Tooltip
              cursor={{ fill: "#0000000a" }}
              content={
                <MoneyTooltip
                  titleKey="full"
                  series={[
                    { key: "sales", label: `${label} sales`, color: BAR },
                    { key: "purchases", label: "Purchases", color: LINE },
                  ]}
                  extra={(row) =>
                    row.costPct == null
                      ? "Cost % —"
                      : `Cost % ${pctText(row.costPct)}`
                  }
                />
              }
            />
            <Bar
              xAxisId="sales"
              dataKey="sales"
              fill={grad(BAR)}
              radius={[4, 4, 0, 0]}
              barSize={40}
            >
              <LabelList
                dataKey="sales"
                position="top"
                formatter={pointLabel}
                style={{ fontSize: 10, fill: INK }}
              />
            </Bar>
            <Bar
              xAxisId="purchases"
              dataKey="purchases"
              fill={grad(LINE)}
              radius={[4, 4, 0, 0]}
              barSize={16}
            >
              <LabelList
                dataKey="purchases"
                position="insideTop"
                formatter={pointLabel}
                style={{ fontSize: 9, fill: "#fff", fontWeight: 600 }}
              />
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
        <div className="mt-1 border-t border-black/5 pt-1 text-[10px] uppercase tracking-wide text-black/40">
          Cost %
        </div>
        <ResponsiveContainer width="100%" height={110}>
          <ComposedChart
            data={rows}
            margin={{ ...margin, top: 18 }}
            syncId="weekly-sales-cost"
          >
            <CartesianGrid stroke="#0000000d" vertical={false} />
            <XAxis
              dataKey="name"
              scale="band"
              tick={axisTick}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={axisTick}
              axisLine={false}
              tickLine={false}
              width={44}
              tickFormatter={(v) => `${v}%`}
              domain={["auto", "auto"]}
            />
            <Tooltip content={() => null} cursor={{ fill: "#0000000a" }} />
            <Line
              dataKey="costPct"
              stroke={PCT_LINE}
              strokeWidth={2}
              dot={{ r: 4, fill: PCT_LINE, stroke: "#fff", strokeWidth: 2 }}
              activeDot={{ r: 5 }}
              connectNulls
            >
              <LabelList
                dataKey="costPct"
                position="top"
                offset={8}
                formatter={pctText}
                style={{ fontSize: 10, fill: PCT_LINE, fontWeight: 600 }}
              />
            </Line>
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

// ---------------------------------------------------------------------------
// B. Last 4 months: weekly cost % (thin bars) over the month's cost % (wide)
// ---------------------------------------------------------------------------
function CostPctByMonthChart({
  label,
  months,
}: {
  label: string;
  months: (MonthKey & { weeks: CosInsightWeek[] })[];
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const groups = months.map((m) => ({
    key: monthKeyStr(m),
    label: MONTH_LABELS[m.monthIndex].slice(0, 3),
    full: `${MONTH_LABELS[m.monthIndex]} ${m.year}`,
    monthPct: pooledCostPct(m.weeks),
    weeks: weeksInMonth(m.monthIndex).map((weekNo) => {
      const w = m.weeks.find((x) => x.weekNo === weekNo);
      return {
        weekNo,
        pct: w?.costPct ?? null,
        full: w
          ? `W${weekNo} · ${ddmmyy(w.start)} – ${ddmmyy(w.end)}`
          : `W${weekNo}`,
      };
    }),
  }));
  const values = groups
    .flatMap((g) => [g.monthPct, ...g.weeks.map((w) => w.pct)])
    .filter((v): v is number => v != null);
  const [hover, setHover] = useState<string | null>(null);

  const H = 320;
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  const totalWeeks = groups.reduce((s, g) => s + g.weeks.length, 0);
  const gap = 10;
  const padX = { left: 44, right: 12 };
  const plotW = Math.max(0, width - padX.left - padX.right);
  const slot = totalWeeks
    ? (plotW - gap * (groups.length - 1)) / totalWeeks
    : 0;
  // Narrow weeks: stand the % labels upright and leave room for them.
  const upright = slot < 30;
  const pad = {
    ...padX,
    top: upright ? 40 : 26,
    bottom: 40 + (upright && min < 0 ? 34 : 0),
  };
  const plotH = H - pad.top - pad.bottom;
  const span = max - min || 1;
  const niceStep = (() => {
    const raw = span / 4;
    const mag = 10 ** Math.floor(Math.log10(raw));
    return [1, 2, 2.5, 5, 10].map((k) => k * mag).find((k) => k >= raw) ?? raw;
  })();
  const yMax = Math.ceil(max / niceStep) * niceStep;
  const yMin = Math.floor(min / niceStep) * niceStep;
  const y = (v: number) => pad.top + ((yMax - v) / (yMax - yMin || 1)) * plotH;
  const ticks: number[] = [];
  for (let t = yMin; t <= yMax + 1e-9; t += niceStep)
    ticks.push(Math.round(t * 100) / 100);

  const layout = groups.map((g, gi) => {
    const before = groups
      .slice(0, gi)
      .reduce((n, prev) => n + prev.weeks.length, 0);
    return {
      ...g,
      x: pad.left + slot * before + gap * gi,
      w: slot * g.weeks.length,
    };
  });
  const thin = Math.min(14, slot * 0.4);
  const hovered = layout
    .flatMap((g) => [
      {
        id: g.key,
        title: g.full,
        text: `Month cost % ${pctText(g.monthPct) || "—"}`,
        x: g.x + g.w / 2,
      },
      ...g.weeks.map((w, i) => ({
        id: `${g.key}:${w.weekNo}`,
        title: w.full,
        text: `Week cost % ${pctText(w.pct) || "—"}`,
        x: g.x + slot * (i + 0.5),
      })),
    ])
    .find((h) => h.id === hover);

  return (
    <ChartCard
      title={`${label} cost % · weekly vs month · last 4 months`}
      subtitle="From cost runs · month % = month's cost of sales ÷ month's sales"
      legend={[
        { kind: "bar", color: BAR, text: "Week cost %" },
        { kind: "bar", color: MONTH_BAR, text: "Month cost %" },
      ]}
    >
      <div ref={ref} className="relative w-full">
        {values.length === 0 ? (
          <Empty>No cost runs in these months yet.</Empty>
        ) : width > 0 ? (
          <svg
            width={width}
            height={H}
            role="img"
            aria-label={`${label} weekly and monthly cost % for the last 4 months`}
          >
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={pad.left}
                  x2={width - pad.right}
                  y1={y(t)}
                  y2={y(t)}
                  stroke={t === 0 ? "#00000026" : "#0000000d"}
                />
                <text
                  x={pad.left - 6}
                  y={y(t)}
                  textAnchor="end"
                  dominantBaseline="central"
                  fontSize={10}
                  fill={INK}
                >
                  {t}%
                </text>
              </g>
            ))}
            {layout.map((g) => (
              <g key={g.key}>
                {g.monthPct != null ? (
                  <rect
                    x={g.x}
                    width={g.w}
                    y={Math.min(y(g.monthPct), y(0))}
                    height={Math.max(1, Math.abs(y(g.monthPct) - y(0)))}
                    rx={4}
                    fill={grad(MONTH_BAR)}
                    opacity={
                      hover && hover !== g.key && !hover.startsWith(`${g.key}:`)
                        ? 0.5
                        : 1
                    }
                    onMouseEnter={() => setHover(g.key)}
                    onMouseLeave={() => setHover(null)}
                  />
                ) : null}
                {g.weeks.map((w, i) => {
                  const cx = g.x + slot * (i + 0.5);
                  const id = `${g.key}:${w.weekNo}`;
                  return (
                    <g
                      key={w.weekNo}
                      onMouseEnter={() => setHover(id)}
                      onMouseLeave={() => setHover(null)}
                    >
                      <rect
                        x={cx - slot / 2}
                        width={slot}
                        y={pad.top}
                        height={plotH}
                        fill="transparent"
                      />
                      {w.pct != null ? (
                        <>
                          <rect
                            x={cx - thin / 2}
                            width={thin}
                            y={Math.min(y(w.pct), y(0))}
                            height={Math.max(1, Math.abs(y(w.pct) - y(0)))}
                            rx={3}
                            fill={grad(BAR)}
                            stroke="#fff"
                            strokeWidth={1}
                          />
                          <text
                            x={cx}
                            y={
                              upright
                                ? w.pct >= 0
                                  ? y(w.pct) - 4
                                  : y(w.pct) + 4
                                : w.pct >= 0
                                  ? y(w.pct) - 5
                                  : y(w.pct) + 11
                            }
                            transform={
                              upright
                                ? `rotate(-90 ${cx} ${w.pct >= 0 ? y(w.pct) - 4 : y(w.pct) + 4})`
                                : undefined
                            }
                            textAnchor={
                              upright
                                ? w.pct >= 0
                                  ? "start"
                                  : "end"
                                : "middle"
                            }
                            dominantBaseline={upright ? "central" : undefined}
                            fontSize={9}
                            fontWeight={600}
                            fill={INK}
                          >
                            {pctText(w.pct)}
                          </text>
                        </>
                      ) : null}
                      <text
                        x={cx}
                        y={H - pad.bottom + 13}
                        textAnchor="middle"
                        fontSize={9}
                        fill={MUTED}
                      >
                        W{w.weekNo}
                      </text>
                    </g>
                  );
                })}
                <text
                  x={g.x + g.w / 2}
                  y={H - pad.bottom + 29}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={600}
                  fill={INK}
                >
                  {g.label}
                  <tspan fontWeight={400} fill={MUTED}>
                    {" "}
                    · {g.monthPct == null ? "—" : pctText(g.monthPct)}
                  </tspan>
                </text>
              </g>
            ))}
          </svg>
        ) : (
          <div style={{ height: H }} />
        )}
        {hovered ? (
          <div
            className="pointer-events-none absolute top-2 -translate-x-1/2"
            style={{ left: Math.min(Math.max(hovered.x, 80), width - 80) }}
          >
            <TooltipBox title={hovered.title}>
              <span className="tabular-nums">{hovered.text}</span>
            </TooltipBox>
          </div>
        ) : null}
      </div>
    </ChartCard>
  );
}

/** Element width, kept current with a ResizeObserver. */
function useWidth<T extends HTMLElement>(): [
  React.RefObject<T | null>,
  number,
] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

// ---------------------------------------------------------------------------
// 1. Last 12 months: centre sales (bars) + purchases (line)
// ---------------------------------------------------------------------------
function SalesVsPurchasesChart({
  centre,
  label,
  months,
  note,
}: {
  centre: CostCentre;
  label: string;
  months: (MonthKey & { weeks: CosInsightWeek[] })[];
  note: string;
}) {
  const rows = months.map((m) => {
    const hasPurchases = m.weeks.some((w) => w.purchases != null);
    return {
      name: MONTH_LABELS[m.monthIndex].slice(0, 3),
      full: `${MONTH_LABELS[m.monthIndex]} ${m.year}`,
      sales: m.weeks.reduce((s, w) => s + w.salesNet[centre], 0),
      purchases: hasPurchases
        ? m.weeks.reduce((s, w) => s + (w.purchases ?? 0), 0)
        : null,
    };
  });

  return (
    <ChartCard
      title={`${label} sales & purchases · last 12 months`}
      subtitle={`NET of tax · ${note}`}
      legend={[
        { kind: "bar", color: BAR, text: `${label} sales` },
        { kind: "line", color: LINE, text: "Purchases" },
      ]}
    >
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart
          data={rows}
          margin={{ top: 24, right: 12, left: 0, bottom: 0 }}
        >
          <CartesianGrid stroke="#0000000d" vertical={false} />
          <XAxis
            dataKey="name"
            tick={axisTick}
            axisLine={false}
            tickLine={false}
            interval={0}
          />
          <YAxis
            tick={axisTick}
            axisLine={false}
            tickLine={false}
            width={44}
            tickFormatter={compact}
          />
          <Tooltip
            cursor={{ fill: "#0000000a" }}
            content={
              <MoneyTooltip
                titleKey="full"
                series={[
                  { key: "sales", label: `${label} sales`, color: BAR },
                  { key: "purchases", label: "Purchases", color: LINE },
                ]}
              />
            }
          />
          <Bar
            dataKey="sales"
            fill={grad(BAR)}
            radius={[4, 4, 0, 0]}
            maxBarSize={36}
          >
            <LabelList
              dataKey="sales"
              position="top"
              formatter={pointLabel}
              style={{ fontSize: 9, fill: INK }}
            />
          </Bar>
          <Line
            dataKey="purchases"
            stroke={LINE}
            strokeWidth={2}
            dot={{ r: 4, fill: LINE, stroke: "#fff", strokeWidth: 2 }}
            activeDot={{ r: 5 }}
            connectNulls
          >
            <LabelList
              dataKey="purchases"
              position="top"
              offset={8}
              formatter={pointLabel}
              style={{ fontSize: 9, fill: LINE, fontWeight: 600 }}
            />
          </Line>
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ---------------------------------------------------------------------------
// 2. A month's weekly purchases (bars) vs the purchase target (line)
// ---------------------------------------------------------------------------
function PurchasesVsTargetChart({
  label,
  months,
  note,
}: {
  label: string;
  months: (MonthKey & { weeks: CosInsightWeek[] })[];
  note: string;
}) {
  const latest = months.at(-1);
  const [selected, setSelected] = useState(latest ? monthKeyStr(latest) : "");
  const month = months.find((m) => monthKeyStr(m) === selected) ?? latest;
  if (!month) return null;

  // Every week of the month, including ones still to come.
  const rows = weeksInMonth(month.monthIndex).map((weekNo) => {
    const w = month.weeks.find((x) => x.weekNo === weekNo);
    return {
      name: `W${weekNo}`,
      full: w
        ? `W${weekNo} · ${ddmmyy(w.start)} – ${ddmmyy(w.end)}`
        : `W${weekNo}`,
      purchases: w?.purchases ?? null,
      target: w?.purchaseTarget ?? month.weeks[0]?.purchaseTarget ?? null,
    };
  });
  const total = rows.reduce((s, r) => s + (r.purchases ?? 0), 0);
  const totalTarget = rows.reduce((s, r) => s + (r.target ?? 0), 0);
  const hasData = rows.some((r) => Number(r.purchases) || Number(r.target));

  return (
    <ChartCard
      title={`${label} purchases vs target · weekly`}
      subtitle={`${note} · month ${formatMoney(total)} of ${formatMoney(totalTarget)} target`}
      legend={[
        { kind: "bar", color: BAR, text: "Purchases" },
        { kind: "line", color: LINE, text: "Purchase target" },
      ]}
      control={
        <select
          value={month ? monthKeyStr(month) : ""}
          onChange={(e) => setSelected(e.target.value)}
          className={selectClass}
          aria-label="Month"
        >
          {[...months].reverse().map((m) => (
            <option key={monthKeyStr(m)} value={monthKeyStr(m)}>
              {MONTH_LABELS[m.monthIndex]} {m.year}
            </option>
          ))}
        </select>
      }
    >
      {!hasData ? (
        <Empty>No purchases or purchase target for this month yet.</Empty>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart
            data={rows}
            margin={{ top: 24, right: 12, left: 0, bottom: 0 }}
          >
            <CartesianGrid stroke="#0000000d" vertical={false} />
            <XAxis
              dataKey="name"
              tick={axisTick}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={axisTick}
              axisLine={false}
              tickLine={false}
              width={44}
              tickFormatter={compact}
            />
            <Tooltip
              cursor={{ fill: "#0000000a" }}
              content={
                <MoneyTooltip
                  titleKey="full"
                  series={[
                    { key: "purchases", label: "Purchases", color: BAR },
                    { key: "target", label: "Purchase target", color: LINE },
                  ]}
                />
              }
            />
            <Bar
              dataKey="purchases"
              fill={grad(BAR)}
              radius={[4, 4, 0, 0]}
              maxBarSize={56}
            >
              <LabelList
                dataKey="purchases"
                position="top"
                formatter={pointLabel}
                style={{ fontSize: 10, fill: INK }}
              />
            </Bar>
            <Line
              dataKey="target"
              stroke={LINE}
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={{ r: 4, fill: LINE, stroke: "#fff", strokeWidth: 2 }}
              activeDot={{ r: 5 }}
            >
              <LabelList
                dataKey="target"
                position="top"
                offset={8}
                formatter={pointLabel}
                style={{ fontSize: 10, fill: LINE, fontWeight: 600 }}
              />
            </Line>
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

// ---------------------------------------------------------------------------
// 3. Sales mix across the revenue centres (donut) for a week / month / year
// ---------------------------------------------------------------------------
type MixScope = "week" | "month" | "year";

function CentreMixChart({
  weeks,
  months,
  fiscalYear,
}: {
  weeks: CosInsightWeek[];
  months: (MonthKey & { weeks: CosInsightWeek[] })[];
  fiscalYear: number;
}) {
  const [scope, setScope] = useState<MixScope>("month");
  const latestWeek = weeks.at(-1);
  const latestMonth = months.at(-1);
  const [weekKey, setWeekKey] = useState(
    latestWeek ? `${latestWeek.year}:${latestWeek.weekNo}` : "",
  );
  const [monthKey, setMonthKey] = useState(
    latestMonth ? monthKeyStr(latestMonth) : "",
  );
  const [year, setYear] = useState(fiscalYear);

  const picked: CosInsightWeek[] =
    scope === "week"
      ? weeks.filter((w) => `${w.year}:${w.weekNo}` === weekKey)
      : scope === "month"
        ? (months.find((m) => monthKeyStr(m) === monthKey)?.weeks ?? [])
        : weeks.filter((w) => w.year === year);

  const totals = COST_CENTRES.map((c) => ({
    centre: c,
    name: COST_CENTRE_LABELS[c],
    value: picked.reduce((s, w) => s + w.salesNet[c], 0),
  }));
  const total = totals.reduce((s, t) => s + t.value, 0);
  const slices = totals.filter((t) => t.value > 0);
  const pct = (v: number) =>
    total > 0 ? `${((v / total) * 100).toFixed(1)}%` : "—";

  const periodText =
    scope === "week"
      ? (() => {
          const w = picked[0];
          return w
            ? `W${w.weekNo} ${w.year} · ${ddmmyy(w.start)} – ${ddmmyy(w.end)}`
            : "";
        })()
      : scope === "month"
        ? (() => {
            const m = months.find((x) => monthKeyStr(x) === monthKey);
            return m ? `${MONTH_LABELS[m.monthIndex]} ${m.year}` : "";
          })()
        : `${year}${year === fiscalYear ? " to date" : ""}`;

  return (
    <ChartCard
      title="Sales mix by revenue centre"
      subtitle={`NET of tax · ${periodText}`}
      control={
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg bg-black/[0.04] p-0.5">
            {(["week", "month", "year"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setScope(s)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-semibold capitalize transition",
                  scope === s
                    ? "bg-[var(--venue-primary,#818a40)] text-white"
                    : "text-black/60 hover:text-black",
                )}
              >
                {s}
              </button>
            ))}
          </div>
          {scope === "week" ? (
            <select
              value={weekKey}
              onChange={(e) => setWeekKey(e.target.value)}
              className={selectClass}
              aria-label="Week"
            >
              {[...weeks].reverse().map((w) => (
                <option
                  key={`${w.year}:${w.weekNo}`}
                  value={`${w.year}:${w.weekNo}`}
                >
                  W{w.weekNo} {w.year} - {ddmmyy(w.start)} to {ddmmyy(w.end)}
                </option>
              ))}
            </select>
          ) : scope === "month" ? (
            <select
              value={monthKey}
              onChange={(e) => setMonthKey(e.target.value)}
              className={selectClass}
              aria-label="Month"
            >
              {[...months].reverse().map((m) => (
                <option key={monthKeyStr(m)} value={monthKeyStr(m)}>
                  {MONTH_LABELS[m.monthIndex]} {m.year}
                </option>
              ))}
            </select>
          ) : (
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className={selectClass}
              aria-label="Year"
            >
              {[fiscalYear, fiscalYear - 1].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          )}
        </div>
      }
    >
      {total > 0 ? (
        <div className="flex flex-col items-center gap-4 sm:flex-row">
          <div className="relative h-[240px] w-full sm:w-1/2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="58%"
                  outerRadius="88%"
                  paddingAngle={1}
                  stroke="#fff"
                  strokeWidth={2}
                  label={SliceLabel}
                  labelLine={false}
                  isAnimationActive={false}
                >
                  {slices.map((s) => (
                    <Cell key={s.centre} fill={grad(CENTRE_COLOR[s.centre])} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) =>
                    active && payload?.[0] ? (
                      <TooltipBox title={String(payload[0].name)}>
                        <span className="tabular-nums">
                          {formatMoney(Number(payload[0].value))} ·{" "}
                          {pct(Number(payload[0].value))}
                        </span>
                      </TooltipBox>
                    ) : null
                  }
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[10px] uppercase tracking-wide text-black/45">
                Total
              </span>
              <span className="text-sm font-semibold tabular-nums text-[#3D421F]">
                {compact(total)}
              </span>
            </div>
          </div>
          <table className="w-full text-sm sm:w-1/2">
            <tbody>
              {totals.map((t) => (
                <tr
                  key={t.centre}
                  className="border-b border-black/5 last:border-0"
                >
                  <td className="py-1.5 pr-2">
                    <span className="flex items-center gap-2 text-[#3D421F]">
                      <span
                        className="size-2.5 rounded-sm"
                        style={{ background: gradCss(CENTRE_COLOR[t.centre]) }}
                      />
                      {t.name}
                    </span>
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-[#3D421F]">
                    {formatMoney(t.value)}
                  </td>
                  <td className="w-14 py-1.5 text-right tabular-nums text-black/50">
                    {pct(t.value)}
                  </td>
                </tr>
              ))}
              <tr className="font-semibold text-[#3D421F]">
                <td className="pt-2">Total</td>
                <td className="pt-2 text-right tabular-nums">
                  {formatMoney(total)}
                </td>
                <td className="pt-2 text-right tabular-nums text-black/50">
                  100%
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>No sales recorded for this period.</Empty>
      )}
    </ChartCard>
  );
}

/** % inside its slice; dark ink on the light gold slice, white elsewhere. */
function SliceLabel(props: {
  cx?: number;
  cy?: number;
  midAngle?: number;
  innerRadius?: number;
  outerRadius?: number;
  percent?: number;
  payload?: { centre?: CostCentre };
}) {
  const {
    cx = 0,
    cy = 0,
    midAngle = 0,
    innerRadius = 0,
    outerRadius = 0,
    percent = 0,
  } = props;
  if (percent < 0.04) return null;
  const r = (innerRadius + outerRadius) / 2;
  const rad = (-midAngle * Math.PI) / 180;
  return (
    <text
      x={cx + r * Math.cos(rad)}
      y={cy + r * Math.sin(rad)}
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={11}
      fontWeight={600}
      fill={props.payload?.centre === "other" ? INK : "#fff"}
    >
      {(percent * 100).toFixed(1)}%
    </text>
  );
}

// ---------------------------------------------------------------------------
// 4. Last 8 weeks: closing stock (bars) vs closing stock target (line)
// ---------------------------------------------------------------------------
function StockVsTargetChart({
  label,
  weeks,
}: {
  label: string;
  weeks: CosInsightWeek[];
}) {
  const rows = weeks.map((w) => ({
    name: `W${w.weekNo}`,
    full: `W${w.weekNo} ${w.year} · ${ddmmyy(w.start)} – ${ddmmyy(w.end)}`,
    stock: w.closingStock,
    target: w.closingStockTarget,
  }));
  const missing = rows.filter((r) => r.stock == null).length;
  const hasData = rows.some((r) => Number(r.stock) || Number(r.target));

  return (
    <ChartCard
      title={`${label} closing stock vs target · last 8 weeks`}
      subtitle={`From cost runs${missing ? ` · ${missing} week${missing === 1 ? "" : "s"} without a cost run` : ""}`}
      legend={[
        { kind: "bar", color: BAR, text: "Closing stock" },
        { kind: "line", color: LINE, text: "Stock target" },
      ]}
    >
      {!hasData ? (
        <Empty>
          No closing stock or stock target entered for these weeks yet.
        </Empty>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart
            data={rows}
            margin={{ top: 24, right: 12, left: 0, bottom: 0 }}
          >
            <CartesianGrid stroke="#0000000d" vertical={false} />
            <XAxis
              dataKey="name"
              tick={axisTick}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={axisTick}
              axisLine={false}
              tickLine={false}
              width={44}
              tickFormatter={compact}
            />
            <Tooltip
              cursor={{ fill: "#0000000a" }}
              content={
                <MoneyTooltip
                  titleKey="full"
                  series={[
                    { key: "stock", label: "Closing stock", color: BAR },
                    { key: "target", label: "Stock target", color: LINE },
                  ]}
                />
              }
            />
            <Bar
              dataKey="stock"
              fill={grad(BAR)}
              radius={[4, 4, 0, 0]}
              maxBarSize={44}
            >
              <LabelList
                dataKey="stock"
                position="top"
                formatter={pointLabel}
                style={{ fontSize: 10, fill: INK }}
              />
            </Bar>
            <Line
              dataKey="target"
              stroke={LINE}
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={{ r: 4, fill: LINE, stroke: "#fff", strokeWidth: 2 }}
              activeDot={{ r: 5 }}
            >
              <LabelList
                dataKey="target"
                position="top"
                offset={8}
                formatter={pointLabel}
                style={{ fontSize: 10, fill: LINE, fontWeight: 600 }}
              />
            </Line>
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------
function ChartCard({
  title,
  subtitle,
  legend,
  control,
  children,
}: {
  title: string;
  subtitle?: string;
  legend?: { kind: "bar" | "line"; color: string; text: string }[];
  control?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-[#3D421F]">{title}</h3>
          {subtitle ? (
            <p className="mt-0.5 text-[11px] text-black/45">{subtitle}</p>
          ) : null}
        </div>
        {control}
      </div>
      {legend ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-black/60">
          {legend.map((l) => (
            <span key={l.text} className="inline-flex items-center gap-1.5">
              {l.kind === "bar" ? (
                <span
                  className="h-2.5 w-2.5 rounded-sm"
                  style={{ background: gradCss(l.color) }}
                />
              ) : (
                <span className="relative inline-block h-2.5 w-4">
                  <span
                    className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2"
                    style={{ background: l.color }}
                  />
                  <span
                    className="absolute left-1/2 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                    style={{ background: l.color }}
                  />
                </span>
              )}
              {l.text}
            </span>
          ))}
        </div>
      ) : null}
      {children}
    </Card>
  );
}

function TooltipBox({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-black/10 bg-white px-3 py-2 text-xs shadow-md">
      <div className="mb-1 font-semibold text-[#3D421F]">{title}</div>
      {children}
    </div>
  );
}

function MoneyTooltip({
  active,
  payload,
  titleKey,
  series,
  extra,
}: {
  active?: boolean;
  payload?: { payload: Record<string, unknown> }[];
  titleKey: string;
  series: { key: string; label: string; color: string }[];
  extra?: (row: Record<string, unknown>) => string;
}) {
  if (!active || !payload?.[0]) return null;
  const row = payload[0].payload;
  return (
    <TooltipBox title={String(row[titleKey] ?? "")}>
      <div className="space-y-0.5">
        {series.map((s) => (
          <div key={s.key} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-black/60">
              <span
                className="size-2 rounded-sm"
                style={{ background: gradCss(s.color) }}
              />
              {s.label}
            </span>
            <span className="tabular-nums text-[#3D421F]">
              {row[s.key] == null ? "—" : formatMoney(Number(row[s.key]))}
            </span>
          </div>
        ))}
        {extra ? (
          <div className="border-t border-black/5 pt-0.5 tabular-nums text-black/60">
            {extra(row)}
          </div>
        ) : null}
      </div>
    </TooltipBox>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex h-[240px] items-center justify-center text-sm"
      style={{ color: MUTED }}
    >
      {children}
    </div>
  );
}
