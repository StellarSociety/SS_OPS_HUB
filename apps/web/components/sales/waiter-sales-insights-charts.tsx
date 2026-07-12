"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import {
  formatIsoWeekLabel,
  formatMoney,
  formatMonthLabel,
  getCurrentMonthKey,
  getIsoWeekParts,
} from "@/lib/sales/daily-sales-calculations";
import {
  salesTableFilterButtonClass,
  salesTableFilterClearButtonClass,
} from "@/lib/sales/sales-data-table-ui";
import { groupedBarChartLayout } from "@/lib/sales/sales-chart-bar-layout";
import {
  buildSalesTableMonthOptions,
  buildSalesTableWeekOptions,
  formatLocalDateFromDate,
  getCurrentWeekFilterKey,
  getCurrentYearKey,
} from "@/lib/sales/sales-data-table-dates";
import type { VenueWaiterDailySalesEntry } from "@/lib/sales/waiter-sales-types";
import type { VenueWaiter } from "@/lib/sales/waiters-types";
import {
  buildWaiterAsphComparison,
  buildWaiterGratuityComparison,
  buildWaiterRevenueComparison,
  filterWaiterEntriesForPeriod,
  formatWaiterInsightsPeriodLabel,
  resolvePreviousPeriodFilterKey,
  type WaiterComparisonPoint,
  type WaiterInsightsPeriodMode,
} from "@/lib/sales/waiter-sales-insights-aggregations";
import { cn } from "@/lib/utils";

type WaiterSalesInsightsChartsProps = {
  entries: VenueWaiterDailySalesEntry[];
  waiters: VenueWaiter[];
};


function WaiterBarGradients({ chartId }: { chartId: string }) {
  return (
    <defs>
      <linearGradient id={`${chartId}-current`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#7A8240" stopOpacity={0.95} />
        <stop offset="45%" stopColor="#3D421F" stopOpacity={1} />
        <stop offset="100%" stopColor="#2A2E15" stopOpacity={1} />
      </linearGradient>
      <linearGradient id={`${chartId}-previous`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#E2E8A8" stopOpacity={0.95} />
        <stop offset="45%" stopColor="#B6BE68" stopOpacity={1} />
        <stop offset="100%" stopColor="#98A050" stopOpacity={1} />
      </linearGradient>
    </defs>
  );
}

function gradientLegendSwatch(kind: "current" | "previous") {
  return kind === "current"
    ? "linear-gradient(180deg, #7A8240 0%, #3D421F 55%, #2A2E15 100%)"
    : "linear-gradient(180deg, #E2E8A8 0%, #B6BE68 55%, #98A050 100%)";
}

function buildYearOptions(saleDates: string[]): Array<{ value: string; label: string }> {
  const years = new Set(saleDates.map((date) => date.slice(0, 4)));
  years.add(getCurrentYearKey());

  return Array.from(years)
    .sort((a, b) => b.localeCompare(a))
    .map((value) => ({ value, label: value }));
}

function periodSelectWidthClass(_periodMode: WaiterInsightsPeriodMode): string {
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

function formatChartAxisMoney(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(0)}k`;
  return String(Math.round(value));
}

function formatBarLabel(value: number, kind: "money" | "asph"): string {
  if (!value) return "";
  if (kind === "asph") return formatMoney(value).replace(/\.00$/, "");
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return Math.round(value).toLocaleString();
}

function formatContributionPct(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${value.toFixed(1)}%`;
}

function InsightsTooltipCard({
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

function WaiterComparisonChart({
  chartId,
  title,
  subtitle,
  points,
  currentPeriodLabel,
  previousPeriodLabel,
  valueKind,
  showContribution,
}: {
  chartId: string;
  title: string;
  subtitle: string;
  points: WaiterComparisonPoint[];
  currentPeriodLabel: string;
  previousPeriodLabel: string;
  valueKind: "money" | "asph";
  showContribution: boolean;
}) {
  const formatValue = (value: number) => formatMoney(value);
  const hasAnyData = points.some((point) => point.current > 0 || point.previous > 0);

  return (
    <Card className="flex h-full flex-col p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-serif text-base text-[#3D421F]">{title}</h3>
          <p className="mt-1 text-xs text-black/50">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[10px] text-black/55">
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-2 w-4 rounded-sm"
              style={{ background: gradientLegendSwatch("current") }}
            />
            {currentPeriodLabel}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-2 w-4 rounded-sm"
              style={{ background: gradientLegendSwatch("previous") }}
            />
            {previousPeriodLabel}
          </span>
        </div>
      </div>
      <div>
        <div className="h-72 w-full">
          {points.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={points}
                margin={{ top: 20, right: 8, left: 0, bottom: 48 }}
                {...groupedBarChartLayout}
              >
                <WaiterBarGradients chartId={chartId} />
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fontWeight: 700, fill: "rgba(0,0,0,0.55)" }}
                  axisLine={{ stroke: "rgba(0,0,0,0.08)" }}
                  tickLine={false}
                  interval={0}
                  angle={0}
                  textAnchor="middle"
                  height={36}
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
                    const point = payload[0].payload as WaiterComparisonPoint;
                    const rows = [
                      {
                        label: currentPeriodLabel,
                        value: formatValue(point.current),
                      },
                      {
                        label: previousPeriodLabel,
                        value: formatValue(point.previous),
                      },
                    ];

                    if (showContribution) {
                      rows.push(
                        {
                          label: `${currentPeriodLabel} share`,
                          value: formatContributionPct(point.currentContributionPct),
                        },
                        {
                          label: `${previousPeriodLabel} share`,
                          value: formatContributionPct(point.previousContributionPct),
                        },
                      );
                    }

                    return <InsightsTooltipCard title={point.label} rows={rows} />;
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <Bar
                  dataKey="current"
                  name={currentPeriodLabel}
                  fill={`url(#${chartId}-current)`}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={points.length > 6 ? 24 : 32}
                  stroke="#2A2E15"
                  strokeWidth={0.5}
                >
                  <LabelList
                    dataKey="current"
                    position="top"
                    formatter={(value) => formatBarLabel(Number(value), valueKind)}
                    className="fill-[#3D421F] text-[9px] font-medium"
                  />
                </Bar>
                <Bar
                  dataKey="previous"
                  name={previousPeriodLabel}
                  fill={`url(#${chartId}-previous)`}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={points.length > 6 ? 24 : 32}
                  stroke="#98A050"
                  strokeWidth={0.5}
                >
                  <LabelList
                    dataKey="previous"
                    position="top"
                    formatter={(value) => formatBarLabel(Number(value), valueKind)}
                    className="fill-[#3D421F] text-[9px] font-medium"
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-black/45">
              No active waiters configured for this venue yet
            </div>
          )}
        </div>
        {points.length > 0 && !hasAnyData ? (
          <p className="mt-2 text-center text-xs text-black/45">
            No sales recorded for {currentPeriodLabel} or {previousPeriodLabel} yet —
            comparison columns will populate as data is entered.
          </p>
        ) : null}
      </div>
    </Card>
  );
}

export function WaiterSalesInsightsCharts({
  entries,
  waiters,
}: WaiterSalesInsightsChartsProps) {
  const [periodMode, setPeriodMode] = useState<WaiterInsightsPeriodMode>("week");
  const [weekFilter, setWeekFilter] = useState(() => getCurrentWeekFilterKey());
  const [monthFilter, setMonthFilter] = useState(() => getCurrentMonthKey());
  const [yearFilter, setYearFilter] = useState(() => getCurrentYearKey());
  const [toDateOnly, setToDateOnly] = useState(false);

  const saleDates = useMemo(
    () => entries.map((entry) => entry.sale_date),
    [entries],
  );

  const weekOptions = useMemo(
    () =>
      buildSalesTableWeekOptions(saleDates, formatIsoWeekLabel, getIsoWeekParts),
    [saleDates],
  );

  const monthOptions = useMemo(
    () =>
      buildSalesTableMonthOptions(saleDates, formatMonthLabel, getCurrentMonthKey),
    [saleDates],
  );

  const yearOptions = useMemo(() => buildYearOptions(saleDates), [saleDates]);

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

  const currentPeriodLabel = formatWaiterInsightsPeriodLabel(
    periodMode,
    activeFilterKey,
  );
  const previousFilterKey = resolvePreviousPeriodFilterKey(
    periodMode,
    activeFilterKey,
  );
  const previousPeriodLabel = formatWaiterInsightsPeriodLabel(
    periodMode,
    previousFilterKey,
  );

  const { revenuePoints, asphPoints, gratuityPoints } = useMemo(() => {
    const cutoff = toDateOnly ? formatLocalDateFromDate(new Date()) : null;
    const currentEntries = filterWaiterEntriesForPeriod(
      entries,
      periodMode,
      activeFilterKey,
    ).filter((entry) => (cutoff ? entry.sale_date <= cutoff : true));
    const previousEntries = filterWaiterEntriesForPeriod(
      entries,
      periodMode,
      previousFilterKey,
    );

    return {
      revenuePoints: buildWaiterRevenueComparison(
        waiters,
        currentEntries,
        previousEntries,
      ),
      asphPoints: buildWaiterAsphComparison(
        waiters,
        currentEntries,
        previousEntries,
      ),
      gratuityPoints: buildWaiterGratuityComparison(
        waiters,
        currentEntries,
        previousEntries,
      ),
    };
  }, [
    entries,
    waiters,
    periodMode,
    activeFilterKey,
    previousFilterKey,
    toDateOnly,
  ]);

  function selectPeriodMode(mode: WaiterInsightsPeriodMode) {
    setPeriodMode(mode);
    if (mode === "week" && !weekFilter) {
      setWeekFilter(getCurrentWeekFilterKey());
    }
    if (mode === "month" && !monthFilter) {
      setMonthFilter(getCurrentMonthKey());
    }
    if (mode === "year" && !yearFilter) {
      setYearFilter(getCurrentYearKey());
    }
  }

  function applyCurrentPeriod() {
    if (periodMode === "week") {
      setWeekFilter(getCurrentWeekFilterKey());
    } else if (periodMode === "month") {
      setMonthFilter(getCurrentMonthKey());
    } else {
      setYearFilter(getCurrentYearKey());
    }
  }

  const currentPeriodTypeLabel =
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

  function setActivePeriodValue(value: string) {
    if (periodMode === "week") {
      setWeekFilter(value);
    } else if (periodMode === "month") {
      setMonthFilter(value);
    } else {
      setYearFilter(value);
    }
  }

  function stepActivePeriod(step: number) {
    if (activePeriodIndex === -1) return;
    const nextIndex = activePeriodIndex + step;
    const nextOption = periodOptions[nextIndex];
    if (!nextOption) return;
    setActivePeriodValue(nextOption.value);
  }

  const comparisonSubtitle = `${currentPeriodLabel} vs ${previousPeriodLabel}`;

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
                aria-label={`Previous ${currentPeriodTypeLabel}`}
                title={`Previous ${currentPeriodTypeLabel}`}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <select
                id="waiter-sales-insights-period"
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
                aria-label={`Next ${currentPeriodTypeLabel}`}
                title={`Next ${currentPeriodTypeLabel}`}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <button type="button" className={salesTableFilterButtonClass()} onClick={applyCurrentPeriod}>
            This {currentPeriodTypeLabel}
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

      <div className="grid gap-4 xl:grid-cols-3">
        <WaiterComparisonChart
          chartId="waiter-revenue"
          title="Waiter Revenue Contribution"
          subtitle={`Total sales by waiter · ${comparisonSubtitle}`}
          points={revenuePoints}
          currentPeriodLabel={currentPeriodLabel}
          previousPeriodLabel={previousPeriodLabel}
          valueKind="money"
          showContribution
        />

        <WaiterComparisonChart
          chartId="waiter-asph"
          title="Waiter ASPH"
          subtitle={`Average spend per head by waiter · ${comparisonSubtitle}`}
          points={asphPoints}
          currentPeriodLabel={currentPeriodLabel}
          previousPeriodLabel={previousPeriodLabel}
          valueKind="asph"
          showContribution={false}
        />

        <WaiterComparisonChart
          chartId="waiter-gratuity"
          title="Waiter Gratuity Collection"
          subtitle={`Credit card + cash gratuity by waiter · ${comparisonSubtitle}`}
          points={gratuityPoints}
          currentPeriodLabel={currentPeriodLabel}
          previousPeriodLabel={previousPeriodLabel}
          valueKind="money"
          showContribution={false}
        />
      </div>
    </div>
  );
}
