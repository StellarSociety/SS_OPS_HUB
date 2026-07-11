"use client";

import { useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { PieLabelRenderProps } from "recharts";
import { Card } from "@/components/ui/card";
import { formatMoney } from "@/lib/sales/daily-sales-calculations";
import { buildMonthlyTendersMtd } from "@/lib/sales/monthly-tenders";
import { OverviewTooltipCard } from "@/components/sales/sales-chart-primitives";
import type { VenueWaiterDailySalesEntry } from "@/lib/sales/waiter-sales-types";
import type { VenueTender } from "@/lib/sales/tenders-types";

const RADIAN = Math.PI / 180;

function renderPercentLabel(props: PieLabelRenderProps) {
  const cx = Number(props.cx ?? 0);
  const cy = Number(props.cy ?? 0);
  const midAngle = Number(props.midAngle ?? 0);
  const outerRadius = Number(props.outerRadius ?? 0);
  const percent = Number(props.percent ?? 0);
  if (percent < 0.03) return null;
  const radius = outerRadius + 18;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text
      x={x}
      y={y}
      fill="#3D421F"
      fontSize={11}
      fontWeight={600}
      textAnchor={x > cx ? "start" : "end"}
      dominantBaseline="central"
    >
      {(percent * 100).toFixed(1)}%
    </text>
  );
}

const TENDER_COLORS = [
  "#3D421F",
  "#6B7340",
  "#B6BE68",
  "#C45C3E",
  "#8A9A5B",
  "#D9A441",
  "#4E6151",
  "#A15C38",
  "#9CA777",
  "#7A5C3E",
];

type MonthlyTendersChartProps = {
  waiterRecords: VenueWaiterDailySalesEntry[];
  tenders: VenueTender[];
  currentMonthKey: string;
  mtdDay: number;
  mtdRange: string;
};

export function MonthlyTendersChart({
  waiterRecords,
  tenders,
  currentMonthKey,
  mtdDay,
  mtdRange,
}: MonthlyTendersChartProps) {
  const { slices, total } = useMemo(
    () => buildMonthlyTendersMtd(waiterRecords, tenders, currentMonthKey, mtdDay),
    [waiterRecords, tenders, currentMonthKey, mtdDay],
  );

  const data = slices.map((slice, index) => ({
    ...slice,
    color: TENDER_COLORS[index % TENDER_COLORS.length],
  }));

  return (
    <Card className="flex h-full flex-col p-4">
      <div className="mb-3">
        <h3 className="font-serif text-base text-[#3D421F]">Monthly Tenders</h3>
        <p className="mt-1 text-xs text-black/50">MTD ({mtdRange})</p>
      </div>

      {total > 0 ? (
        <div className="flex flex-1 flex-col">
          <div className="relative mx-auto h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                <Pie
                  data={data}
                  dataKey="totalGs"
                  nameKey="name"
                  innerRadius={64}
                  outerRadius={94}
                  paddingAngle={2}
                  stroke="none"
                  labelLine={{ stroke: "rgba(0,0,0,0.2)" }}
                  label={renderPercentLabel}
                >
                  {data.map((slice) => (
                    <Cell key={slice.tenderId} fill={slice.color} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const slice = payload[0].payload as (typeof data)[number];
                    return (
                      <OverviewTooltipCard
                        title={slice.name}
                        rows={[
                          { label: "MTD total", value: formatMoney(slice.totalGs) },
                          { label: "Share", value: `${slice.pct.toFixed(1)}%` },
                        ]}
                      />
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[10px] font-medium uppercase tracking-wide text-black/45">
                Total
              </span>
              <span className="text-sm font-semibold tabular-nums text-[#3D421F]">
                {formatMoney(total)}
              </span>
            </div>
          </div>

          <ul className="mt-auto space-y-1 pt-3">
            {data.map((slice) => (
              <li
                key={slice.tenderId}
                className="flex items-center gap-2 text-[11px]"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ backgroundColor: slice.color }}
                />
                <span className="min-w-0 flex-1 truncate text-black/70">
                  {slice.name}
                </span>
                <span className="shrink-0 tabular-nums font-medium text-[#3D421F]">
                  {formatMoney(slice.totalGs)}
                </span>
                <span className="w-12 shrink-0 text-right tabular-nums text-black/45">
                  {slice.pct.toFixed(1)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center text-xs text-black/45">
          No tender data for this MTD period
        </div>
      )}
    </Card>
  );
}
