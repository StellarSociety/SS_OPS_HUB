"use client";

import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  Bar,
  BarChart,
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
import {
  computeDailySales,
  enrichDailySalesRows,
  formatDisplayDate,
  formatIsoWeekLabel,
  formatMoney,
  formatMonthLabel,
  getCurrentMonthKey,
  getIsoWeekParts,
  getWeekDayLabel,
} from "@/lib/sales/daily-sales-calculations";
import type { VenueDailySalesRecord } from "@/lib/sales/daily-sales-types";
import { aggregateColumnValues } from "@/lib/sales/sales-data-table-totals";
import {
  buildSalesTableMonthOptions,
  buildSalesTableWeekOptions,
  createEmptyDailySalesRecord,
  formatLocalDateFromDate,
  getCurrentWeekFilterKey,
  getCurrentYearKey,
  resolveSalesTableCalendarDates,
} from "@/lib/sales/sales-data-table-dates";
import {
  salesTableFilterButtonClass,
  salesTableFilterClearButtonClass,
} from "@/lib/sales/sales-data-table-ui";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { usePersistedSalesInsightsFilters } from "@/components/sales/use-persisted-sales-filters";

type PeriodMode = "week" | "month" | "year";
type EnrichedRow = ReturnType<typeof enrichDailySalesRows>[number];

type DailySalesInsightsChartsProps = {
  records: VenueDailySalesRecord[];
  totalTaxPct: number;
};

type ChartPoint = {
  saleDate: string;
  label: string;
  value: number;
};

type MetricChartPoint = ChartPoint & {
  allTimeDailyAvg?: number;
};

type WeekdayChartPoint = ChartPoint & {
  historicalAvg: number;
};

type RevenueSlice = {
  name: string;
  value: number;
  color: string;
  percentage: number;
};

type RevenueCenterPeriodSummary = {
  name: string;
  color: string;
  periodTotal: number;
  historicalAverage: number;
  comparisonPct: number | null;
};

type MetricConfig = {
  key: string;
  title: string;
  color: string;
  getValue: (row: EnrichedRow) => number;
};

const WEEKDAY_ORDER = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;

const WEEKDAY_LABELS: Record<(typeof WEEKDAY_ORDER)[number], string> = {
  MON: "Mon",
  TUE: "Tue",
  WED: "Wed",
  THU: "Thu",
  FRI: "Fri",
  SAT: "Sat",
  SUN: "Sun",
};

const SHISHA_TOBACCO_LABEL = "Shisha & Tobacco";

function getShishaTobaccoGs(row: EnrichedRow): number {
  return row.totalShishaGs + row.totalTobaccoGs;
}

const TOTAL_METRIC: MetricConfig = {
  key: "totalVenueGs",
  title: "Total Gross Sales",
  color: "#3D421F",
  getValue: (row) => row.totalVenueGs,
};

const CATEGORY_METRICS: MetricConfig[] = [
  {
    key: "totalFoodGs",
    title: "Food",
    color: "#5C6330",
    getValue: (row) => row.totalFoodGs,
  },
  {
    key: "totalBeveragesGs",
    title: "Beverages",
    color: "#7A8240",
    getValue: (row) => row.totalBeveragesGs,
  },
  {
    key: "totalWineGs",
    title: "Wine",
    color: "#98A050",
    getValue: (row) => row.totalWineGs,
  },
  {
    key: "totalShishaTobaccoGs",
    title: SHISHA_TOBACCO_LABEL,
    color: "#B6BE68",
    getValue: getShishaTobaccoGs,
  },
];

function buildYearOptions(saleDates: string[]): Array<{ value: string; label: string }> {
  const years = new Set(saleDates.map((date) => date.slice(0, 4)));
  years.add(getCurrentYearKey());

  return Array.from(years)
    .sort((a, b) => b.localeCompare(a))
    .map((value) => ({ value, label: value }));
}

function formatBarLabel(value: number, compact = false): string {
  if (!value) return "";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(compact ? 0 : 1)}k`;
  return Math.round(value).toLocaleString();
}

function barLabelClass(compact: boolean) {
  return compact ? "fill-[#3D421F] text-[9px] font-medium" : "fill-[#3D421F] text-[10px] font-medium";
}

function formatChartAxisMoney(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}k`;
  return String(Math.round(value));
}

function formatChartLabel(saleDate: string, periodMode: PeriodMode): string {
  const [year, month, day] = saleDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (periodMode === "week") {
    return date.toLocaleDateString(undefined, { weekday: "short" });
  }
  if (periodMode === "year") {
    return date.toLocaleDateString(undefined, { month: "short" });
  }
  return String(day);
}

function periodModeBarSize(pointCount: number, compact = false): number {
  if (compact) {
    if (pointCount <= 7) return 28;
    if (pointCount <= 14) return 16;
    return 10;
  }
  if (pointCount <= 7) return 36;
  if (pointCount <= 14) return 20;
  return 12;
}

function periodSelectWidthClass(_periodMode: PeriodMode): string {
  return "w-[17.5rem]";
}

function periodNavButtonClass() {
  return "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-black/10 bg-white text-[#3D421F] transition-colors hover:bg-[var(--venue-secondary)]/30 disabled:cursor-not-allowed disabled:opacity-40";
}

function periodToggleClass(active: boolean) {
  return cn(
    "flex h-full min-w-0 flex-1 items-center justify-center rounded-[5px] px-2 text-sm font-bold transition-colors",
    active
      ? "bg-[var(--venue-primary,#3D421F)] text-white"
      : "text-[#3D421F] hover:bg-[var(--venue-primary,#3D421F)]/10",
  );
}

function buildHistoricalMonthAverages(
  allRows: EnrichedRow[],
  getValue: (row: EnrichedRow) => number,
): Record<string, number> {
  const monthYearTotals = new Map<string, number>();
  for (const row of allRows) {
    const monthKey = row.sale_date.slice(0, 7);
    monthYearTotals.set(monthKey, (monthYearTotals.get(monthKey) ?? 0) + getValue(row));
  }

  const totalsByMonthNumber = new Map<string, number[]>();
  for (const [monthKey, total] of monthYearTotals) {
    const monthNumber = monthKey.slice(5, 7);
    const existing = totalsByMonthNumber.get(monthNumber) ?? [];
    existing.push(total);
    totalsByMonthNumber.set(monthNumber, existing);
  }

  const averages: Record<string, number> = {};
  for (const [monthNumber, totals] of totalsByMonthNumber) {
    averages[monthNumber] =
      totals.reduce((sum, value) => sum + value, 0) / totals.length;
  }
  return averages;
}

function enrichMetricChartPointsWithHistoricalAverage(
  points: ChartPoint[],
  periodMode: PeriodMode,
  allRows: EnrichedRow[],
  getValue: (row: EnrichedRow) => number,
): MetricChartPoint[] {
  if (allRows.length === 0) return points;

  if (periodMode === "year") {
    const monthAverages = buildHistoricalMonthAverages(allRows, getValue);
    return points.map((point) => ({
      ...point,
      allTimeDailyAvg: monthAverages[point.saleDate.slice(5, 7)] ?? 0,
    }));
  }

  const weekdayAverages = buildHistoricalWeekdayAverages(allRows, getValue);
  return points.map((point) => {
    const weekday = getWeekDayLabel(point.saleDate) as (typeof WEEKDAY_ORDER)[number];
    return {
      ...point,
      allTimeDailyAvg: weekdayAverages[weekday] ?? 0,
    };
  });
}

function historicalLineLabel(periodMode: PeriodMode): string {
  if (periodMode === "year") return "All-time month avg";
  return "All-time weekday avg";
}

function buildMetricPoints(
  periodRows: EnrichedRow[],
  periodMode: PeriodMode,
  getValue: (row: EnrichedRow) => number,
): ChartPoint[] {
  if (periodMode !== "year") {
    return periodRows.map((row) => ({
      saleDate: row.sale_date,
      label: formatChartLabel(row.sale_date, periodMode),
      value: getValue(row),
    }));
  }

  const byMonth = new Map<string, { saleDate: string; value: number }>();
  for (const row of periodRows) {
    const monthKey = row.sale_date.slice(0, 7);
    const current = byMonth.get(monthKey);
    const value = getValue(row);
    if (current) {
      current.value += value;
    } else {
      byMonth.set(monthKey, { saleDate: `${monthKey}-01`, value });
    }
  }

  return Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monthKey, entry]) => ({
      saleDate: entry.saleDate,
      label: formatChartLabel(entry.saleDate, periodMode),
      value: entry.value,
    }));
}

function buildWeekdayDistribution(
  periodRows: EnrichedRow[],
  getValue: (row: EnrichedRow) => number,
): ChartPoint[] {
  const totals = new Map<string, number>();
  for (const weekday of WEEKDAY_ORDER) {
    totals.set(weekday, 0);
  }

  for (const row of periodRows) {
    const weekday = row.weekDay as (typeof WEEKDAY_ORDER)[number];
    if (!totals.has(weekday)) continue;
    totals.set(weekday, (totals.get(weekday) ?? 0) + getValue(row));
  }

  return WEEKDAY_ORDER.map((weekday) => ({
    saleDate: weekday,
    label: WEEKDAY_LABELS[weekday],
    value: totals.get(weekday) ?? 0,
  }));
}

function buildHistoricalWeekdayAverages(
  allRows: EnrichedRow[],
  getValue: (row: EnrichedRow) => number,
): Record<(typeof WEEKDAY_ORDER)[number], number> {
  const totals = new Map<string, number>();
  const counts = new Map<string, number>();

  for (const weekday of WEEKDAY_ORDER) {
    totals.set(weekday, 0);
    counts.set(weekday, 0);
  }

  for (const row of allRows) {
    const weekday = row.weekDay as (typeof WEEKDAY_ORDER)[number];
    if (!totals.has(weekday)) continue;
    totals.set(weekday, (totals.get(weekday) ?? 0) + getValue(row));
    counts.set(weekday, (counts.get(weekday) ?? 0) + 1);
  }

  return WEEKDAY_ORDER.reduce(
    (acc, weekday) => {
      const count = counts.get(weekday) ?? 0;
      acc[weekday] = count > 0 ? (totals.get(weekday) ?? 0) / count : 0;
      return acc;
    },
    {} as Record<(typeof WEEKDAY_ORDER)[number], number>,
  );
}

function mergeWeekdayChartPoints(
  periodPoints: ChartPoint[],
  historicalAverages: Record<(typeof WEEKDAY_ORDER)[number], number>,
): WeekdayChartPoint[] {
  return periodPoints.map((point) => ({
    ...point,
    historicalAvg:
      historicalAverages[point.saleDate as (typeof WEEKDAY_ORDER)[number]] ?? 0,
  }));
}

function buildRevenueMixSlices(
  categoryTotals: Array<{ title: string; color: string; periodTotal: number }>,
  periodTotalGross: number,
): RevenueSlice[] {
  const slices: RevenueSlice[] = categoryTotals
    .filter((category) => category.periodTotal > 0)
    .map((category) => ({
      name: category.title,
      value: category.periodTotal,
      color: category.color,
      percentage:
        periodTotalGross > 0 ? (category.periodTotal / periodTotalGross) * 100 : 0,
    }));

  const categorySum = categoryTotals.reduce(
    (sum, category) => sum + category.periodTotal,
    0,
  );
  const other = periodTotalGross - categorySum;
  if (other > 0.005) {
    slices.push({
      name: "Other",
      value: other,
      color: "#D4D8BC",
      percentage: periodTotalGross > 0 ? (other / periodTotalGross) * 100 : 0,
    });
  }

  return slices;
}

function getPeriodBucketKey(saleDate: string, periodMode: PeriodMode): string {
  if (periodMode === "week") {
    const { week, year } = getIsoWeekParts(saleDate);
    return `${year}-W${String(week).padStart(2, "0")}`;
  }
  if (periodMode === "month") {
    return saleDate.slice(0, 7);
  }
  return saleDate.slice(0, 4);
}

function historicalAverageLabel(periodMode: PeriodMode): string {
  if (periodMode === "week") return "vs all-time avg / week";
  if (periodMode === "month") return "vs all-time avg / month";
  return "vs all-time avg / year";
}

function selectedPeriodTotalLabel(periodMode: PeriodMode): string {
  if (periodMode === "week") return "Selected week total";
  if (periodMode === "month") return "Selected month total";
  return "Selected year total";
}

function computeComparisonPct(
  current: number,
  average: number,
): number | null {
  if (average <= 0) {
    if (current <= 0) return null;
    return 100;
  }
  return ((current - average) / average) * 100;
}

function formatComparisonPct(value: number | null): string {
  if (value == null) return "—";
  if (Math.abs(value) < 0.05) return "0%";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(0)}%`;
}

function comparisonPctClass(value: number | null): string {
  if (value == null || Math.abs(value) < 0.05) return "text-black/50";
  if (value > 0) return "text-emerald-700";
  return "text-amber-700";
}

function buildHistoricalPeriodAverage(
  allRows: EnrichedRow[],
  periodMode: PeriodMode,
  getValue: (row: EnrichedRow) => number,
): number {
  const buckets = new Map<string, number>();
  for (const row of allRows) {
    const key = getPeriodBucketKey(row.sale_date, periodMode);
    buckets.set(key, (buckets.get(key) ?? 0) + getValue(row));
  }

  const bucketTotals = Array.from(buckets.values());
  if (bucketTotals.length === 0) return 0;
  return bucketTotals.reduce((sum, value) => sum + value, 0) / bucketTotals.length;
}

function buildRevenueCenterPeriodSummaries(
  allRows: EnrichedRow[],
  periodMode: PeriodMode,
  categoryPeriodTotals: Array<{ title: string; color: string; periodTotal: number }>,
): RevenueCenterPeriodSummary[] {
  if (allRows.length === 0) return [];

  return CATEGORY_METRICS.map((metric) => {
    const buckets = new Map<string, number>();
    for (const row of allRows) {
      const key = getPeriodBucketKey(row.sale_date, periodMode);
      buckets.set(key, (buckets.get(key) ?? 0) + metric.getValue(row));
    }

    const bucketTotals = Array.from(buckets.values());
    const historicalAverage =
      bucketTotals.length > 0
        ? bucketTotals.reduce((sum, value) => sum + value, 0) / bucketTotals.length
        : 0;

    const categoryTotal =
      categoryPeriodTotals.find((category) => category.title === metric.title)
        ?.periodTotal ?? 0;

    return {
      name: metric.title,
      color: metric.color,
      periodTotal: categoryTotal,
      historicalAverage,
      comparisonPct: computeComparisonPct(categoryTotal, historicalAverage),
    };
  });
}

function formatPercentage(value: number): string {
  if (value > 0 && value < 0.1) return "<0.1%";
  if (value >= 10) return `${value.toFixed(0)}%`;
  return `${value.toFixed(1)}%`;
}

type RevenueMixCalloutProps = {
  cx?: number;
  cy?: number;
  midAngle?: number;
  outerRadius?: number;
  payload?: RevenueSlice;
};

function renderRevenueMixCallout(props: RevenueMixCalloutProps) {
  const { cx, cy, midAngle, outerRadius, payload } = props;
  if (
    cx == null ||
    cy == null ||
    midAngle == null ||
    outerRadius == null ||
    !payload
  ) {
    return null;
  }

  const radian = (-midAngle * Math.PI) / 180;
  const startRadius = Number(outerRadius);
  const sx = cx + startRadius * Math.cos(radian);
  const sy = cy + startRadius * Math.sin(radian);
  const mx = cx + (startRadius + 5) * Math.cos(radian);
  const my = cy + (startRadius + 5) * Math.sin(radian);
  const isRight = mx >= cx;
  const ex = mx + (isRight ? 8 : -8);
  const ey = my;
  const textX = ex + (isRight ? 3 : -3);
  const textAnchor = isRight ? "start" : "end";

  return (
    <g>
      <path
        d={`M${sx},${sy}L${mx},${my}L${ex},${ey}`}
        stroke={payload.color}
        strokeWidth={1.5}
        fill="none"
        strokeOpacity={0.85}
      />
      <text
        x={textX}
        y={ey}
        textAnchor={textAnchor}
        dominantBaseline="central"
        fill="#3D421F"
        fontSize={12}
        fontWeight={600}
      >
        {`${payload.name} · ${formatPercentage(payload.percentage)}`}
      </text>
    </g>
  );
}

function MetricChart({
  title,
  color,
  points,
  headlineValue,
  headlineLabel,
  compact = false,
  periodMode,
}: {
  title: string;
  color: string;
  points: MetricChartPoint[];
  headlineValue: number;
  headlineLabel: string;
  compact?: boolean;
  periodMode?: PeriodMode;
}) {
  const showAllTimeLine = points.some((point) => (point.allTimeDailyAvg ?? 0) > 0);
  const ChartRoot = showAllTimeLine ? ComposedChart : BarChart;
  const allTimeLabel = periodMode ? historicalLineLabel(periodMode) : "All-time avg";

  return (
    <Card className={cn("flex h-full flex-col p-4", compact && "p-3")}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3
            className={cn(
              "font-serif text-[#3D421F]",
              compact ? "text-sm" : "text-base",
            )}
          >
            {title}
          </h3>
          <p
            className={cn(
              "mt-1 font-semibold tabular-nums text-[#3D421F]",
              compact ? "text-lg" : "text-2xl",
            )}
          >
            {formatMoney(headlineValue)}
          </p>
          <p className="text-xs text-black/50">{headlineLabel}</p>
        </div>
        {showAllTimeLine && compact ? (
          <span className="inline-flex items-center gap-1.5 text-[10px] text-black/55">
            <span className="h-0.5 w-4 rounded bg-[#C45C3E]" />
            {allTimeLabel}
          </span>
        ) : null}
      </div>
      <div className={cn("w-full", compact ? "h-40" : "h-52")}>
        <ResponsiveContainer width="100%" height="100%">
          <ChartRoot
            data={points}
            margin={{ top: compact ? 16 : 20, right: 4, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: compact ? 10 : 11, fill: "rgba(0,0,0,0.55)" }}
              axisLine={{ stroke: "rgba(0,0,0,0.08)" }}
              tickLine={false}
              interval={points.length > 14 ? 2 : 0}
            />
            <YAxis
              tickFormatter={formatChartAxisMoney}
              tick={{ fontSize: compact ? 10 : 11, fill: "rgba(0,0,0,0.55)" }}
              axisLine={false}
              tickLine={false}
              width={44}
            />
            <Tooltip
              cursor={{ fill: "rgba(61,66,31,0.06)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const point = payload[0].payload as MetricChartPoint;
                const dateLabel = /^\d{4}-\d{2}-\d{2}$/.test(point.saleDate)
                  ? formatDisplayDate(point.saleDate)
                  : point.label;
                return (
                  <div className="rounded-md border border-black/10 bg-white px-3 py-2 text-xs shadow-sm">
                    <p className="font-medium text-[#3D421F]">{dateLabel}</p>
                    <p className="mt-0.5 tabular-nums text-black/70">
                      {formatMoney(point.value)}
                    </p>
                    {showAllTimeLine && point.allTimeDailyAvg != null ? (
                      <p className="mt-0.5 tabular-nums text-black/70">
                        {allTimeLabel}: {formatMoney(point.allTimeDailyAvg)}
                      </p>
                    ) : null}
                  </div>
                );
              }}
            />
            <Bar
              dataKey="value"
              fill={color}
              radius={[4, 4, 0, 0]}
              maxBarSize={periodModeBarSize(points.length, compact)}
            >
              <LabelList
                dataKey="value"
                position="top"
                formatter={(value) => formatBarLabel(Number(value), compact)}
                className={barLabelClass(compact)}
              />
            </Bar>
            {showAllTimeLine ? (
              <Line
                type="monotone"
                dataKey="allTimeDailyAvg"
                stroke="#C45C3E"
                strokeWidth={2}
                dot={{ r: 3, fill: "#C45C3E", stroke: "#fff", strokeWidth: 1.5 }}
                activeDot={{ r: 4 }}
              />
            ) : null}
          </ChartRoot>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function RevenueMixChart({
  slices,
  periodTotal,
  periodSummaries,
  periodMode,
  totalHistoricalAverage,
  totalComparisonPct,
}: {
  slices: RevenueSlice[];
  periodTotal: number;
  periodSummaries: RevenueCenterPeriodSummary[];
  periodMode: PeriodMode;
  totalHistoricalAverage: number;
  totalComparisonPct: number | null;
}) {
  return (
    <Card className="flex h-full flex-col p-4">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-serif text-base text-[#3D421F]">Revenue Mix</h3>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-[#3D421F]">
            {formatMoney(periodTotal)}
          </p>
          <p className="text-xs text-black/50">
            {selectedPeriodTotalLabel(periodMode)}
          </p>
          {totalHistoricalAverage > 0 || periodTotal > 0 ? (
            <p className="mt-0.5 text-xs text-black/50">
              All-time avg {formatMoney(totalHistoricalAverage)}{" "}
              <span className={comparisonPctClass(totalComparisonPct)}>
                ({formatComparisonPct(totalComparisonPct)} vs avg)
              </span>
            </p>
          ) : null}
        </div>
        {periodSummaries.length > 0 ? (
          <div className="max-w-[14rem] shrink-0 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-black/45">
              {historicalAverageLabel(periodMode)}
            </p>
            <ul className="mt-1.5 space-y-1.5">
              {periodSummaries.map((entry) => (
                <li key={entry.name}>
                  <div className="flex items-center justify-end gap-1.5 text-[11px] leading-tight">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: entry.color }}
                    />
                    <span className="truncate text-black/60">{entry.name}</span>
                    <span className="shrink-0 tabular-nums font-medium text-[#3D421F]">
                      {formatMoney(entry.periodTotal)}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 tabular-nums font-semibold",
                        comparisonPctClass(entry.comparisonPct),
                      )}
                    >
                      {formatComparisonPct(entry.comparisonPct)}
                    </span>
                  </div>
                  <p className="pr-0.5 text-[10px] tabular-nums text-black/45">
                    avg {formatMoney(entry.historicalAverage)}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      {slices.length > 0 ? (
        <div className="min-h-52 w-full flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart
              margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
              style={{ overflow: "visible" }}
            >
              <Pie
                data={slices}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius="50%"
                outerRadius="86%"
                paddingAngle={2}
                stroke="#fff"
                strokeWidth={2}
                isAnimationActive={false}
                label={renderRevenueMixCallout}
                labelLine={false}
              >
                {slices.map((slice) => (
                  <Cell key={slice.name} fill={slice.color} />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const slice = payload[0].payload as RevenueSlice;
                  return (
                    <div className="rounded-md border border-black/10 bg-white px-3 py-2 text-xs shadow-sm">
                      <p className="font-medium text-[#3D421F]">{slice.name}</p>
                      <p className="mt-0.5 tabular-nums text-black/70">
                        {formatMoney(slice.value)}
                      </p>
                      <p className="mt-0.5 tabular-nums text-black/70">
                        {formatPercentage(slice.percentage)} of total sales
                      </p>
                    </div>
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-52 flex-1 items-center justify-center text-xs text-black/45">
          No sales data for this period
        </div>
      )}
    </Card>
  );
}

function WeekdayDistributionChart({
  points,
  headlineValue,
  headlineLabel,
}: {
  points: WeekdayChartPoint[];
  headlineValue: number;
  headlineLabel: string;
}) {
  return (
    <Card className="flex h-full flex-col p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-serif text-base text-[#3D421F]">
            Sales Distribution by Weekday
          </h3>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-[#3D421F]">
            {formatMoney(headlineValue)}
          </p>
          <p className="text-xs text-black/50">{headlineLabel}</p>
        </div>
        <div className="flex flex-col gap-1 text-xs text-black/55">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#6B7340]" />
            Selected period
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded bg-[#C45C3E]" />
            Venue historical avg
          </span>
        </div>
      </div>
      <div className="h-52 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={points}
            margin={{ top: 20, right: 8, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "rgba(0,0,0,0.55)" }}
              axisLine={{ stroke: "rgba(0,0,0,0.08)" }}
              tickLine={false}
            />
            <YAxis
              tickFormatter={formatChartAxisMoney}
              tick={{ fontSize: 11, fill: "rgba(0,0,0,0.55)" }}
              axisLine={false}
              tickLine={false}
              width={44}
            />
            <Tooltip
              cursor={{ fill: "rgba(61,66,31,0.06)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const point = payload[0].payload as WeekdayChartPoint;
                return (
                  <div className="rounded-md border border-black/10 bg-white px-3 py-2 text-xs shadow-sm">
                    <p className="font-medium text-[#3D421F]">{point.label}</p>
                    <p className="mt-0.5 tabular-nums text-black/70">
                      Period: {formatMoney(point.value)}
                    </p>
                    <p className="mt-0.5 tabular-nums text-black/70">
                      Venue avg: {formatMoney(point.historicalAvg)}
                    </p>
                  </div>
                );
              }}
            />
            <Bar
              dataKey="value"
              fill="#6B7340"
              radius={[4, 4, 0, 0]}
              maxBarSize={36}
            >
              <LabelList
                dataKey="value"
                position="top"
                formatter={(value) => formatBarLabel(Number(value))}
                className={barLabelClass(false)}
              />
            </Bar>
            <Line
              type="monotone"
              dataKey="historicalAvg"
              stroke="#C45C3E"
              strokeWidth={2.5}
              dot={{ r: 4, fill: "#C45C3E", stroke: "#fff", strokeWidth: 1.5 }}
              activeDot={{ r: 5 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

export function DailySalesInsightsCharts({
  records,
  totalTaxPct,
}: DailySalesInsightsChartsProps) {
  const {
    periodMode,
    weekFilter,
    monthFilter,
    yearFilter,
    toDateOnly,
    selectPeriodMode,
    applyCurrentPeriod,
    setActivePeriodValue,
    setToDateOnly,
  } = usePersistedSalesInsightsFilters();

  const allRows = useMemo(
    () => enrichDailySalesRows(records, totalTaxPct),
    [records, totalTaxPct],
  );

  const weekOptions = useMemo(
    () =>
      buildSalesTableWeekOptions(
        allRows.map((row) => row.sale_date),
        formatIsoWeekLabel,
        getIsoWeekParts,
      ),
    [allRows],
  );

  const monthOptions = useMemo(
    () =>
      buildSalesTableMonthOptions(
        allRows.map((row) => row.sale_date),
        formatMonthLabel,
        getCurrentMonthKey,
      ),
    [allRows],
  );

  const yearOptions = useMemo(
    () => buildYearOptions(allRows.map((row) => row.sale_date)),
    [allRows],
  );

  const activeFilterKey =
    periodMode === "week"
      ? weekFilter
      : periodMode === "month"
        ? monthFilter
        : yearFilter;

  const periodOptions =
    periodMode === "week"
      ? weekOptions
      : periodMode === "month"
        ? monthOptions
        : yearOptions;

  const periodRows = useMemo(() => {
    const recordsByDate = new Map(allRows.map((row) => [row.sale_date, row]));
    const calendarDates = resolveSalesTableCalendarDates({
      fromDate: "",
      toDate: "",
      weekFilter: periodMode === "week" ? weekFilter : "",
      monthFilter: periodMode === "month" ? monthFilter : "",
      yearFilter: periodMode === "year" ? yearFilter : "",
    });
    const venueId = records[0]?.venue_id ?? "";

    if (!calendarDates) return allRows;

    const cutoff = toDateOnly ? formatLocalDateFromDate(new Date()) : null;
    const scopedDates = cutoff
      ? calendarDates.filter((saleDate) => saleDate <= cutoff)
      : calendarDates;

    return scopedDates.map((saleDate) => {
      const existing = recordsByDate.get(saleDate);
      if (existing) return existing;

      const emptyRecord = createEmptyDailySalesRecord(saleDate, venueId);
      return {
        ...emptyRecord,
        ...computeDailySales(emptyRecord, totalTaxPct),
      };
    });
  }, [
    allRows,
    records,
    periodMode,
    weekFilter,
    monthFilter,
    yearFilter,
    totalTaxPct,
    toDateOnly,
  ]);

  const totalSeries = useMemo(() => {
    const getValue = TOTAL_METRIC.getValue;
    const points = buildMetricPoints(periodRows, periodMode, getValue);
    const periodTotal = aggregateColumnValues(periodRows, getValue, "sum") ?? 0;
    const dailyAverage =
      periodRows.length > 0 ? periodTotal / periodRows.length : 0;
    const weekdayPoints = buildWeekdayDistribution(periodRows, getValue);
    const historicalWeekdayAverages = buildHistoricalWeekdayAverages(
      allRows,
      getValue,
    );
    const weekdayChartPoints = mergeWeekdayChartPoints(
      weekdayPoints,
      historicalWeekdayAverages,
    );
    const overallHistoricalDailyAverage =
      allRows.length > 0
        ? allRows.reduce((sum, row) => sum + getValue(row), 0) / allRows.length
        : 0;

    return {
      points,
      periodTotal,
      dailyAverage,
      weekdayChartPoints,
      overallHistoricalDailyAverage,
    };
  }, [periodRows, periodMode, allRows]);

  const categorySeries = useMemo(() => {
    return CATEGORY_METRICS.map((metric) => {
      const points = buildMetricPoints(periodRows, periodMode, metric.getValue);
      const chartPoints = enrichMetricChartPointsWithHistoricalAverage(
        points,
        periodMode,
        allRows,
        metric.getValue,
      );
      const periodTotal =
        aggregateColumnValues(periodRows, metric.getValue, "sum") ?? 0;
      const dailyAverage =
        periodRows.length > 0 ? periodTotal / periodRows.length : 0;
      return { metric, chartPoints, periodTotal, dailyAverage };
    });
  }, [periodRows, periodMode, allRows]);

  const revenueMixSlices = useMemo(() => {
    return buildRevenueMixSlices(
      categorySeries.map(({ metric, periodTotal }) => ({
        title: metric.title,
        color: metric.color,
        periodTotal,
      })),
      totalSeries.periodTotal,
    );
  }, [categorySeries, totalSeries.periodTotal]);

  const revenueCenterPeriodSummaries = useMemo(() => {
    return buildRevenueCenterPeriodSummaries(
      allRows,
      periodMode,
      categorySeries.map(({ metric, periodTotal }) => ({
        title: metric.title,
        color: metric.color,
        periodTotal,
      })),
    );
  }, [allRows, periodMode, categorySeries]);

  const totalHistoricalAverage = useMemo(
    () =>
      buildHistoricalPeriodAverage(allRows, periodMode, TOTAL_METRIC.getValue),
    [allRows, periodMode],
  );

  const totalComparisonPct = useMemo(
    () => computeComparisonPct(totalSeries.periodTotal, totalHistoricalAverage),
    [totalSeries.periodTotal, totalHistoricalAverage],
  );

  const currentPeriodLabel =
    periodMode === "week" ? "week" : periodMode === "month" ? "month" : "year";

  const toDateShortLabel =
    periodMode === "week" ? "WTD" : periodMode === "month" ? "MTD" : "YTD";
  const toDateLongLabel =
    periodMode === "week"
      ? "Week to date"
      : periodMode === "month"
        ? "Month to date"
        : "Year to date";

  const activePeriodIndex = periodOptions.findIndex(
    (option) => option.value === activeFilterKey,
  );
  const canGoToPreviousPeriod =
    activePeriodIndex >= 0 && activePeriodIndex < periodOptions.length - 1;
  const canGoToNextPeriod = activePeriodIndex > 0;

  function stepActivePeriod(step: number) {
    if (activePeriodIndex === -1) return;
    const nextIndex = activePeriodIndex + step;
    const nextOption = periodOptions[nextIndex];
    if (!nextOption) return;
    setActivePeriodValue(nextOption.value);
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-black/45">
              Period
            </span>
            <div
              className="inline-flex h-9 w-56 shrink-0 rounded-md border border-[var(--venue-primary,#3D421F)]/25 bg-[var(--venue-primary,#3D421F)]/5 p-0.5"
              role="group"
              aria-label="Period"
            >
              <button
                type="button"
                className={periodToggleClass(periodMode === "week")}
                onClick={() => selectPeriodMode("week")}
              >
                Week
              </button>
              <button
                type="button"
                className={periodToggleClass(periodMode === "month")}
                onClick={() => selectPeriodMode("month")}
              >
                Monthly
              </button>
              <button
                type="button"
                className={periodToggleClass(periodMode === "year")}
                onClick={() => selectPeriodMode("year")}
              >
                Year
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                className={periodNavButtonClass()}
                onClick={() => stepActivePeriod(1)}
                disabled={!canGoToPreviousPeriod}
                aria-label={`Previous ${currentPeriodLabel}`}
                title={`Previous ${currentPeriodLabel}`}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <select
                id="daily-sales-insights-period"
                value={activeFilterKey}
                onChange={(event) => setActivePeriodValue(event.target.value)}
                className={cn(
                  "h-9 shrink-0 rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F]",
                  periodSelectWidthClass(periodMode),
                )}
              >
                {periodOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={periodNavButtonClass()}
                onClick={() => stepActivePeriod(-1)}
                disabled={!canGoToNextPeriod}
                aria-label={`Next ${currentPeriodLabel}`}
                title={`Next ${currentPeriodLabel}`}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <button
            type="button"
            className={salesTableFilterButtonClass()}
            onClick={applyCurrentPeriod}
          >
            This {currentPeriodLabel}
          </button>

          <button
            type="button"
            className={
              toDateOnly
                ? salesTableFilterButtonClass()
                : salesTableFilterClearButtonClass()
            }
            onClick={() => setToDateOnly((prev) => !prev)}
            aria-pressed={toDateOnly}
            title={`${toDateLongLabel}${toDateOnly ? " (on)" : ""}`}
          >
            {toDateShortLabel}
          </button>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3 lg:items-stretch">
        <MetricChart
          title={TOTAL_METRIC.title}
          color={TOTAL_METRIC.color}
          points={totalSeries.points}
          headlineValue={totalSeries.periodTotal}
          headlineLabel={`Daily avg ${formatMoney(totalSeries.dailyAverage)}`}
        />
        <WeekdayDistributionChart
          points={totalSeries.weekdayChartPoints}
          headlineValue={totalSeries.dailyAverage}
          headlineLabel={`Venue historical daily avg ${formatMoney(totalSeries.overallHistoricalDailyAverage)}`}
        />
        <RevenueMixChart
          slices={revenueMixSlices}
          periodTotal={totalSeries.periodTotal}
          periodSummaries={revenueCenterPeriodSummaries}
          periodMode={periodMode}
          totalHistoricalAverage={totalHistoricalAverage}
          totalComparisonPct={totalComparisonPct}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {categorySeries.map(({ metric, chartPoints, periodTotal, dailyAverage }) => (
          <MetricChart
            key={metric.key}
            title={metric.title}
            color={metric.color}
            points={chartPoints}
            headlineValue={periodTotal}
            headlineLabel={`Daily avg ${formatMoney(dailyAverage)}`}
            periodMode={periodMode}
            compact
          />
        ))}
      </div>
    </div>
  );
}
