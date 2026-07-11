"use client";

import { useMemo } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/sales/daily-sales-calculations";
import {
  buildWeeklySalesTrend,
  buildYearToDateMonthlyTrend,
  enrichOverviewRows,
} from "@/lib/sales/sales-overview-aggregations";
import { parseWeekFilterKey } from "@/lib/sales/sales-data-table-dates";
import type { VenueDailySalesRecord } from "@/lib/sales/daily-sales-types";
import {
  TREND_BAR,
  TREND_LINE,
  formatBarLabel,
  formatChartAxisMoney,
  OverviewTooltipCard,
} from "@/components/sales/sales-chart-primitives";

type OverviewRows = ReturnType<typeof enrichOverviewRows>;

export type TrendPoint = { label: string; value: number; trendAvg: number };
export type MonthlyTrendData = { year: number; points: TrendPoint[] };

export function buildMonthlyTrendData(allRows: OverviewRows): MonthlyTrendData {
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
}

export function buildWeeklyTrendData(allRows: OverviewRows): TrendPoint[] {
  const points = buildWeeklySalesTrend(allRows, 10);
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
}

export function YearToDateMonthlyTrendChart({
  year,
  points,
}: {
  year: number;
  points: TrendPoint[];
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
                  const point = payload[0].payload as TrendPoint;
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

export function WeeklySalesTrendChart({ points }: { points: TrendPoint[] }) {
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
                tick={{ fontSize: 11, fill: "rgba(0,0,0,0.55)" }}
                axisLine={{ stroke: "rgba(0,0,0,0.08)" }}
                tickLine={false}
                interval={0}
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
                  const point = payload[0].payload as TrendPoint;
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

export function SalesTrendCharts({
  records,
  totalTaxPct,
}: {
  records: VenueDailySalesRecord[];
  totalTaxPct: number;
}) {
  const allRows = useMemo(
    () => enrichOverviewRows(records, totalTaxPct),
    [records, totalTaxPct],
  );
  const monthly = useMemo(() => buildMonthlyTrendData(allRows), [allRows]);
  const weekly = useMemo(() => buildWeeklyTrendData(allRows), [allRows]);

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <YearToDateMonthlyTrendChart year={monthly.year} points={monthly.points} />
      <WeeklySalesTrendChart points={weekly} />
    </div>
  );
}
