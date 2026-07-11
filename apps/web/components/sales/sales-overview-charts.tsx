"use client";

import { useMemo } from "react";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import {
  formatDisplayDate,
  formatMoney,
  formatMonthLabel,
} from "@/lib/sales/daily-sales-calculations";
import type { VenueDailySalesRecord } from "@/lib/sales/daily-sales-types";
import {
  buildAverageSpendInsights,
  buildMonthWeekComparison,
  buildOverviewHeadlineStats,
  buildWeeklySalesTrend,
  buildYearToDateMonthlyTrend,
  defaultOverviewMonthKey,
  enrichOverviewRows,
  formatMtdDayRange,
  getPreviousMonthKey,
  type MonthWeekComparisonPoint,
} from "@/lib/sales/sales-overview-aggregations";
import { parseWeekFilterKey } from "@/lib/sales/sales-data-table-dates";
import { groupedBarChartLayout } from "@/lib/sales/sales-chart-bar-layout";

type SalesOverviewChartsProps = {
  records: VenueDailySalesRecord[];
  totalTaxPct: number;
};

const CURRENT_BAR = "#3D421F";
const PREVIOUS_BAR = "#B6BE68";
const TREND_BAR = "#6B7340";
const TREND_LINE = "#C45C3E";

function formatChartAxisMoney(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}k`;
  return String(Math.round(value));
}

function formatBarLabel(value: number): string {
  if (!value) return "";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return Math.round(value).toLocaleString();
}

function formatAsphLabel(value: number | null | undefined): string {
  if (value == null) return "—";
  return formatMoney(value);
}

function OverviewTooltipCard({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ label: string; value: string }>;
}) {
  return (
    <div className="rounded-md border border-black/10 bg-white px-3 py-2 text-xs shadow-sm">
      <p className="font-medium text-[#3D421F]">{title}</p>
      {rows.map((row) => (
        <p key={row.label} className="mt-0.5 tabular-nums text-black/70">
          {row.label}: {row.value}
        </p>
      ))}
    </div>
  );
}

function YearToDateMonthlyTrendChart({
  year,
  points,
}: {
  year: number;
  points: Array<{ label: string; value: number; trendAvg: number }>;
}) {
  const monthsWithSales = points.filter((point) => point.value > 0).length;

  return (
    <Card className="flex h-full flex-col p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-serif text-base text-[#3D421F]">
            Monthly Sales Trend
          </h3>
          <p className="mt-1 text-xs text-black/50">
            Year-to-date {year} · Jan through{" "}
            {points.at(-1)?.label ?? "—"} ({monthsWithSales}{" "}
            {monthsWithSales === 1 ? "month" : "months"} with sales)
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[10px] text-black/55">
          <span className="h-0.5 w-4 rounded bg-[#C45C3E]" />
          YTD average
        </span>
      </div>
      <div className="h-56 w-full">
        {points.some((point) => point.value > 0) ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={points} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
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
                  const point = payload[0].payload as {
                    label: string;
                    value: number;
                    trendAvg: number;
                  };
                  return (
                    <OverviewTooltipCard
                      title={point.label}
                      rows={[
                        { label: "Monthly total", value: formatMoney(point.value) },
                        { label: "YTD average", value: formatMoney(point.trendAvg) },
                      ]}
                    />
                  );
                }}
              />
              <Bar
                dataKey="value"
                fill={TREND_BAR}
                radius={[4, 4, 0, 0]}
                maxBarSize={40}
              >
                <LabelList
                  dataKey="value"
                  position="top"
                  formatter={(value) => formatBarLabel(Number(value))}
                  className="fill-[#3D421F] text-[9px] font-medium"
                />
              </Bar>
              <Line
                type="monotone"
                dataKey="trendAvg"
                stroke={TREND_LINE}
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-black/45">
            No monthly sales data for {year} yet
          </div>
        )}
      </div>
    </Card>
  );
}

function MonthWeekComparisonChart({
  points,
  currentMonthLabel,
  previousMonthLabel,
}: {
  points: MonthWeekComparisonPoint[];
  currentMonthLabel: string;
  previousMonthLabel: string;
}) {
  return (
    <Card className="flex h-full flex-col p-4">
      <div className="mb-3">
        <h3 className="font-serif text-base text-[#3D421F]">
          Monthly Sales by Week
        </h3>
        <p className="mt-1 text-xs text-black/50">
          {currentMonthLabel} vs {previousMonthLabel}
        </p>
      </div>
      <div className="h-56 w-full">
        {points.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={points}
              margin={{ top: 20, right: 8, left: 0, bottom: 0 }}
              {...groupedBarChartLayout}
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
                  const point = payload[0].payload as MonthWeekComparisonPoint;
                  return (
                    <OverviewTooltipCard
                      title={`Week ${point.label.slice(1)}`}
                      rows={[
                        { label: currentMonthLabel, value: formatMoney(point.current) },
                        { label: previousMonthLabel, value: formatMoney(point.previous) },
                      ]}
                    />
                  );
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                formatter={(value) => (
                  <span className="text-black/60">{value}</span>
                )}
              />
              <Bar
                dataKey="current"
                name={currentMonthLabel}
                fill={CURRENT_BAR}
                radius={[4, 4, 0, 0]}
                maxBarSize={28}
              >
                <LabelList
                  dataKey="current"
                  position="top"
                  formatter={(value) => formatBarLabel(Number(value))}
                  className="fill-[#3D421F] text-[9px] font-medium"
                />
              </Bar>
              <Bar
                dataKey="previous"
                name={previousMonthLabel}
                fill={PREVIOUS_BAR}
                radius={[4, 4, 0, 0]}
                maxBarSize={28}
              >
                <LabelList
                  dataKey="previous"
                  position="top"
                  formatter={(value) => formatBarLabel(Number(value))}
                  className="fill-[#3D421F] text-[9px] font-medium"
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-black/45">
            No sales data for this comparison
          </div>
        )}
      </div>
    </Card>
  );
}

function WeeklySalesTrendChart({
  points,
}: {
  points: Array<{ label: string; value: number; trendAvg: number }>;
}) {
  return (
    <Card className="flex h-full flex-col p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-serif text-base text-[#3D421F]">
            Weekly Sales Trend
          </h3>
          <p className="mt-1 text-xs text-black/50">
            Last {points.length} weeks with sales data
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[10px] text-black/55">
          <span className="h-0.5 w-4 rounded bg-[#C45C3E]" />
          Period average
        </span>
      </div>
      <div className="h-56 w-full">
        {points.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={points} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "rgba(0,0,0,0.55)" }}
                axisLine={{ stroke: "rgba(0,0,0,0.08)" }}
                tickLine={false}
                interval={0}
                angle={-20}
                textAnchor="end"
                height={48}
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
                  const point = payload[0].payload as {
                    label: string;
                    value: number;
                    trendAvg: number;
                  };
                  return (
                    <OverviewTooltipCard
                      title={point.label}
                      rows={[
                        { label: "Weekly total", value: formatMoney(point.value) },
                        {
                          label: "Period average",
                          value: formatMoney(point.trendAvg),
                        },
                      ]}
                    />
                  );
                }}
              />
              <Bar
                dataKey="value"
                fill={TREND_BAR}
                radius={[4, 4, 0, 0]}
                maxBarSize={32}
              >
                <LabelList
                  dataKey="value"
                  position="top"
                  formatter={(value) => formatBarLabel(Number(value))}
                  className="fill-[#3D421F] text-[9px] font-medium"
                />
              </Bar>
              <Line
                type="monotone"
                dataKey="trendAvg"
                stroke={TREND_LINE}
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-black/45">
            No weekly sales trend data yet
          </div>
        )}
      </div>
    </Card>
  );
}

function formatAsphDelta(
  current: number | null | undefined,
  previous: number | null | undefined,
): string | null {
  if (current == null || previous == null) return null;
  const delta = current - previous;
  if (delta === 0) return "Unchanged vs prev MTD";
  const sign = delta > 0 ? "+" : "−";
  return `${sign}${formatMoney(Math.abs(delta))} vs prev MTD`;
}

const LUNCH_ACCENT = "#C45C3E";
const DINNER_ACCENT = "#3D421F";

function formatLunchDinnerDelta(
  lunch: number | null | undefined,
  dinner: number | null | undefined,
): { text: string; higher: "lunch" | "dinner" | "even" | null } | null {
  if (lunch == null || dinner == null) return null;
  const delta = dinner - lunch;
  if (Math.abs(delta) < 0.01) {
    return { text: "Lunch and dinner even", higher: "even" };
  }
  if (delta > 0) {
    return {
      text: `${formatMoney(delta)} higher at dinner`,
      higher: "dinner",
    };
  }
  return {
    text: `${formatMoney(Math.abs(delta))} higher at lunch`,
    higher: "lunch",
  };
}

function LunchDinnerBreakdown({
  lunchAsph,
  dinnerAsph,
}: {
  lunchAsph: number | null;
  dinnerAsph: number | null;
}) {
  const lunch = lunchAsph ?? 0;
  const dinner = dinnerAsph ?? 0;
  if (lunch === 0 && dinner === 0) {
    return (
      <div className="flex min-h-8 min-w-0 items-center rounded-lg bg-black/[0.02] px-2.5 py-2 text-[10px] text-black/40">
        No lunch/dinner split
      </div>
    );
  }

  const scaleMax = Math.max(lunch, dinner, 1);
  const delta = formatLunchDinnerDelta(lunchAsph, dinnerAsph);

  return (
    <div className="min-w-0 rounded-lg bg-black/[0.02] px-2.5 py-2">
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <span
            className="w-9 shrink-0 text-[9px] font-semibold uppercase tracking-wide"
            style={{ color: LUNCH_ACCENT }}
          >
            Lunch
          </span>
          <div className="relative h-1.5 min-w-[2.5rem] flex-1 rounded-full bg-black/5">
            <div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{
                width: `${(lunch / scaleMax) * 100}%`,
                backgroundColor: `${LUNCH_ACCENT}B3`,
              }}
            />
          </div>
          <span className="w-14 shrink-0 text-right text-[10px] font-medium tabular-nums text-[#3D421F]">
            {formatAsphLabel(lunchAsph)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="w-9 shrink-0 text-[9px] font-semibold uppercase tracking-wide"
            style={{ color: DINNER_ACCENT }}
          >
            Dinner
          </span>
          <div className="relative h-1.5 min-w-[2.5rem] flex-1 rounded-full bg-black/5">
            <div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{
                width: `${(dinner / scaleMax) * 100}%`,
                backgroundColor: `${DINNER_ACCENT}B3`,
              }}
            />
          </div>
          <span className="w-14 shrink-0 text-right text-[10px] font-medium tabular-nums text-[#3D421F]">
            {formatAsphLabel(dinnerAsph)}
          </span>
        </div>
      </div>
      {delta ? (
        <p
          className={
            delta.higher === "even"
              ? "mt-1.5 text-[10px] text-black/45"
              : delta.higher === "dinner"
                ? "mt-1.5 text-[10px] font-medium text-[#C45C3E]"
                : "mt-1.5 text-[10px] font-medium text-[#3D421F]"
          }
        >
          {delta.text}
        </p>
      ) : null}
    </div>
  );
}

function AverageSpendInsightsPanel({
  metrics,
  currentMtdRange,
  previousMtdRange,
}: {
  metrics: Array<{
    key: string;
    title: string;
    currentAsph: number | null;
    previousAsph: number | null;
    currentLunchAsph: number | null;
    currentDinnerAsph: number | null;
  }>;
  currentMtdRange: string;
  previousMtdRange: string;
}) {
  const hasData = metrics.some(
    (metric) => (metric.currentAsph ?? 0) > 0 || (metric.previousAsph ?? 0) > 0,
  );
  const maxAsph = Math.max(
    ...metrics.flatMap((metric) => [
      metric.currentAsph ?? 0,
      metric.previousAsph ?? 0,
    ]),
    1,
  );

  return (
    <Card className="flex h-full flex-col p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-serif text-base text-[#3D421F]">
            Average Spend by Revenue Center
          </h3>
          <p className="mt-1 text-xs text-black/50">
            ASPH · MTD ({currentMtdRange}) vs prev MTD ({previousMtdRange})
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-[10px] text-black/55">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-4 rounded-sm bg-[#3D421F]/80" />
            Current MTD
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-4 rounded-sm bg-[#B6BE68]/50" />
            Prev MTD
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-4 rounded-sm bg-[#C45C3E]/80" />
            Lunch
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-4 rounded-sm bg-[#3D421F]/80" />
            Dinner
          </span>
        </div>
      </div>

      {hasData ? (
        <div className="space-y-3">
          {metrics.map((metric) => {
            const current = metric.currentAsph ?? 0;
            const previous = metric.previousAsph ?? 0;
            const trend = compareToPreviousMonth(
              metric.currentAsph,
              metric.previousAsph,
            );
            const deltaLabel = formatAsphDelta(
              metric.currentAsph,
              metric.previousAsph,
            );
            const isVenue = metric.key === "venue";

            return (
              <div
                key={metric.key}
                className={
                  isVenue
                    ? "grid grid-cols-[6.5rem_minmax(6rem,0.75fr)_minmax(5rem,2fr)_auto] items-center gap-3 border-b border-black/5 pb-3"
                    : "grid grid-cols-[6.5rem_minmax(6rem,0.75fr)_minmax(5rem,2fr)_auto] items-center gap-3"
                }
              >
                <p
                  className={
                    isVenue
                      ? "text-xs font-semibold uppercase tracking-wide text-[#3D421F]"
                      : "text-xs font-medium text-black/60"
                  }
                >
                  {metric.title}
                </p>

                <LunchDinnerBreakdown
                  lunchAsph={metric.currentLunchAsph}
                  dinnerAsph={metric.currentDinnerAsph}
                />

                <div className="relative h-8 min-w-0">
                  <div
                    className="absolute inset-y-2 left-0 rounded-md bg-[#B6BE68]/45"
                    style={{ width: `${(previous / maxAsph) * 100}%` }}
                  />
                  <div
                    className="absolute inset-y-0.5 left-0 rounded-md bg-[#3D421F]/85"
                    style={{ width: `${(current / maxAsph) * 100}%` }}
                  />
                </div>

                <div className="flex min-w-[8.5rem] items-center justify-end gap-2">
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums text-[#3D421F]">
                      {formatAsphLabel(metric.currentAsph)}
                    </p>
                    <p className="text-[10px] tabular-nums text-black/45">
                      Prev {formatAsphLabel(metric.previousAsph)}
                    </p>
                    {deltaLabel ? (
                      <p
                        className={
                          trend === "up"
                            ? "text-[10px] font-medium text-emerald-600"
                            : trend === "down"
                              ? "text-[10px] font-medium text-red-600"
                              : "text-[10px] text-black/45"
                        }
                      >
                        {deltaLabel}
                      </p>
                    ) : null}
                  </div>
                  <TrendIndicator direction={trend} />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center text-xs text-black/45">
          No average spend data for this MTD period
        </div>
      )}
    </Card>
  );
}

function compareToPreviousMonth(
  current: number | null | undefined,
  previous: number | null | undefined,
): "up" | "down" | "flat" | null {
  if (current == null || previous == null) return null;
  if (current > previous) return "up";
  if (current < previous) return "down";
  return "flat";
}

type VarianceNote = {
  text: string;
  tone: "ahead" | "behind";
};

function buildVarianceNote(
  gap: number | null | undefined,
  surplus: number | null | undefined,
  formatValue: (value: number) => string,
): VarianceNote | undefined {
  if (gap != null && gap > 0) {
    return {
      text: `${formatValue(gap)} remaining to beat prev MTD`,
      tone: "behind",
    };
  }

  if (surplus != null && surplus > 0) {
    return {
      text: `${formatValue(surplus)} ahead of prev MTD`,
      tone: "ahead",
    };
  }

  return undefined;
}

function TrendIndicator({
  direction,
}: {
  direction: "up" | "down" | "flat" | null;
}) {
  if (!direction) return null;

  if (direction === "up") {
    return (
      <span
        className="inline-flex shrink-0 items-center text-emerald-600"
        aria-label="Up vs previous month MTD"
      >
        <ArrowUp className="h-5 w-5" strokeWidth={2.5} />
      </span>
    );
  }

  if (direction === "down") {
    return (
      <span
        className="inline-flex shrink-0 items-center text-red-600"
        aria-label="Down vs previous month MTD"
      >
        <ArrowDown className="h-5 w-5" strokeWidth={2.5} />
      </span>
    );
  }

  return (
    <span
      className="inline-flex shrink-0 items-center text-black/35"
      aria-label="Unchanged vs previous month MTD"
    >
      <Minus className="h-5 w-5" strokeWidth={2.5} />
    </span>
  );
}

function HeadlineStat({
  label,
  value,
  sublabel,
  compareCurrent,
  comparePrevious,
  varianceNote,
}: {
  label: string;
  value: string;
  sublabel?: string;
  compareCurrent?: number | null;
  comparePrevious?: number | null;
  varianceNote?: VarianceNote;
}) {
  const trend = compareToPreviousMonth(compareCurrent, comparePrevious);

  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-black/45">
        {label}
      </p>
      <div className="mt-1 flex items-center gap-1.5">
        <p className="text-2xl font-semibold tabular-nums text-[#3D421F]">
          {value}
        </p>
        <TrendIndicator direction={trend} />
      </div>
      {sublabel ? (
        <p className="mt-0.5 text-xs text-black/50">{sublabel}</p>
      ) : null}
      {varianceNote ? (
        <p
          className={
            varianceNote.tone === "ahead"
              ? "mt-1 text-xs font-medium text-emerald-600"
              : "mt-1 text-xs font-medium text-red-600"
          }
        >
          {varianceNote.text}
        </p>
      ) : null}
    </Card>
  );
}

export function SalesOverviewCharts({
  records,
  totalTaxPct,
}: SalesOverviewChartsProps) {
  const allRows = useMemo(
    () => enrichOverviewRows(records, totalTaxPct),
    [records, totalTaxPct],
  );

  const currentMonthKey = defaultOverviewMonthKey();
  const previousMonthKey = getPreviousMonthKey(currentMonthKey);
  const currentMonthLabel = formatMonthLabel(currentMonthKey);
  const previousMonthLabel = formatMonthLabel(previousMonthKey);

  const monthWeekComparison = useMemo(
    () => buildMonthWeekComparison(allRows, currentMonthKey, previousMonthKey),
    [allRows, currentMonthKey, previousMonthKey],
  );

  const yearToDateMonthlyTrend = useMemo(() => {
    const { year, points } = buildYearToDateMonthlyTrend(allRows);
    const monthsWithSales = points.filter((point) => point.value > 0);
    const average =
      monthsWithSales.length > 0
        ? monthsWithSales.reduce((sum, point) => sum + point.value, 0) /
          monthsWithSales.length
        : 0;

    return {
      year,
      points: points.map((point) => ({
        label: point.label,
        value: point.value,
        trendAvg: average,
      })),
    };
  }, [allRows]);

  const weeklyTrend = useMemo(() => {
    const points = buildWeeklySalesTrend(allRows, 12);
    const average =
      points.length > 0
        ? points.reduce((sum, point) => sum + point.value, 0) / points.length
        : 0;

    return points.map((point) => {
      const parsed = parseWeekFilterKey(point.weekKey);
      const shortLabel = parsed ? `W${parsed.week}` : point.label;
      return {
        label: shortLabel,
        value: point.value,
        trendAvg: average,
      };
    });
  }, [allRows]);

  const averageSpendMetrics = useMemo(
    () => buildAverageSpendInsights(allRows, currentMonthKey, previousMonthKey),
    [allRows, currentMonthKey, previousMonthKey],
  );

  const headlineStats = useMemo(
    () => buildOverviewHeadlineStats(allRows, currentMonthKey, previousMonthKey),
    [allRows, currentMonthKey, previousMonthKey],
  );

  const currentMtdRange = formatMtdDayRange(headlineStats.mtdDay, currentMonthKey);
  const previousMtdRange = formatMtdDayRange(
    headlineStats.previousMtdDay,
    previousMonthKey,
  );

  return (
    <div className="space-y-4">
      {headlineStats.lastInputDate ? (
        <p className="text-xs text-black/50">
          MTD through last daily sales entry ·{" "}
          {formatDisplayDate(headlineStats.lastInputDate)}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <HeadlineStat
          label={`${currentMonthLabel} gross sales · MTD`}
          value={formatMoney(headlineStats.currentGross)}
          sublabel={`Prev MTD (${previousMtdRange}) ${formatMoney(headlineStats.previousGross)}`}
          compareCurrent={headlineStats.currentGross}
          comparePrevious={headlineStats.previousGross}
          varianceNote={buildVarianceNote(
            headlineStats.grossGapToBeat,
            headlineStats.grossSurplus,
            formatMoney,
          )}
        />
        <HeadlineStat
          label={`Venue ASPH · MTD (${currentMtdRange})`}
          value={formatAsphLabel(headlineStats.currentVenueAsph)}
          sublabel={`Prev MTD (${previousMtdRange}) ${formatAsphLabel(headlineStats.previousVenueAsph)}`}
          compareCurrent={headlineStats.currentVenueAsph}
          comparePrevious={headlineStats.previousVenueAsph}
          varianceNote={buildVarianceNote(
            headlineStats.venueAsphGapToBeat,
            headlineStats.venueAsphSurplus,
            formatMoney,
          )}
        />
        <HeadlineStat
          label={`Covers · MTD (${currentMtdRange})`}
          value={headlineStats.currentCovers.toLocaleString()}
          sublabel={`Prev MTD (${previousMtdRange}) ${headlineStats.previousCovers.toLocaleString()}`}
          compareCurrent={headlineStats.currentCovers}
          comparePrevious={headlineStats.previousCovers}
          varianceNote={buildVarianceNote(
            headlineStats.coversGapToBeat,
            headlineStats.coversSurplus,
            (value) => Math.round(value).toLocaleString(),
          )}
        />
        <HeadlineStat
          label={`APS · MTD (${currentMtdRange})`}
          value={
            headlineStats.currentAps == null
              ? "—"
              : headlineStats.currentAps.toFixed(2)
          }
          sublabel={
            headlineStats.previousAps == null
              ? undefined
              : `Prev MTD (${previousMtdRange}) ${headlineStats.previousAps.toFixed(2)}`
          }
          compareCurrent={headlineStats.currentAps}
          comparePrevious={headlineStats.previousAps}
          varianceNote={buildVarianceNote(
            headlineStats.apsGapToBeat,
            headlineStats.apsSurplus,
            (value) => value.toFixed(2),
          )}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <YearToDateMonthlyTrendChart
          year={yearToDateMonthlyTrend.year}
          points={yearToDateMonthlyTrend.points}
        />
        <MonthWeekComparisonChart
          points={monthWeekComparison}
          currentMonthLabel={currentMonthLabel}
          previousMonthLabel={previousMonthLabel}
        />
        <WeeklySalesTrendChart points={weeklyTrend} />
      </div>

      <AverageSpendInsightsPanel
        metrics={averageSpendMetrics}
        currentMtdRange={currentMtdRange}
        previousMtdRange={previousMtdRange}
      />
    </div>
  );
}
