import {
  formatIsoWeekLabel,
  formatMonthLabel,
  getIsoWeekMonday,
  getIsoWeekParts,
} from "@/lib/sales/daily-sales-calculations";
import type { VenueMonthlyForecast } from "@/lib/sales/daily-snap-types";
import { get445WeekCountForMonthKey } from "@/lib/sales/forecast-445-calendar";
import { formatLocalDateFromDate } from "@/lib/sales/sales-data-table-dates";

export const FORECAST_REVENUE_CENTERS = [
  { key: "food", label: "Food", forecastField: "forecast_food_asph" as const },
  {
    key: "beverages",
    label: "Beverages",
    forecastField: "forecast_beverages_asph" as const,
  },
  { key: "wine", label: "Wine", forecastField: "forecast_wine_asph" as const },
  {
    key: "shisha",
    label: "Shisha",
    forecastField: "forecast_shisha_asph" as const,
  },
  {
    key: "other",
    label: "Other",
    forecastField: "forecast_other_asph" as const,
  },
] as const;

type DailySalesActualRow = {
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
};

export type ForecastRevenueCenterKpi = {
  key: string;
  label: string;
  forecastAsph: number | null;
  actualAsph: number | null;
  variancePct: number | null;
};

export type ForecastWeekRow = {
  isoWeek: number;
  isoYear: number;
  weekLabel: string;
  fiscalSlot: number;
  fiscalWeekCount: number;
  forecastGs: number;
  actualGs: number;
  forecastCovers: number;
  actualCovers: number;
  revenueVarianceGs: number;
  revenueVariancePct: number | null;
  coversVariance: number;
  coversVariancePct: number | null;
};

export type ForecastMonthRow = {
  monthKey: string;
  monthLabel: string;
  fiscalWeekCount: number;
  forecastId: string | null;
  forecastGs: number;
  actualGs: number;
  forecastCovers: number;
  actualCovers: number;
  forecastVenueAsph: number | null;
  actualVenueAsph: number | null;
  revenueVarianceGs: number;
  revenueVariancePct: number | null;
  coversVariance: number;
  coversVariancePct: number | null;
  venueAsphVariancePct: number | null;
  revenueCenters: ForecastRevenueCenterKpi[];
  weeks: ForecastWeekRow[];
};

export type ForecastYearSummary = {
  year: number;
  forecastGs: number;
  actualGs: number;
  forecastCovers: number;
  actualCovers: number;
  forecastVenueAsph: number | null;
  actualVenueAsph: number | null;
  revenueVarianceGs: number;
  revenueVariancePct: number | null;
  coversVariance: number;
  coversVariancePct: number | null;
  months: ForecastMonthRow[];
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundCount(value: number): number {
  return Math.round(value);
}

function variancePct(actual: number, target: number): number | null {
  if (target <= 0) return null;
  return roundMoney(((actual - target) / target) * 100);
}

function asph(gross: number, covers: number): number | null {
  if (covers <= 0) return null;
  return roundMoney(gross / covers);
}

function monthKeyForYearMonth(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

function listIsoWeeksInCalendarMonth(year: number, monthIndex: number) {
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const monthKey = monthKeyForYearMonth(year, monthIndex);
  const seen = new Map<string, { isoWeek: number; isoYear: number; mondayIso: string }>();

  for (let day = 1; day <= daysInMonth; day++) {
    const saleDate = `${monthKey}-${String(day).padStart(2, "0")}`;
    const { week, year: isoYear } = getIsoWeekParts(saleDate);
    const key = `${isoYear}-W${week}`;
    if (seen.has(key)) continue;

    const monday = getIsoWeekMonday(isoYear, week);
    const mondayIso = formatLocalDateFromDate(monday);
    if (mondayIso.slice(0, 7) !== monthKey) continue;

    seen.set(key, { isoWeek: week, isoYear, mondayIso });
  }

  return Array.from(seen.values()).sort((a, b) =>
    a.mondayIso.localeCompare(b.mondayIso),
  );
}

function aggregateActualsForMonth(
  rows: DailySalesActualRow[],
  monthKey: string,
) {
  const monthRows = rows.filter((row) => row.sale_date.startsWith(`${monthKey}-`));
  const actualGs = roundMoney(
    monthRows.reduce((sum, row) => sum + row.totalVenueGs, 0),
  );
  const actualCovers = roundCount(
    monthRows.reduce((sum, row) => sum + row.totalCovers, 0),
  );
  const foodGs = monthRows.reduce((sum, row) => sum + row.totalFoodGs, 0);
  const beveragesGs = monthRows.reduce(
    (sum, row) => sum + row.totalBeveragesGs,
    0,
  );
  const wineGs = monthRows.reduce((sum, row) => sum + row.totalWineGs, 0);
  const shishaGs = monthRows.reduce((sum, row) => sum + row.totalShishaGs, 0);
  const otherGs = monthRows.reduce(
    (sum, row) =>
      sum +
      row.totalTobaccoGs +
      row.totalOthersGs +
      row.totalServiceFeesGs,
    0,
  );

  return {
    actualGs,
    actualCovers,
    actualVenueAsph: asph(actualGs, actualCovers),
    actualFoodAsph: asph(foodGs, actualCovers),
    actualBeveragesAsph: asph(beveragesGs, actualCovers),
    actualWineAsph: asph(wineGs, actualCovers),
    actualShishaAsph: asph(shishaGs, actualCovers),
    actualOtherAsph: asph(otherGs, actualCovers),
    monthRows,
  };
}

function aggregateActualsForIsoWeek(
  rows: DailySalesActualRow[],
  isoYear: number,
  isoWeek: number,
) {
  const weekRows = rows.filter((row) => {
    const parts = getIsoWeekParts(row.sale_date);
    return parts.year === isoYear && parts.week === isoWeek;
  });

  const actualGs = roundMoney(
    weekRows.reduce((sum, row) => sum + row.totalVenueGs, 0),
  );
  const actualCovers = roundCount(
    weekRows.reduce((sum, row) => sum + row.totalCovers, 0),
  );

  return { actualGs, actualCovers };
}

function normalizeForecast(record: VenueMonthlyForecast | undefined) {
  if (!record) {
    return {
      id: null,
      forecastGs: 0,
      forecastCovers: 0,
      forecastVenueAsph: null as number | null,
      forecastFoodAsph: null as number | null,
      forecastBeveragesAsph: null as number | null,
      forecastWineAsph: null as number | null,
      forecastShishaAsph: null as number | null,
      forecastOtherAsph: null as number | null,
    };
  }

  const forecastVenueAsph =
    record.forecast_venue_asph > 0 ? record.forecast_venue_asph : null;
  const forecastFoodAsph =
    record.forecast_food_asph > 0 ? record.forecast_food_asph : null;
  const forecastBeveragesAsph =
    record.forecast_beverages_asph > 0 ? record.forecast_beverages_asph : null;
  const forecastWineAsph =
    record.forecast_wine_asph > 0 ? record.forecast_wine_asph : null;
  const forecastShishaAsph =
    record.forecast_shisha_asph > 0 ? record.forecast_shisha_asph : null;
  const forecastOtherAsph =
    record.forecast_other_asph > 0 ? record.forecast_other_asph : null;

  return {
    id: record.id,
    forecastGs: record.forecast_revenue_gs,
    forecastCovers: record.forecast_covers,
    forecastVenueAsph:
      forecastVenueAsph ??
      asph(record.forecast_revenue_gs, record.forecast_covers),
    forecastFoodAsph,
    forecastBeveragesAsph,
    forecastWineAsph,
    forecastShishaAsph,
    forecastOtherAsph,
  };
}

function buildRevenueCenterKpis(
  forecast: ReturnType<typeof normalizeForecast>,
  actuals: ReturnType<typeof aggregateActualsForMonth>,
): ForecastRevenueCenterKpi[] {
  const actualByKey: Record<string, number | null> = {
    food: actuals.actualFoodAsph,
    beverages: actuals.actualBeveragesAsph,
    wine: actuals.actualWineAsph,
    shisha: actuals.actualShishaAsph,
    other: actuals.actualOtherAsph,
  };
  const forecastByKey: Record<string, number | null> = {
    food: forecast.forecastFoodAsph,
    beverages: forecast.forecastBeveragesAsph,
    wine: forecast.forecastWineAsph,
    shisha: forecast.forecastShishaAsph,
    other: forecast.forecastOtherAsph,
  };

  return FORECAST_REVENUE_CENTERS.map((center) => {
    const target = forecastByKey[center.key];
    const actual = actualByKey[center.key];
    return {
      key: center.key,
      label: center.label,
      forecastAsph: target,
      actualAsph: actual,
      variancePct:
        target != null && actual != null ? variancePct(actual, target) : null,
    };
  });
}

function buildWeekRows(
  monthKey: string,
  forecastGs: number,
  forecastCovers: number,
  monthRows: DailySalesActualRow[],
): ForecastWeekRow[] {
  const year = Number(monthKey.split("-")[0]);
  const monthIndex = Number(monthKey.split("-")[1]) - 1;
  const fiscalWeekCount = get445WeekCountForMonthKey(monthKey);
  const weeklyForecastGs =
    fiscalWeekCount > 0 ? roundMoney(forecastGs / fiscalWeekCount) : 0;
  const weeklyForecastCovers =
    fiscalWeekCount > 0
      ? roundCount(forecastCovers / fiscalWeekCount)
      : 0;

  const isoWeeks = listIsoWeeksInCalendarMonth(year, monthIndex);

  return isoWeeks.map((week, index) => {
    const { actualGs, actualCovers } = aggregateActualsForIsoWeek(
      monthRows,
      week.isoYear,
      week.isoWeek,
    );
    const revenueVarianceGs = roundMoney(actualGs - weeklyForecastGs);
    const coversVariance = actualCovers - weeklyForecastCovers;

    return {
      isoWeek: week.isoWeek,
      isoYear: week.isoYear,
      weekLabel: formatIsoWeekLabel(week.isoYear, week.isoWeek),
      fiscalSlot: Math.min(index + 1, fiscalWeekCount),
      fiscalWeekCount,
      forecastGs: weeklyForecastGs,
      actualGs,
      forecastCovers: weeklyForecastCovers,
      actualCovers,
      revenueVarianceGs,
      revenueVariancePct: variancePct(actualGs, weeklyForecastGs),
      coversVariance,
      coversVariancePct: variancePct(actualCovers, weeklyForecastCovers),
    };
  });
}

export function buildForecastYearView(
  year: number,
  forecasts: VenueMonthlyForecast[],
  dailyRows: DailySalesActualRow[],
): ForecastYearSummary {
  const forecastByMonth = new Map(
    forecasts.filter((row) => row.month_key.startsWith(`${year}-`)).map((row) => [
      row.month_key,
      row,
    ]),
  );

  const yearRows = dailyRows.filter((row) => row.sale_date.startsWith(`${year}-`));

  const months: ForecastMonthRow[] = Array.from({ length: 12 }, (_, monthIndex) => {
    const monthKey = monthKeyForYearMonth(year, monthIndex);
    const forecastRecord = forecastByMonth.get(monthKey);
    const forecast = normalizeForecast(forecastRecord);
    const actuals = aggregateActualsForMonth(yearRows, monthKey);
    const fiscalWeekCount = get445WeekCountForMonthKey(monthKey);
    const revenueVarianceGs = roundMoney(actuals.actualGs - forecast.forecastGs);
    const coversVariance = actuals.actualCovers - forecast.forecastCovers;

    return {
      monthKey,
      monthLabel: formatMonthLabel(monthKey),
      fiscalWeekCount,
      forecastId: forecast.id,
      forecastGs: forecast.forecastGs,
      actualGs: actuals.actualGs,
      forecastCovers: forecast.forecastCovers,
      actualCovers: actuals.actualCovers,
      forecastVenueAsph: forecast.forecastVenueAsph,
      actualVenueAsph: actuals.actualVenueAsph,
      revenueVarianceGs,
      revenueVariancePct: variancePct(actuals.actualGs, forecast.forecastGs),
      coversVariance,
      coversVariancePct: variancePct(
        actuals.actualCovers,
        forecast.forecastCovers,
      ),
      venueAsphVariancePct:
        forecast.forecastVenueAsph != null && actuals.actualVenueAsph != null
          ? variancePct(actuals.actualVenueAsph, forecast.forecastVenueAsph)
          : null,
      revenueCenters: buildRevenueCenterKpis(forecast, actuals),
      weeks: buildWeekRows(
        monthKey,
        forecast.forecastGs,
        forecast.forecastCovers,
        actuals.monthRows,
      ),
    };
  });

  const forecastGs = roundMoney(
    months.reduce((sum, month) => sum + month.forecastGs, 0),
  );
  const actualGs = roundMoney(
    months.reduce((sum, month) => sum + month.actualGs, 0),
  );
  const forecastCovers = roundCount(
    months.reduce((sum, month) => sum + month.forecastCovers, 0),
  );
  const actualCovers = roundCount(
    months.reduce((sum, month) => sum + month.actualCovers, 0),
  );

  return {
    year,
    forecastGs,
    actualGs,
    forecastCovers,
    actualCovers,
    forecastVenueAsph: asph(forecastGs, forecastCovers),
    actualVenueAsph: asph(actualGs, actualCovers),
    revenueVarianceGs: roundMoney(actualGs - forecastGs),
    revenueVariancePct: variancePct(actualGs, forecastGs),
    coversVariance: actualCovers - forecastCovers,
    coversVariancePct: variancePct(actualCovers, forecastCovers),
    months,
  };
}

export function listForecastYearOptions(
  forecasts: VenueMonthlyForecast[],
  dailyRows: DailySalesActualRow[],
): number[] {
  const years = new Set<number>([new Date().getFullYear()]);

  for (const forecast of forecasts) {
    years.add(Number(forecast.month_key.split("-")[0]));
  }
  for (const row of dailyRows) {
    years.add(Number(row.sale_date.slice(0, 4)));
  }

  return Array.from(years).sort((a, b) => b - a);
}
