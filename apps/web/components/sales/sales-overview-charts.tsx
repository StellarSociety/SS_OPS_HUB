"use client";

import { useMemo } from "react";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import {
  formatMoney,
  formatMonthLabel,
} from "@/lib/sales/daily-sales-calculations";
import type { VenueDailySalesRecord } from "@/lib/sales/daily-sales-types";
import type { VenueWaiterDailySalesEntry } from "@/lib/sales/waiter-sales-types";
import type { VenueTender } from "@/lib/sales/tenders-types";
import { MonthlyTendersChart } from "@/components/sales/monthly-tenders-chart";
import {
  buildAverageSpendInsights,
  buildMonthWeekComparison,
  buildOverviewHeadlineStats,
  defaultOverviewMonthKey,
  enrichOverviewRows,
  formatMtdDayRange,
  getPreviousMonthKey,
  type MonthWeekComparisonPoint,
} from "@/lib/sales/sales-overview-aggregations";
import { groupedBarChartLayout } from "@/lib/sales/sales-chart-bar-layout";
import {
  CURRENT_BAR,
  PREVIOUS_BAR,
  formatBarLabel,
  formatChartAxisMoney,
  OverviewTooltipCard,
} from "@/components/sales/sales-chart-primitives";
import {
  buildMonthlyTrendData,
  buildWeeklyTrendData,
  WeeklySalesTrendChart,
  YearToDateMonthlyTrendChart,
} from "@/components/sales/sales-trend-charts";

type SalesOverviewChartsProps = {
  records: VenueDailySalesRecord[];
  totalTaxPct: number;
  waiterRecords: VenueWaiterDailySalesEntry[];
  tenders: VenueTender[];
};

function formatAsphLabel(value: number | null | undefined): string {
  if (value == null) return "—";
  return formatMoney(value);
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
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-serif text-base text-[#3D421F]">
            Monthly Sales by Week
          </h3>
          <p className="mt-1 text-xs text-black/50">
            {currentMonthLabel} vs {previousMonthLabel}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-1 text-[10px] text-black/55">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-4 rounded-sm bg-[#3D421F]/80" />
            {currentMonthLabel}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-4 rounded-sm bg-[#B6BE68]/45" />
            {previousMonthLabel}
          </span>
        </div>
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
    <div className="min-w-0 rounded-lg bg-black/[0.02] px-2.5 py-1.5">
      <div className="space-y-0.5">
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
              ? "mt-0.5 text-[10px] text-black/45"
              : delta.higher === "dinner"
                ? "mt-0.5 text-[10px] font-medium text-[#C45C3E]"
                : "mt-0.5 text-[10px] font-medium text-[#3D421F]"
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
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="font-serif text-base text-[#3D421F]">
            Average Spend by Revenue Center
          </h3>
          <p className="mt-1 text-xs text-black/50">
            ASPH · MTD ({currentMtdRange}) vs prev MTD ({previousMtdRange})
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] text-black/55">
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
                    ? "grid grid-cols-[6.5rem_minmax(6rem,0.75fr)_minmax(5rem,1.5fr)_auto] items-center gap-3 border-b border-black/5 pb-3"
                    : "grid grid-cols-[6.5rem_minmax(6rem,0.75fr)_minmax(5rem,1.5fr)_auto] items-center gap-3"
                }
              >
                <p
                  className={
                    isVenue
                      ? "text-sm font-semibold uppercase tracking-wide text-[#3D421F]"
                      : "text-sm font-medium text-black/60"
                  }
                >
                  {metric.title}
                </p>

                <LunchDinnerBreakdown
                  lunchAsph={metric.currentLunchAsph}
                  dinnerAsph={metric.currentDinnerAsph}
                />

                <div className="relative h-8 min-w-0 overflow-hidden rounded-md bg-black/[0.03]">
                  <div
                    className="absolute left-0 top-1 h-3 rounded-md bg-[#3D421F]/85"
                    style={{ width: `${Math.min((current / maxAsph) * 100, 100)}%` }}
                  />
                  <div
                    className="absolute bottom-1 left-0 h-3 rounded-md bg-[#B6BE68]/45"
                    style={{ width: `${Math.min((previous / maxAsph) * 100, 100)}%` }}
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
    <Card className="flex h-full flex-col justify-center p-4 text-center">
      <p className="text-xs font-medium uppercase tracking-wide text-black/45">
        {label}
      </p>
      <div className="mt-1 flex items-center justify-center gap-1.5">
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
  waiterRecords,
  tenders,
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

  const yearToDateMonthlyTrend = useMemo(
    () => buildMonthlyTrendData(allRows),
    [allRows],
  );

  const weeklyTrend = useMemo(() => buildWeeklyTrendData(allRows), [allRows]);

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

  const accumulated = useMemo(() => {
    const mtdDay = headlineStats.mtdDay;
    const inMtd = (saleDate: string) => {
      if (!saleDate.startsWith(currentMonthKey)) return false;
      const day = Number(saleDate.slice(8, 10));
      return day >= 1 && day <= mtdDay;
    };

    let gratuityCc = 0;
    let gratuityCash = 0;
    for (const record of waiterRecords) {
      if (!inMtd(record.sale_date)) continue;
      gratuityCc += Number(record.gratuity_cc_gs);
      gratuityCash += Number(record.gratuity_cash_gs);
    }

    let serviceCharge = 0;
    for (const row of allRows) {
      if (!inMtd(row.sale_date)) continue;
      serviceCharge += row.totalServiceFeesGs;
    }

    return { gratuityCc, gratuityCash, serviceCharge };
  }, [waiterRecords, allRows, currentMonthKey, headlineStats.mtdDay]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
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
        <Card className="flex h-full flex-col justify-center p-4 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-black/45">
            Gratuity Accumulated · MTD
          </p>
          <div className="mt-1 flex items-stretch justify-center divide-x divide-black/10">
            <div className="px-3">
              <p className="text-[10px] font-medium uppercase tracking-wide text-black/40">
                CC
              </p>
              <p className="text-lg font-semibold tabular-nums text-[#3D421F]">
                {formatMoney(accumulated.gratuityCc)}
              </p>
            </div>
            <div className="px-3">
              <p className="text-[10px] font-medium uppercase tracking-wide text-black/40">
                Cash
              </p>
              <p className="text-lg font-semibold tabular-nums text-[#3D421F]">
                {formatMoney(accumulated.gratuityCash)}
              </p>
            </div>
          </div>
          <hr className="my-2 border-black/10" />
          <p className="text-xs font-medium uppercase tracking-wide text-black/45">
            Service Charge Accumulated · 10%
          </p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums text-[#3D421F]">
            {formatMoney(accumulated.serviceCharge)}
          </p>
        </Card>
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

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-1">
          <MonthlyTendersChart
            waiterRecords={waiterRecords}
            tenders={tenders}
            currentMonthKey={currentMonthKey}
            mtdDay={headlineStats.mtdDay}
            mtdRange={currentMtdRange}
          />
        </div>
        <div className="xl:col-span-2">
          <AverageSpendInsightsPanel
            metrics={averageSpendMetrics}
            currentMtdRange={currentMtdRange}
            previousMtdRange={previousMtdRange}
          />
        </div>
      </div>
    </div>
  );
}
