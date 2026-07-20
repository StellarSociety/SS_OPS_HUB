"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, FileDown } from "lucide-react";
import { ScopedLink } from "@/components/layout/scoped-link";
import { FiguresAlertsExportDialog } from "@/components/sales/figures-alerts-export-dialog";
import { SalesDateInput } from "@/components/sales/sales-date-input";
import { usePersistedFiguresAlertsFilters } from "@/components/sales/use-persisted-sales-filters";
import { Card } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import {
  formatDisplayDate,
  formatIsoWeekLabel,
  formatMoney,
  formatMonthLabel,
  getCurrentMonthKey,
  getIsoWeekParts,
} from "@/lib/sales/daily-sales-calculations";
import type { VenueDailyDiscountsRecord } from "@/lib/sales/discounts-types";
import type {
  VenueDailySalesRecord,
  VenueSalesTaxSettings,
} from "@/lib/sales/daily-sales-types";
import type { VenueDailyTenderTotal } from "@/lib/sales/daily-tender-totals-store";
import {
  buildFiguresAlertsDays,
  type FiguresAlertCategory,
  type FiguresAlertCheck,
  type FiguresAlertsDay,
} from "@/lib/sales/figures-alerts-calculations";
import {
  DEFAULT_FIGURES_ALERTS_PDF_SECTIONS,
  exportFiguresAlertsPdf,
  filterDaysForExport,
  type FiguresAlertsPdfSections,
} from "@/lib/sales/figures-alerts-pdf";
import {
  buildSalesTableMonthOptions,
  buildSalesTableWeekOptions,
  getCurrentWeekFilterKey,
  getDatesInIsoWeek,
  getDatesInMonth,
} from "@/lib/sales/sales-data-table-dates";
import { getLocalTodayIsoDate } from "@/lib/sales/sales-entry-dates";
import {
  salesTableFilterButtonClass,
  salesTableFilterClearButtonClass,
} from "@/lib/sales/sales-data-table-ui";
import type { VenueWaiterDailySalesEntry } from "@/lib/sales/waiter-sales-types";
import { cn } from "@/lib/utils";

type PeriodMode = "day" | "week" | "month";

type FiguresAlertsPanelProps = {
  venueName: string;
  venueLogoUrl?: string | null;
  userDisplayName: string;
  dailyRecords: VenueDailySalesRecord[];
  waiterRecords: VenueWaiterDailySalesEntry[];
  dailyTenderTotals: VenueDailyTenderTotal[];
  discountsRecords: VenueDailyDiscountsRecord[];
  taxSettings: VenueSalesTaxSettings;
  totalTaxPct: number;
};

const CATEGORY_ORDER: FiguresAlertCategory[] = [
  "tender_verification",
  "tax_collection",
  "waiter_balance",
  "daily_vs_waiters",
  "discounts",
];

function periodToggleClass(active: boolean) {
  return cn(
    "flex-1 rounded px-2 text-xs font-semibold uppercase tracking-wide transition-colors",
    active
      ? "bg-[var(--venue-primary,#3D421F)] text-white"
      : "text-[#3D421F]/70 hover:bg-white/60",
  );
}

function periodNavButtonClass() {
  return "inline-flex h-9 w-9 items-center justify-center rounded-md border border-black/10 bg-white text-[#3D421F] transition-colors hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:opacity-40";
}

function shiftDate(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return getLocalTodayIsoDate(date);
}

function shiftMonthKey(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  return getCurrentMonthKey(date);
}

function shiftWeekKey(weekKey: string, delta: number): string {
  const dates = getDatesInIsoWeek(weekKey);
  if (dates.length === 0) return weekKey;
  const shifted = shiftDate(dates[0], delta * 7);
  const { week, year } = getIsoWeekParts(shifted);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function buildPeriodLabel(
  periodMode: PeriodMode,
  selectedDate: string,
  weekFilter: string,
  monthFilter: string,
  weekOptions: Array<{ value: string; label: string }>,
  monthOptions: Array<{ value: string; label: string }>,
  today: string,
): string {
  if (periodMode === "day") return formatDisplayDate(selectedDate);
  if (periodMode === "week") {
    const match = weekOptions.find((option) => option.value === weekFilter);
    if (match) return match.label;
    const dates = getDatesInIsoWeek(weekFilter);
    const { week, year } = getIsoWeekParts(dates[0] ?? today);
    return formatIsoWeekLabel(year, week);
  }
  const match = monthOptions.find((option) => option.value === monthFilter);
  return match?.label ?? formatMonthLabel(monthFilter);
}

function formatComparisonValue(
  value: number,
  unit: "money" | "count",
): string {
  if (unit === "count") return String(value);
  return formatMoney(value);
}

function formatPairDifference(
  difference: number,
  unit: "money" | "count",
  matched: boolean,
): string {
  if (matched) return "—";
  if (unit === "count") {
    const sign = difference > 0 ? "+" : "";
    return `${sign}${difference}`;
  }
  const sign = difference > 0 ? "+" : "-";
  return `${sign}${formatMoney(Math.abs(difference))}`;
}

function ComparisonSide({
  row,
}: {
  row: FiguresAlertCheck["pairs"][number]["left"];
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-[#3D421F]">{row.label}</p>
      <p className="truncate text-[10px] text-black/45">{row.page}</p>
      <p className="mt-1 text-sm font-bold tabular-nums text-[#3D421F]">
        {formatComparisonValue(row.value, row.unit)}
      </p>
    </div>
  );
}

function AlertCheckBlock({ check }: { check: FiguresAlertCheck }) {
  return (
    <li className="rounded-md border border-amber-200/80 bg-white px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <ScopedLink
            href={check.href}
            className="text-sm font-semibold text-[#3D421F] underline-offset-2 hover:underline"
          >
            {check.label}
          </ScopedLink>
          <p className="mt-0.5 text-[11px] font-medium text-black/45">
            Check on: {check.pageName}
          </p>
        </div>
      </div>

      <p className="mt-2 text-sm text-[#3D421F]/85">{check.summary}</p>

      <div className="mt-3 space-y-2">
        <p className="text-[10px] font-medium uppercase tracking-wide text-black/40">
          Values compared
        </p>
        {check.pairs.map((pair) => (
          <div
            key={`${pair.left.page}-${pair.left.label}-${pair.right.page}-${pair.right.label}`}
            className={cn(
              "grid grid-cols-[1fr_1fr_auto] items-stretch gap-2 rounded-md border px-2 py-2",
              pair.matched
                ? "border-black/5 bg-black/[0.02]"
                : "border-amber-200/70 bg-amber-50/50",
            )}
          >
            <ComparisonSide row={pair.left} />
            <ComparisonSide row={pair.right} />
            <div
              className={cn(
                "flex min-w-[5.5rem] flex-col items-center justify-center rounded-md border px-2 py-1.5 text-center",
                pair.matched
                  ? "border-emerald-200/80 bg-emerald-50 text-emerald-800"
                  : "border-amber-300/80 bg-amber-100 text-amber-900",
              )}
            >
              <p className="text-[9px] font-medium uppercase tracking-wide opacity-70">
                Diff
              </p>
              <p className="mt-0.5 text-sm font-bold tabular-nums">
                {formatPairDifference(
                  pair.difference,
                  pair.left.unit,
                  pair.matched,
                )}
              </p>
            </div>
          </div>
        ))}
      </div>

      {check.mismatches.length > 0 ? (
        <ul className="mt-3 space-y-1.5 border-t border-amber-200/60 pt-2.5">
          {check.mismatches.map((mismatch) => (
            <li
              key={mismatch}
              className="flex gap-2 text-xs leading-snug text-amber-900"
            >
              <AlertTriangle
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700"
                aria-hidden
              />
              <span>{mismatch}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3">
        <ScopedLink
          href={check.href}
          className="text-xs font-semibold text-[#3D421F] underline-offset-2 hover:underline"
        >
          Open {check.pageName} →
        </ScopedLink>
      </div>
    </li>
  );
}

function DayAlertCard({ day }: { day: FiguresAlertsDay }) {
  const alerts = day.checks.filter((check) => !check.balanced);
  const okChecks = day.checks.filter((check) => check.balanced);

  return (
    <Card
      className={cn(
        "w-full border p-4",
        day.balanced
          ? "border-emerald-200/80 bg-emerald-50/40"
          : "border-amber-200/80 bg-amber-50/30",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-serif text-lg font-bold text-[#3D421F]">
            {formatDisplayDate(day.sale_date)}
          </p>
          <p className="mt-0.5 text-xs text-black/50">
            Week {day.weekNumber} · {day.weekDay}
          </p>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wide",
            day.balanced
              ? "bg-emerald-100 text-emerald-800"
              : "bg-amber-100 text-amber-800",
          )}
        >
          {day.balanced ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
              Balanced
            </>
          ) : (
            <>
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
              {day.alertCount} alert{day.alertCount === 1 ? "" : "s"}
            </>
          )}
        </span>
      </div>

      {alerts.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {alerts.map((check) => (
            <AlertCheckBlock key={check.category} check={check} />
          ))}
        </ul>
      ) : null}

      {okChecks.length > 0 ? (
        <div className="mt-3 space-y-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-black/40">
            Matching
          </p>
          <div className="flex flex-wrap gap-1.5">
            {okChecks
              .slice()
              .sort(
                (a, b) =>
                  CATEGORY_ORDER.indexOf(a.category) -
                  CATEGORY_ORDER.indexOf(b.category),
              )
              .map((check) => (
                <span
                  key={check.category}
                  className="inline-flex items-center gap-1 rounded-full bg-emerald-100/80 px-2 py-0.5 text-[10px] font-medium text-emerald-800"
                  title={check.pageName}
                >
                  <CheckCircle2 className="h-3 w-3" aria-hidden />
                  {check.label}
                </span>
              ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
}

export function FiguresAlertsPanel({
  venueName,
  venueLogoUrl,
  userDisplayName,
  dailyRecords,
  waiterRecords,
  dailyTenderTotals,
  discountsRecords,
  taxSettings,
  totalTaxPct,
}: FiguresAlertsPanelProps) {
  const today = getLocalTodayIsoDate();
  const {
    periodMode,
    selectedDate,
    weekFilter,
    monthFilter,
    setPeriodMode,
    setSelectedDate,
    setWeekFilter,
    setMonthFilter,
  } = usePersistedFiguresAlertsFilters();
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportSections, setExportSections] =
    useState<FiguresAlertsPdfSections>(DEFAULT_FIGURES_ALERTS_PDF_SECTIONS);

  const allSaleDates = useMemo(() => {
    const dates = new Set<string>();
    for (const record of dailyRecords) dates.add(record.sale_date);
    for (const record of waiterRecords) dates.add(record.sale_date);
    for (const row of dailyTenderTotals) dates.add(row.sale_date);
    for (const record of discountsRecords) dates.add(record.sale_date);
    return Array.from(dates).sort();
  }, [dailyRecords, waiterRecords, dailyTenderTotals, discountsRecords]);

  const weekOptions = useMemo(
    () =>
      buildSalesTableWeekOptions(
        allSaleDates,
        formatIsoWeekLabel,
        getIsoWeekParts,
      ),
    [allSaleDates],
  );

  const monthOptions = useMemo(
    () =>
      buildSalesTableMonthOptions(
        allSaleDates,
        formatMonthLabel,
        getCurrentMonthKey,
      ),
    [allSaleDates],
  );

  const periodDates = useMemo(() => {
    if (periodMode === "day") return [selectedDate];
    if (periodMode === "week") return getDatesInIsoWeek(weekFilter);
    return getDatesInMonth(monthFilter);
  }, [periodMode, selectedDate, weekFilter, monthFilter]);

  const days = useMemo(
    () =>
      buildFiguresAlertsDays({
        dailyRecords,
        waiterRecords,
        dailyTenderTotals,
        discountsRecords,
        taxSettings,
        totalTaxPct,
        dates: periodDates,
      }),
    [
      dailyRecords,
      waiterRecords,
      dailyTenderTotals,
      discountsRecords,
      taxSettings,
      totalTaxPct,
      periodDates,
    ],
  );

  const activeDays = useMemo(
    () => days.filter((day) => day.hasActivity),
    [days],
  );
  const alertDays = useMemo(
    () => activeDays.filter((day) => !day.balanced),
    [activeDays],
  );
  const balancedDays = useMemo(
    () => activeDays.filter((day) => day.balanced),
    [activeDays],
  );

  const [showBalanced, setShowBalanced] = useState(false);

  const periodLabel = useMemo(
    () =>
      buildPeriodLabel(
        periodMode,
        selectedDate,
        weekFilter,
        monthFilter,
        weekOptions,
        monthOptions,
        today,
      ),
    [
      periodMode,
      selectedDate,
      weekFilter,
      monthFilter,
      weekOptions,
      monthOptions,
      today,
    ],
  );

  function openExportDialog() {
    setExportSections(DEFAULT_FIGURES_ALERTS_PDF_SECTIONS);
    setExportDialogOpen(true);
  }

  async function handleExportPdf() {
    const exportDays = filterDaysForExport(activeDays, exportSections);
    if (exportDays.length === 0) {
      toast.alert("No days match the selected export options for this period.");
      return;
    }

    setExportingPdf(true);
    try {
      await exportFiguresAlertsPdf({
        venueName,
        venueLogoUrl,
        periodLabel,
        days: exportDays,
        sections: exportSections,
        exportedAt: new Date(),
        userDisplayName,
      });
      setExportDialogOpen(false);
    } catch (error) {
      console.error("[figures-alerts/export-pdf]", error);
      toast.error(
        error instanceof Error ? error.message : "Could not export PDF.",
      );
    } finally {
      setExportingPdf(false);
    }
  }

  function selectPeriodMode(mode: PeriodMode) {
    setPeriodMode(mode);
  }

  function applyCurrentPeriod() {
    if (periodMode === "day") {
      setSelectedDate(today);
      return;
    }
    if (periodMode === "week") {
      setWeekFilter(getCurrentWeekFilterKey());
      return;
    }
    setMonthFilter(getCurrentMonthKey());
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
                className={periodToggleClass(periodMode === "day")}
                onClick={() => selectPeriodMode("day")}
              >
                Day
              </button>
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
                Month
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {periodMode === "day" ? (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className={periodNavButtonClass()}
                  onClick={() => setSelectedDate((d) => shiftDate(d, -1))}
                  aria-label="Previous day"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <SalesDateInput
                  value={selectedDate}
                  onChange={setSelectedDate}
                  className="h-9 w-[11.5rem]"
                />
                <button
                  type="button"
                  className={periodNavButtonClass()}
                  onClick={() => setSelectedDate((d) => shiftDate(d, 1))}
                  aria-label="Next day"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            ) : periodMode === "week" ? (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className={periodNavButtonClass()}
                  onClick={() => setWeekFilter((key) => shiftWeekKey(key, -1))}
                  aria-label="Previous week"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <select
                  value={weekFilter}
                  onChange={(event) => setWeekFilter(event.target.value)}
                  className="h-9 min-w-[14rem] rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F]"
                >
                  {!weekOptions.some((o) => o.value === weekFilter) ? (
                    <option value={weekFilter}>
                      {(() => {
                        const dates = getDatesInIsoWeek(weekFilter);
                        const { week, year } = getIsoWeekParts(
                          dates[0] ?? today,
                        );
                        return formatIsoWeekLabel(year, week);
                      })()}
                    </option>
                  ) : null}
                  {weekOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={periodNavButtonClass()}
                  onClick={() => setWeekFilter((key) => shiftWeekKey(key, 1))}
                  aria-label="Next week"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className={periodNavButtonClass()}
                  onClick={() => setMonthFilter((key) => shiftMonthKey(key, -1))}
                  aria-label="Previous month"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <select
                  value={monthFilter}
                  onChange={(event) => setMonthFilter(event.target.value)}
                  className="h-9 min-w-[12rem] rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F]"
                >
                  {!monthOptions.some((o) => o.value === monthFilter) ? (
                    <option value={monthFilter}>
                      {formatMonthLabel(monthFilter)}
                    </option>
                  ) : null}
                  {monthOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={periodNavButtonClass()}
                  onClick={() => setMonthFilter((key) => shiftMonthKey(key, 1))}
                  aria-label="Next month"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            className={salesTableFilterButtonClass()}
            onClick={applyCurrentPeriod}
          >
            {periodMode === "day"
              ? "Today"
              : periodMode === "week"
                ? "This week"
                : "This month"}
          </button>

          <button
            type="button"
            disabled={activeDays.length === 0 || exportingPdf}
            onClick={openExportDialog}
            className={cn(
              salesTableFilterClearButtonClass(),
              "inline-flex items-center gap-1.5",
            )}
          >
            <FileDown className="size-4 shrink-0" aria-hidden />
            Export PDF
          </button>
        </div>
      </Card>

      <FiguresAlertsExportDialog
        open={exportDialogOpen}
        periodLabel={periodLabel}
        sections={exportSections}
        exporting={exportingPdf}
        onSectionsChange={setExportSections}
        onClose={() => setExportDialogOpen(false)}
        onExport={() => void handleExportPdf()}
      />

      {activeDays.length === 0 ? (
        <Card className="mx-auto w-full max-w-none p-8 text-center md:w-2/3">
          <p className="text-sm text-black/50">
            No sales, tender, or discount entries for this period.
          </p>
        </Card>
      ) : (
        <div className="mx-auto w-full space-y-3 md:w-2/3">
          {alertDays.length === 0 ? (
            <Card className="border border-emerald-200/80 bg-emerald-50/40 p-6 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-700" />
              <p className="mt-2 font-serif text-lg font-bold text-emerald-800">
                All figures match for this period
              </p>
              <p className="mt-1 text-sm text-emerald-800/70">
                Tender verification, tax collection, waiter balance, daily vs
                waiters, and discounts are balanced.
              </p>
            </Card>
          ) : (
            alertDays.map((day) => <DayAlertCard key={day.sale_date} day={day} />)
          )}

          {balancedDays.length > 0 ? (
            <div className="pt-2">
              <button
                type="button"
                className="text-xs font-medium uppercase tracking-wide text-black/45 underline-offset-2 hover:text-[#3D421F] hover:underline"
                onClick={() => setShowBalanced((prev) => !prev)}
              >
                {showBalanced ? "Hide" : "Show"} {balancedDays.length} balanced
                day{balancedDays.length === 1 ? "" : "s"}
              </button>
              {showBalanced ? (
                <div className="mt-3 space-y-3">
                  {balancedDays.map((day) => (
                    <DayAlertCard key={day.sale_date} day={day} />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
