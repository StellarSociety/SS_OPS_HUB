"use client";

import { useMemo, useState, useTransition } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { saveVenueMonthlyForecast } from "@/lib/actions/sales";
import { formatMoney } from "@/lib/sales/daily-sales-calculations";
import type { VenueMonthlyForecast } from "@/lib/sales/daily-snap-types";
import {
  buildForecastYearView,
  FORECAST_REVENUE_CENTERS,
  listForecastYearOptions,
  type ForecastMonthRow,
  type ForecastYearSummary,
} from "@/lib/sales/forecast-aggregations";
import { total445WeeksInYear } from "@/lib/sales/forecast-445-calendar";
import { Card } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type SalesForecastPanelProps = {
  forecasts: VenueMonthlyForecast[];
  dailyRows: Array<{
    sale_date: string;
    totalVenueGs: number;
    totalCovers: number;
    totalFoodGs: number;
    totalBeveragesGs: number;
    totalWineGs: number;
    totalShishaGs: number;
    totalTobaccoGs: number;
    totalOthersGs: number;
    totalServiceFeesGs: number;
    totalVenueAllDayAsph: number | null;
  }>;
  canEdit: boolean;
  initialYear: number;
};

const inputClass =
  "w-full rounded border border-black/10 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-[#3D421F]/40";

function formatMonthDateRange(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  const fmt = (date: Date) =>
    date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return `${fmt(start)} – ${fmt(end)}`;
}

function formatVariancePct(value: number | null): string {
  if (value == null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function varianceClass(value: number | null, invert = false): string {
  if (value == null || value === 0) return "text-black/45";
  const positive = invert ? value < 0 : value > 0;
  return positive ? "text-emerald-600" : "text-red-600";
}

function SummaryCard({
  label,
  forecast,
  actual,
  variancePct,
  formatValue = formatMoney,
}: {
  label: string;
  forecast: number | null;
  actual: number | null;
  variancePct: number | null;
  formatValue?: (value: number | null) => string;
}) {
  return (
    <Card className="flex h-full flex-col items-center justify-center p-4 text-center">
      <p className="whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-black/45">
        {label}
      </p>
      <p className="mt-2 text-xl font-semibold tabular-nums text-[#3D421F]">
        {formatValue(actual)}
      </p>
      <p className="mt-1 text-xs text-black/50">
        Target {formatValue(forecast)}
      </p>
      <p className={cn("mt-1 text-xs font-medium tabular-nums", varianceClass(variancePct))}>
        {formatVariancePct(variancePct)} vs target
      </p>
    </Card>
  );
}

function MonthTargetsEditor({
  month,
  canEdit,
  isPending,
  onSave,
}: {
  month: ForecastMonthRow;
  canEdit: boolean;
  isPending: boolean;
  onSave: (monthKey: string, form: Record<string, string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(() => ({
    forecast_revenue_gs: String(month.forecastGs || ""),
    forecast_covers: String(month.forecastCovers || ""),
    forecast_venue_asph: String(month.forecastVenueAsph ?? ""),
    forecast_food_asph: String(
      month.revenueCenters.find((rc) => rc.key === "food")?.forecastAsph ?? "",
    ),
    forecast_beverages_asph: String(
      month.revenueCenters.find((rc) => rc.key === "beverages")?.forecastAsph ?? "",
    ),
    forecast_wine_asph: String(
      month.revenueCenters.find((rc) => rc.key === "wine")?.forecastAsph ?? "",
    ),
    forecast_shisha_asph: String(
      month.revenueCenters.find((rc) => rc.key === "shisha")?.forecastAsph ?? "",
    ),
    forecast_other_asph: String(
      month.revenueCenters.find((rc) => rc.key === "other")?.forecastAsph ?? "",
    ),
  }));

  if (!canEdit) return null;

  return (
    <div className="rounded-lg border border-black/5 bg-black/[0.02] p-3">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between text-left text-sm font-medium text-[#3D421F]"
      >
        Edit monthly targets
        <ChevronDown
          className={cn("h-4 w-4 transition-transform", open && "rotate-180")}
        />
      </button>
      {open ? (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            <label className="space-y-1 text-xs text-black/55">
              Gross forecast
              <input
                type="number"
                min="0"
                step="0.01"
                className={inputClass}
                value={values.forecast_revenue_gs}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    forecast_revenue_gs: event.target.value,
                  }))
                }
              />
            </label>
            <label className="space-y-1 text-xs text-black/55">
              Covers target
              <input
                type="number"
                min="0"
                step="1"
                className={inputClass}
                value={values.forecast_covers}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    forecast_covers: event.target.value,
                  }))
                }
              />
            </label>
            <label className="space-y-1 text-xs text-black/55">
              Venue ASPH target
              <input
                type="number"
                min="0"
                step="0.01"
                className={inputClass}
                value={values.forecast_venue_asph}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    forecast_venue_asph: event.target.value,
                  }))
                }
              />
            </label>
            {FORECAST_REVENUE_CENTERS.map((center) => (
                <label key={center.key} className="space-y-1 text-xs text-black/55">
                  {center.label} ASPH
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className={inputClass}
                    value={values[center.forecastField]}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        [center.forecastField]: event.target.value,
                      }))
                    }
                  />
                </label>
              ))}
          </div>
          <button
            type="button"
            disabled={isPending}
            onClick={() => onSave(month.monthKey, values)}
            className="rounded-md bg-[var(--venue-primary)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            Save {month.monthLabel} targets
          </button>
        </div>
      ) : null}
    </div>
  );
}

function MonthSection({
  month,
  canEdit,
  isPending,
  onSave,
}: {
  month: ForecastMonthRow;
  canEdit: boolean;
  isPending: boolean;
  onSave: (monthKey: string, form: Record<string, string>) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="overflow-hidden p-0">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-black/[0.02]"
      >
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-black/45 transition-transform", expanded && "rotate-180")}
        />
        <div className="min-w-[10rem] flex-1">
          <p className="font-medium text-[#3D421F]">{month.monthLabel}</p>
          <p className="text-xs text-black/50">
            {month.fiscalWeekCount} fiscal weeks · {formatMonthDateRange(month.monthKey)}
          </p>
        </div>
        <div className="grid min-w-[16rem] flex-1 grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
          <div>
            <p className="text-black/45">Forecast GS</p>
            <p className="font-medium tabular-nums">{formatMoney(month.forecastGs)}</p>
          </div>
          <div>
            <p className="text-black/45">Actual GS</p>
            <p className="font-medium tabular-nums">{formatMoney(month.actualGs)}</p>
          </div>
          <div>
            <p className="text-black/45">Covers</p>
            <p className="font-medium tabular-nums">
              {month.actualCovers.toLocaleString()} / {month.forecastCovers.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-black/45">GS variance</p>
            <p className={cn("font-medium tabular-nums", varianceClass(month.revenueVariancePct))}>
              {formatVariancePct(month.revenueVariancePct)}
            </p>
          </div>
        </div>
      </button>

      {expanded ? (
        <div className="space-y-4 border-t border-black/5 px-4 py-4">
          <MonthTargetsEditor
            month={month}
            canEdit={canEdit}
            isPending={isPending}
            onSave={onSave}
          />

          <div>
            <h4 className="text-sm font-semibold text-[#3D421F]">
              Average spend targets vs actual (ASPH)
            </h4>
            <div className="mt-2 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-black/10 text-left text-xs uppercase tracking-wide text-black/45">
                    <th className="px-2 py-2">Revenue center</th>
                    <th className="px-2 py-2">Target ASPH</th>
                    <th className="px-2 py-2">Actual ASPH</th>
                    <th className="px-2 py-2">Variance</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-black/5 bg-black/[0.02]">
                    <td className="px-2 py-2 font-medium">Venue total</td>
                    <td className="px-2 py-2 tabular-nums">
                      {formatMoney(month.forecastVenueAsph)}
                    </td>
                    <td className="px-2 py-2 tabular-nums">
                      {formatMoney(month.actualVenueAsph)}
                    </td>
                    <td
                      className={cn(
                        "px-2 py-2 tabular-nums font-medium",
                        varianceClass(month.venueAsphVariancePct),
                      )}
                    >
                      {formatVariancePct(month.venueAsphVariancePct)}
                    </td>
                  </tr>
                  {month.revenueCenters.map((center) => (
                    <tr key={center.key} className="border-b border-black/5">
                      <td className="px-2 py-2">{center.label}</td>
                      <td className="px-2 py-2 tabular-nums">
                        {formatMoney(center.forecastAsph)}
                      </td>
                      <td className="px-2 py-2 tabular-nums">
                        {formatMoney(center.actualAsph)}
                      </td>
                      <td
                        className={cn(
                          "px-2 py-2 tabular-nums font-medium",
                          varianceClass(center.variancePct),
                        )}
                      >
                        {formatVariancePct(center.variancePct)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-[#3D421F]">
              Weekly breakdown (4-4-5 allocation)
            </h4>
            <p className="mt-1 text-xs text-black/50">
              Weekly forecast = monthly gross ÷ {month.fiscalWeekCount} fiscal weeks.
              ISO weeks assigned by Monday-in-month.
            </p>
            <div className="mt-2 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-black/10 text-left text-xs uppercase tracking-wide text-black/45">
                    <th className="px-2 py-2">ISO week</th>
                    <th className="px-2 py-2">Fiscal slot</th>
                    <th className="px-2 py-2">Forecast GS</th>
                    <th className="px-2 py-2">Actual GS</th>
                    <th className="px-2 py-2">GS var</th>
                    <th className="px-2 py-2">Forecast covers</th>
                    <th className="px-2 py-2">Actual covers</th>
                    <th className="px-2 py-2">Covers var</th>
                  </tr>
                </thead>
                <tbody>
                  {month.weeks.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-2 py-4 text-sm text-black/45">
                        No ISO weeks start in this calendar month.
                      </td>
                    </tr>
                  ) : (
                    month.weeks.map((week) => (
                      <tr key={`${week.isoYear}-${week.isoWeek}`} className="border-b border-black/5">
                        <td className="px-2 py-2 whitespace-nowrap">{week.weekLabel}</td>
                        <td className="px-2 py-2 tabular-nums">
                          {week.fiscalSlot}/{week.fiscalWeekCount}
                        </td>
                        <td className="px-2 py-2 tabular-nums">
                          {formatMoney(week.forecastGs)}
                        </td>
                        <td className="px-2 py-2 tabular-nums">
                          {formatMoney(week.actualGs)}
                        </td>
                        <td
                          className={cn(
                            "px-2 py-2 tabular-nums font-medium",
                            varianceClass(week.revenueVariancePct),
                          )}
                        >
                          {formatVariancePct(week.revenueVariancePct)}
                        </td>
                        <td className="px-2 py-2 tabular-nums">
                          {week.forecastCovers.toLocaleString()}
                        </td>
                        <td className="px-2 py-2 tabular-nums">
                          {week.actualCovers.toLocaleString()}
                        </td>
                        <td
                          className={cn(
                            "px-2 py-2 tabular-nums font-medium",
                            varianceClass(week.coversVariancePct),
                          )}
                        >
                          {formatVariancePct(week.coversVariancePct)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

export function SalesForecastPanel({
  forecasts,
  dailyRows,
  canEdit,
  initialYear,
}: SalesForecastPanelProps) {
  const router = useRouter();
  const [year, setYear] = useState(initialYear);
  const [isPending, startTransition] = useTransition();

  const yearOptions = useMemo(
    () => listForecastYearOptions(forecasts, dailyRows),
    [forecasts, dailyRows],
  );

  const yearView = useMemo(
    () => buildForecastYearView(year, forecasts, dailyRows),
    [year, forecasts, dailyRows],
  );

  function shiftYear(delta: number) {
    const index = yearOptions.indexOf(year);
    const nextIndex = index + delta;
    if (nextIndex >= 0 && nextIndex < yearOptions.length) {
      setYear(yearOptions[nextIndex]);
    }
  }

  function handleSaveMonth(monthKey: string, form: Record<string, string>) {
    const month = yearView.months.find((entry) => entry.monthKey === monthKey);
    startTransition(async () => {
      const formData = new FormData();
      if (month?.forecastId) formData.set("id", month.forecastId);
      formData.set("month_key", monthKey);
      for (const [key, value] of Object.entries(form)) {
        formData.set(key, value || "0");
      }
      const result = await saveVenueMonthlyForecast(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.saved(result.success ?? "Forecast saved.");
      router.refresh();
    });
  }

  return (
    <div className="mx-auto w-full space-y-4 lg:w-2/3">
      <div className="flex flex-wrap items-center justify-center gap-3 text-center">
        <p className="text-sm text-black/55">
          Yearly revenue, covers, and ASPH targets using the 4-4-5 fiscal week
          pattern ({total445WeeksInYear()} weeks). Actuals come from Daily Sales.
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => shiftYear(1)}
            disabled={yearOptions.indexOf(year) >= yearOptions.length - 1}
            className="rounded-md border border-black/10 p-2 hover:bg-black/[0.03] disabled:opacity-40"
            aria-label="Previous year"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[4rem] rounded-md bg-[var(--venue-primary)] px-3 py-1 text-center font-serif text-lg font-semibold text-white">
            {year}
          </span>
          <button
            type="button"
            onClick={() => shiftYear(-1)}
            disabled={yearOptions.indexOf(year) <= 0}
            className="rounded-md border border-black/10 p-2 hover:bg-black/[0.03] disabled:opacity-40"
            aria-label="Next year"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <YearSummaryCards summary={yearView} />

      <div className="space-y-3">
        {yearView.months.map((month) => (
          <MonthSection
            key={month.monthKey}
            month={month}
            canEdit={canEdit}
            isPending={isPending}
            onSave={handleSaveMonth}
          />
        ))}
      </div>
    </div>
  );
}

function YearSummaryCards({ summary }: { summary: ForecastYearSummary }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <SummaryCard
        label="Gross sales YTD"
        forecast={summary.forecastGs}
        actual={summary.actualGs}
        variancePct={summary.revenueVariancePct}
      />
      <SummaryCard
        label="Covers YTD"
        forecast={summary.forecastCovers}
        actual={summary.actualCovers}
        variancePct={summary.coversVariancePct}
        formatValue={(value) =>
          value == null ? "—" : value.toLocaleString(undefined, { maximumFractionDigits: 0 })
        }
      />
      <SummaryCard
        label="Venue ASPH YTD"
        forecast={summary.forecastVenueAsph}
        actual={summary.actualVenueAsph}
        variancePct={
          summary.forecastVenueAsph != null && summary.actualVenueAsph != null
            ? ((summary.actualVenueAsph - summary.forecastVenueAsph) /
                summary.forecastVenueAsph) *
              100
            : null
        }
      />
    </div>
  );
}
