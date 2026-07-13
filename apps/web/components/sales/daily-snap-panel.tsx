"use client";

import { useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { FileDown, Plus, Trash2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useVenueScope } from "@/components/providers/venue-scope-provider";
import { toScopedHref } from "@/lib/venue/scope-routing";
import {
  removeVenueDailySnapDiscountLine,
  removeVenueDailySnapEvent,
  saveVenueDailySnapDiscountLine,
  saveVenueDailySnapEvent,
  saveVenueDailySnapNotes,
} from "@/lib/actions/sales";
import {
  buildDailySnapSnapshot,
  formatDeviation,
  formatDeviationPct,
} from "@/lib/sales/daily-snap-calculations";
import {
  buildDailySnapPdfFilename,
  exportDailySnapPdfFromElement,
} from "@/lib/sales/daily-snap-pdf";
import type {
  DailySnapSnapshot,
  VenueDailySnapDiscountLine,
  VenueDailySnapEvent,
  VenueDailySnapNotes,
  VenueMonthlyForecast,
} from "@/lib/sales/daily-snap-types";
import {
  formatDisplayDate,
  formatMoney,
} from "@/lib/sales/daily-sales-calculations";
import type { VenueDailyDiscountsRecord } from "@/lib/sales/discounts-types";
import type { VenueDailySalesRecord } from "@/lib/sales/daily-sales-types";
import { getLocalTodayIsoDate } from "@/lib/sales/sales-entry-dates";
import type { VenueTender } from "@/lib/sales/tenders-types";
import type { VenueWaiterDailySalesEntry } from "@/lib/sales/waiter-sales-types";
import type { VenueWaiter } from "@/lib/sales/waiters-types";
import { BulletedCommentTextarea } from "@/components/sales/bulleted-comment-textarea";
import { SalesEntryDateBanner } from "@/components/sales/sales-entry-date-banner";
import { SalesEntryDateBar } from "@/components/sales/sales-entry-date-bar";
import { salesFormFieldInputClass } from "@/components/sales/sales-form-field-row";
import { Card } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type DailySnapPanelProps = {
  venueName: string;
  venueLogoUrl?: string | null;
  dailyRecords: VenueDailySalesRecord[];
  discountsRecords: VenueDailyDiscountsRecord[];
  waiterRecords: VenueWaiterDailySalesEntry[];
  waiters: VenueWaiter[];
  tenders: VenueTender[];
  forecasts: VenueMonthlyForecast[];
  notes: VenueDailySnapNotes | null;
  discountLines: VenueDailySnapDiscountLine[];
  events: VenueDailySnapEvent[];
  /** ISO dates that have any filled Daily Snap data (notes/events/discount lines). */
  snapEntryDates: string[];
  totalTaxPct: number;
  canEdit: boolean;
  userDisplayName: string;
};

type DiscountLineDraft = {
  id?: string;
  table_number: string;
  time_of_day: string;
  guest_name: string;
  reason: string;
  amount_gs: string;
  sort_order: number;
};

type EventDraft = {
  id?: string;
  event_name: string;
  guest_count: string;
  package_name: string;
  total_pay_gs: string;
  service_comments: string;
  sort_order: number;
};

const sectionTitleClass =
  "truncate font-serif text-sm text-black whitespace-nowrap 2xl:text-base";
const tableClass = "w-full table-fixed border-collapse text-xs";
const thClass =
  "border border-black/10 bg-[#E8E8C8] px-2 py-1.5 text-left font-semibold text-[#3D421F]";
const tdClass = "border border-black/10 px-2 py-1.5 align-middle";
const numericClass = "text-right tabular-nums";
const centerNumericClass = "text-center tabular-nums";
const commentInputClass = cn(
  salesFormFieldInputClass(false),
  "h-auto min-h-[4.5rem] resize-y text-sm text-black",
);

function tableTextInputClass(editable: boolean) {
  return cn(
    salesFormFieldInputClass(!editable),
    "h-9 w-full text-sm text-black",
  );
}

function tableCompactInputClass(editable: boolean) {
  return cn(tableTextInputClass(editable), "max-w-[5.5rem] text-right");
}

function tableNumericInputClass(editable: boolean) {
  return cn(tableTextInputClass(editable), "max-w-[8.5rem] text-right");
}

function TableCellInputWrap({ children }: { children: ReactNode }) {
  return <div className="flex justify-end">{children}</div>;
}

function KpiCard({
  label,
  value,
  sub,
  grossNetSub,
}: {
  label: string;
  value?: string;
  sub?: string;
  grossNetSub?: { gross: string; net: string };
}) {
  return (
    <div className="flex h-full min-h-[4.5rem] flex-col items-center justify-start gap-0.5 rounded-lg border border-[var(--venue-primary)]/25 bg-[var(--venue-primary)]/10 px-3 py-2 text-center shadow-sm">
      {label ? (
        <p className="text-xs font-semibold uppercase tracking-wide text-[#3D421F]/70">
          {label}
        </p>
      ) : null}
      {grossNetSub ? (
        <div className="mt-0.5 flex w-full flex-col gap-0.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#3D421F]/70">
            Gross
          </p>
          <p className="font-serif text-xl font-semibold leading-tight tabular-nums text-[#3D421F]">
            {grossNetSub.gross}
          </p>
          <p className="text-sm leading-tight tabular-nums text-[#3D421F]/75">
            Net {grossNetSub.net}
          </p>
        </div>
      ) : (
        <p className="font-serif text-2xl font-semibold tabular-nums text-[#3D421F]">
          {value}
        </p>
      )}
      {sub ? (
        <p className="text-sm tabular-nums text-[#3D421F]/65">{sub}</p>
      ) : null}
    </div>
  );
}

function formatTrendPct(value: number | null): string {
  if (value == null) return "—";
  if (value === 0) return "0.0%";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function trendClass(value: number | null): string {
  if (value == null || value === 0) return "text-black/55";
  return value > 0 ? "text-emerald-700" : "text-amber-700";
}

function DailySnapReportHeader({
  venueName,
  venueLogoUrl,
  selectedDate,
}: {
  venueName: string;
  venueLogoUrl?: string | null;
  selectedDate: string;
}) {
  return (
    <Card className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-2 shadow-sm">
      <div className="flex min-w-0 items-center gap-3">
        {venueLogoUrl ? (
          <img
            src={venueLogoUrl}
            alt=""
            data-export-logo
            className="h-16 w-16 shrink-0 object-contain 2xl:h-[4.5rem] 2xl:w-[4.5rem]"
          />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-[var(--venue-primary)]/15 font-serif text-2xl text-[#3D421F] 2xl:h-[4.5rem] 2xl:w-[4.5rem]">
            {venueName.charAt(0)}
          </div>
        )}
        <span
          className="shrink-0 font-light text-2xl leading-none text-black/25 2xl:text-3xl"
          aria-hidden="true"
        >
          |
        </span>
        <div className="min-w-0 text-left">
          <p className="font-serif text-2xl text-black 2xl:text-3xl">
            Closing Report — Daily Snap
          </p>
        </div>
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-end">
        <div className="rounded-xl border border-black/10 bg-white/80 px-4 py-1.5 shadow-sm">
          <SalesEntryDateBanner dateStr={selectedDate} />
        </div>
      </div>
    </Card>
  );
}

function WaiterSalesTable({ snapshot }: { snapshot: DailySnapSnapshot }) {
  return (
    <Card className="min-w-0 overflow-hidden p-0">
      <div className="border-b border-black/5 px-3 py-2 2xl:px-4">
        <h3 className={sectionTitleClass} title="Waiter Sales">
          Waiter Sales
        </h3>
      </div>
      <div className="overflow-x-auto p-2 2xl:p-3">
        {snapshot.waiterRows.length === 0 ? (
          <p className="text-sm text-black/50">No waiter entries for this date.</p>
        ) : (
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>Waiter</th>
                <th className={cn(thClass, numericClass)}>Sales</th>
                <th className={cn(thClass, centerNumericClass)}>%</th>
                <th
                  className={cn(thClass, centerNumericClass)}
                  title="vs same day prev week"
                >
                  Rev. Trend
                </th>
                <th className={cn(thClass, centerNumericClass)}>Covers</th>
                <th className={cn(thClass, centerNumericClass)}>ASPH</th>
                <th
                  className={cn(thClass, centerNumericClass)}
                  title="vs same day prev week"
                >
                  ASPH Trend
                </th>
                <th className={cn(thClass, numericClass)}>Grat. CC</th>
                <th className={cn(thClass, numericClass)}>Grat. Cash</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.waiterRows.map((row) => (
                <tr key={row.waiterId}>
                  <td className={tdClass}>{row.waiterName}</td>
                  <td className={cn(tdClass, numericClass)}>
                    {formatMoney(row.salesGs)}
                  </td>
                  <td className={cn(tdClass, centerNumericClass)}>
                    {row.salesSharePct != null
                      ? `${row.salesSharePct.toFixed(1)}%`
                      : "—"}
                  </td>
                  <td
                    className={cn(
                      tdClass,
                      centerNumericClass,
                      "font-medium",
                      trendClass(row.salesTrendPct),
                    )}
                  >
                    {formatTrendPct(row.salesTrendPct)}
                  </td>
                  <td className={cn(tdClass, centerNumericClass)}>{row.covers}</td>
                  <td className={cn(tdClass, centerNumericClass)}>
                    {formatMoney(row.asph)}
                  </td>
                  <td
                    className={cn(
                      tdClass,
                      centerNumericClass,
                      "font-medium",
                      trendClass(row.asphTrendPct),
                    )}
                  >
                    {formatTrendPct(row.asphTrendPct)}
                  </td>
                  <td className={cn(tdClass, numericClass)}>
                    {formatMoney(row.gratuityCcGs)}
                  </td>
                  <td className={cn(tdClass, numericClass)}>
                    {formatMoney(row.gratuityCashGs)}
                  </td>
                </tr>
              ))}
              <tr className="bg-[#F5F6F0] font-semibold">
                <td className={tdClass}>Total</td>
                <td className={cn(tdClass, numericClass)}>
                  {formatMoney(snapshot.waiterTotalSalesGs)}
                </td>
                <td className={cn(tdClass, centerNumericClass)}>100%</td>
                <td className={cn(tdClass, centerNumericClass)}>—</td>
                <td className={cn(tdClass, centerNumericClass)}>
                  {snapshot.waiterTotalCovers}
                </td>
                <td className={cn(tdClass, centerNumericClass)}>
                  {formatMoney(snapshot.averageSpend)}
                </td>
                <td className={cn(tdClass, centerNumericClass)}>—</td>
                <td className={cn(tdClass, numericClass)}>
                  {formatMoney(snapshot.gratuityCcGs)}
                </td>
                <td className={cn(tdClass, numericClass)}>
                  {formatMoney(snapshot.gratuityCashGs)}
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </Card>
  );
}

const metricCardClass =
  "flex min-h-[6rem] flex-col items-center justify-center gap-0.5 rounded-lg border border-black/10 bg-white px-2 py-2 text-center xl:px-3 xl:py-2.5";

function ForecastCard({
  label,
  deviation,
}: {
  label: string;
  deviation: DailySnapSnapshot["dailyForecast"];
}) {
  const positive = deviation.deviationGs >= 0;
  return (
    <div className={metricCardClass}>
      <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-black/55">
        {label}
      </p>
      {deviation.hasForecast ? (
        <>
          <p
            className={cn(
              "mt-0.5 text-sm font-semibold tabular-nums xl:text-base",
              positive ? "text-emerald-700" : "text-amber-700",
            )}
          >
            {formatDeviation(deviation.deviationGs)} |{" "}
            {formatDeviationPct(deviation.deviationPct)}
          </p>
          <p className="mt-0.5 text-[10px] leading-tight text-black/60 xl:text-[11px]">
            Actual {formatMoney(deviation.actualGs)} vs{" "}
            {formatMoney(deviation.forecastGs)}
          </p>
        </>
      ) : (
        <p className="mt-1 text-xs text-black/45 xl:text-sm">No forecast set</p>
      )}
    </div>
  );
}

function PeriodComparisonCard({
  label,
  comparison,
  previousLabel,
}: {
  label: string;
  comparison: DailySnapSnapshot["weekToDateRevenue"];
  previousLabel: string;
}) {
  const positive = comparison.differenceGs >= 0;

  return (
    <div className={metricCardClass}>
      <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-black/55">
        {label}
      </p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-black xl:text-base">
        {formatMoney(comparison.currentGs)}
      </p>
      {comparison.hasPreviousData ? (
        <>
          <p
            className={cn(
              "mt-0.5 text-sm font-semibold tabular-nums xl:text-base",
              positive ? "text-emerald-700" : "text-amber-700",
            )}
          >
            {formatDeviation(comparison.differenceGs)} |{" "}
            {formatDeviationPct(comparison.differencePct)}
          </p>
          <p className="mt-0.5 text-[10px] leading-tight text-black/60 xl:text-[11px]">
            vs {previousLabel} {formatMoney(comparison.previousGs)}
          </p>
        </>
      ) : (
        <p className="mt-1 text-xs text-black/45 xl:text-sm">No {previousLabel} data</p>
      )}
    </div>
  );
}

function formatVerificationDifference(value: number): string {
  if (value === 0) return formatMoney(0);
  const sign = value > 0 ? "+" : "-";
  return `${sign}${formatMoney(Math.abs(value))}`;
}

function parseDraftMoney(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function CashDrawerBox({
  openingGs,
  closingGs,
  cashTenderGs,
  editable,
  onOpeningChange,
  onClosingChange,
}: {
  openingGs: string;
  closingGs: string;
  cashTenderGs: number;
  editable: boolean;
  onOpeningChange: (value: string) => void;
  onClosingChange: (value: string) => void;
}) {
  const opening = parseDraftMoney(openingGs);
  const closing = parseDraftMoney(closingGs);
  const differenceGs = closing - opening;
  const expectedClosingGs = opening + cashTenderGs;
  const overShortGs = closing - expectedClosingGs;
  const hasValues = opening > 0 || closing > 0;

  return (
    <Card className="flex w-full flex-col self-start p-4">
      <h3 className={cn(sectionTitleClass, "mb-3")}>Cash Drawer</h3>
      <div className="flex flex-col gap-2">
        <div className="rounded-lg border border-black/10 bg-[var(--venue-secondary)]/20 px-3 py-2.5">
          <label className="block text-xs font-medium uppercase tracking-wide text-black/50">
            Opening
          </label>
          {editable ? (
            <input
              className={cn(salesFormFieldInputClass(false), "mt-2 text-right tabular-nums")}
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={openingGs}
              onChange={(event) => onOpeningChange(event.target.value)}
            />
          ) : (
            <p className="mt-2 text-xl font-bold tabular-nums text-black">
              {hasValues ? formatMoney(opening) : "—"}
            </p>
          )}
        </div>
        <div className="rounded-lg border border-black/10 bg-[var(--venue-secondary)]/20 px-3 py-2.5">
          <label className="block text-xs font-medium uppercase tracking-wide text-black/50">
            Closing
          </label>
          {editable ? (
            <input
              className={cn(salesFormFieldInputClass(false), "mt-2 text-right tabular-nums")}
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={closingGs}
              onChange={(event) => onClosingChange(event.target.value)}
            />
          ) : (
            <p className="mt-2 text-xl font-bold tabular-nums text-black">
              {hasValues ? formatMoney(closing) : "—"}
            </p>
          )}
        </div>
        <div className="rounded-lg border border-black/10 bg-white px-3 py-2.5">
          <p className="text-xs font-medium uppercase tracking-wide text-black/50">
            Difference
          </p>
          <p
            className={cn(
              "mt-1.5 text-lg font-bold tabular-nums",
              !hasValues
                ? "text-black/40"
                : differenceGs === 0
                  ? "text-black"
                  : differenceGs > 0
                    ? "text-emerald-700"
                    : "text-amber-700",
            )}
          >
            {hasValues ? formatVerificationDifference(differenceGs) : "—"}
          </p>
          <p className="mt-1 text-xs text-black/50">Closing − Opening</p>
        </div>
      </div>
      {hasValues || cashTenderGs > 0 ? (
        <div className="mt-3 flex flex-col gap-1 text-xs text-black/55">
          <span>
            Cash tender:{" "}
            <span className="font-medium tabular-nums text-black/75">
              {formatMoney(cashTenderGs)}
            </span>
          </span>
          {hasValues ? (
            <>
              <span>
                Expected closing:{" "}
                <span className="font-medium tabular-nums text-black/75">
                  {formatMoney(expectedClosingGs)}
                </span>
              </span>
              <span>
                Over / short:{" "}
                <span
                  className={cn(
                    "font-medium tabular-nums",
                    overShortGs === 0
                      ? "text-black/75"
                      : overShortGs > 0
                        ? "text-emerald-700"
                        : "text-amber-700",
                  )}
                >
                  {formatVerificationDifference(overShortGs)}
                </span>
              </span>
            </>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

function VerificationBox({
  verification,
}: {
  verification: DailySnapSnapshot["verification"];
}) {
  if (!verification.hasData) {
    return (
      <Card className="p-4">
        <h3 className={sectionTitleClass}>Values Verification</h3>
        <p className="mt-2 text-sm text-black/50">
          Enter daily sales, waiter sales, and tenders to verify totals.
        </p>
      </Card>
    );
  }

  return (
    <Card className="flex h-full flex-col space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className={cn(sectionTitleClass, "shrink-0 overflow-visible")}>
          Values Verification
        </h3>
        <span
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wide",
            verification.isBalanced
              ? "bg-emerald-100 text-emerald-800"
              : "bg-amber-100 text-amber-800",
          )}
        >
          {verification.isBalanced ? "Balanced" : "Difference found"}
        </span>
      </div>
      <p className="text-sm text-black/60">
        Total Revenue should equal Total Tenders minus Credit Card Gratuity, and
        both should equal Total Waiter Sales.
      </p>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-black/10 bg-[var(--venue-secondary)]/20 px-4 py-3 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-black/50">
            Total Revenue
          </p>
          <p className="mt-1 text-xl font-bold tabular-nums text-black">
            {formatMoney(verification.totalRevenueGs)}
          </p>
          <p className="mt-1 text-xs text-black/50">Daily Sales</p>
        </div>
        <div className="rounded-lg border border-black/10 bg-[var(--venue-secondary)]/20 px-4 py-3 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-black/50">
            Tenders − CC Gratuity
          </p>
          <p className="mt-1 text-xl font-bold tabular-nums text-black">
            {formatMoney(verification.tendersNetOfCcGratuityGs)}
          </p>
          <p className="mt-1 text-xs text-black/50">
            {formatMoney(verification.totalTendersGs)} −{" "}
            {formatMoney(verification.gratuityCcGs)}
          </p>
        </div>
        <div className="rounded-lg border border-black/10 bg-[var(--venue-secondary)]/20 px-4 py-3 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-black/50">
            Total Waiter Sales
          </p>
          <p className="mt-1 text-xl font-bold tabular-nums text-black">
            {formatMoney(verification.totalWaiterSalesGs)}
          </p>
          <p className="mt-1 text-xs text-black/50">Waiter entries</p>
        </div>
      </div>
      {!verification.isBalanced ? (
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-black/10 bg-white px-4 py-3">
            <p className="text-[10px] font-medium uppercase tracking-wide text-black/45">
              Revenue vs Waiter Sales
            </p>
            <p className="mt-1 text-lg font-bold tabular-nums text-amber-700">
              {formatVerificationDifference(verification.revenueVsWaiterDifferenceGs)}
            </p>
          </div>
          <div className="rounded-lg border border-black/10 bg-white px-4 py-3">
            <p className="text-[10px] font-medium uppercase tracking-wide text-black/45">
              Revenue vs Tenders − CC Grat.
            </p>
            <p className="mt-1 text-lg font-bold tabular-nums text-amber-700">
              {formatVerificationDifference(
                verification.revenueVsTendersNetDifferenceGs,
              )}
            </p>
          </div>
          <div className="rounded-lg border border-black/10 bg-white px-4 py-3">
            <p className="text-[10px] font-medium uppercase tracking-wide text-black/45">
              Waiter Sales vs Tenders − CC Grat.
            </p>
            <p className="mt-1 text-lg font-bold tabular-nums text-amber-700">
              {formatVerificationDifference(
                verification.waiterVsTendersNetDifferenceGs,
              )}
            </p>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function RevenueTable({
  title,
  rows,
  showEmpty,
  hideService = false,
}: {
  title: string;
  rows: DailySnapSnapshot["revenueCenters"];
  showEmpty: boolean;
  hideService?: boolean;
}) {
  if (!showEmpty && rows.length === 0) {
    return (
      <Card className="min-w-0 p-4">
        <h3 className={sectionTitleClass} title={title}>
          {title}
        </h3>
        <p className="mt-2 text-sm text-black/50">No data entered for this date.</p>
      </Card>
    );
  }

  const totals = rows.reduce(
    (acc, row) => ({
      lunch: acc.lunch + row.lunchGs,
      dinner: acc.dinner + row.dinnerGs,
      total: acc.total + row.totalGs,
    }),
    { lunch: 0, dinner: 0, total: 0 },
  );

  return (
    <Card className="min-w-0 overflow-hidden p-0">
      <div className="border-b border-black/5 px-3 py-2 2xl:px-4">
        <h3 className={sectionTitleClass} title={title}>
          {title}
        </h3>
      </div>
      <div className="overflow-x-auto p-2 2xl:p-3">
        <table className={tableClass}>
          <thead>
            <tr>
              <th className={thClass}>Category</th>
              {!hideService ? (
                <>
                  <th className={cn(thClass, numericClass)}>Lunch</th>
                  <th className={cn(thClass, numericClass)}>Dinner</th>
                </>
              ) : null}
              <th className={cn(thClass, numericClass)}>Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <td className={tdClass}>{row.label}</td>
                {!hideService ? (
                  <>
                    <td className={cn(tdClass, numericClass)}>{formatMoney(row.lunchGs)}</td>
                    <td className={cn(tdClass, numericClass)}>{formatMoney(row.dinnerGs)}</td>
                  </>
                ) : null}
                <td className={cn(tdClass, numericClass, "font-medium")}>
                  {formatMoney(row.totalGs)}
                </td>
              </tr>
            ))}
            <tr className="bg-[#F5F6F0] font-semibold">
              <td className={tdClass}>Total</td>
              {!hideService ? (
                <>
                  <td className={cn(tdClass, numericClass)}>{formatMoney(totals.lunch)}</td>
                  <td className={cn(tdClass, numericClass)}>{formatMoney(totals.dinner)}</td>
                </>
              ) : null}
              <td className={cn(tdClass, numericClass)}>{formatMoney(totals.total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function DailySnapPanel({
  venueName,
  venueLogoUrl,
  dailyRecords,
  discountsRecords,
  waiterRecords,
  waiters,
  tenders,
  forecasts,
  notes,
  discountLines,
  events,
  snapEntryDates,
  totalTaxPct,
  canEdit,
  userDisplayName,
}: DailySnapPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { scope, slug } = useVenueScope();
  const todayIso = getLocalTodayIsoDate();
  const selectedDate = searchParams.get("date") ?? todayIso;
  const datesWithEntries = useMemo(
    () => new Set(snapEntryDates),
    [snapEntryDates],
  );
  const [isPending, startTransition] = useTransition();
  const [isExporting, setIsExporting] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const exportRootRef = useRef<HTMLDivElement>(null);

  const [notesDraft, setNotesDraft] = useState({
    id: notes?.id,
    eighty_six_lunch: notes?.eighty_six_lunch ?? "",
    eighty_six_dinner: notes?.eighty_six_dinner ?? "",
    service_comments_lunch:
      notes?.service_comments_lunch ??
      (notes as { service_comments?: string } | null)?.service_comments ??
      "",
    service_comments_dinner: notes?.service_comments_dinner ?? "",
    cash_drawer_opening_gs:
      notes?.cash_drawer_opening_gs != null
        ? String(notes.cash_drawer_opening_gs)
        : "",
    cash_drawer_closing_gs:
      notes?.cash_drawer_closing_gs != null
        ? String(notes.cash_drawer_closing_gs)
        : "",
  });

  const [lineDrafts, setLineDrafts] = useState<DiscountLineDraft[]>(
    discountLines.map((line) => ({
      id: line.id,
      table_number: line.table_number,
      time_of_day: line.time_of_day,
      guest_name: line.guest_name,
      reason: line.reason,
      amount_gs: String(line.amount_gs),
      sort_order: line.sort_order,
    })),
  );

  const [eventDrafts, setEventDrafts] = useState<EventDraft[]>(
    events.map((event) => ({
      id: event.id,
      event_name: event.event_name,
      guest_count: String(event.guest_count),
      package_name: event.package_name,
      total_pay_gs: String(event.total_pay_gs),
      service_comments: event.service_comments,
      sort_order: event.sort_order,
    })),
  );

  const snapshot = useMemo(() => {
    const dailyRecord =
      dailyRecords.find((record) => record.sale_date === selectedDate) ?? null;
    const discountsRecord =
      discountsRecords.find((record) => record.sale_date === selectedDate) ?? null;
    const waiterRecordsForDate = waiterRecords.filter(
      (record) => record.sale_date === selectedDate,
    );

    return buildDailySnapSnapshot({
      saleDate: selectedDate,
      dailyRecord,
      discountsRecord,
      dailyRecords,
      waiterRecords,
      waiterRecordsForDate,
      waiters,
      tenders,
      forecasts,
      totalTaxPct,
    });
  }, [
    selectedDate,
    dailyRecords,
    discountsRecords,
    waiterRecords,
    waiters,
    tenders,
    forecasts,
    totalTaxPct,
  ]);

  const isExisting =
    Boolean(notes?.id) || discountLines.length > 0 || events.length > 0;
  const fieldsEditable = canEdit && isFormOpen;

  function setDate(isoDate: string) {
    setIsFormOpen(false);
    const params = new URLSearchParams(searchParams.toString());
    params.set("date", isoDate);
    router.push(
      toScopedHref(`/sales/daily-snap?${params.toString()}`, scope, slug),
    );
  }

  function handleSaveNotes() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("sale_date", selectedDate);
      if (notesDraft.id) formData.set("id", notesDraft.id);
      formData.set("eighty_six_lunch", notesDraft.eighty_six_lunch);
      formData.set("eighty_six_dinner", notesDraft.eighty_six_dinner);
      formData.set("service_comments_lunch", notesDraft.service_comments_lunch);
      formData.set("service_comments_dinner", notesDraft.service_comments_dinner);
      formData.set("cash_drawer_opening_gs", notesDraft.cash_drawer_opening_gs);
      formData.set("cash_drawer_closing_gs", notesDraft.cash_drawer_closing_gs);
      const result = await saveVenueDailySnapNotes(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.saved(result.success ?? "Saved to cloud.");
      router.refresh();
    });
  }

  function handleSaveLine(index: number) {
    const line = lineDrafts[index];
    startTransition(async () => {
      const formData = new FormData();
      formData.set("sale_date", selectedDate);
      if (line.id) formData.set("id", line.id);
      formData.set("table_number", line.table_number);
      formData.set("time_of_day", line.time_of_day);
      formData.set("guest_name", line.guest_name);
      formData.set("reason", line.reason);
      formData.set("amount_gs", line.amount_gs);
      formData.set("sort_order", String(line.sort_order));
      const result = await saveVenueDailySnapDiscountLine(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.saved(result.success ?? "Saved to cloud.");
      router.refresh();
    });
  }

  function handleRemoveLine(index: number) {
    const line = lineDrafts[index];
    if (line.id) {
      startTransition(async () => {
        const formData = new FormData();
        formData.set("id", line.id!);
        const result = await removeVenueDailySnapDiscountLine(formData);
        if (result.error) {
          toast.error(result.error);
          return;
        }
        toast.saved(result.success ?? "Removed.");
        router.refresh();
      });
      return;
    }
    setLineDrafts((current) => current.filter((_, i) => i !== index));
  }

  function addLineDraft() {
    setLineDrafts((current) => [
      ...current,
      {
        table_number: "",
        time_of_day: "",
        guest_name: "",
        reason: "",
        amount_gs: "",
        sort_order: current.length,
      },
    ]);
  }

  function handleSaveEvent(index: number) {
    const event = eventDrafts[index];
    startTransition(async () => {
      const formData = new FormData();
      formData.set("sale_date", selectedDate);
      if (event.id) formData.set("id", event.id);
      formData.set("event_name", event.event_name);
      formData.set("guest_count", event.guest_count);
      formData.set("package_name", event.package_name);
      formData.set("total_pay_gs", event.total_pay_gs);
      formData.set("service_comments", event.service_comments);
      formData.set("sort_order", String(event.sort_order));
      const result = await saveVenueDailySnapEvent(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.saved(result.success ?? "Saved to cloud.");
      router.refresh();
    });
  }

  function handleRemoveEvent(index: number) {
    const event = eventDrafts[index];
    if (event.id) {
      startTransition(async () => {
        const formData = new FormData();
        formData.set("id", event.id!);
        const result = await removeVenueDailySnapEvent(formData);
        if (result.error) {
          toast.error(result.error);
          return;
        }
        toast.saved(result.success ?? "Removed.");
        router.refresh();
      });
      return;
    }
    setEventDrafts((current) => current.filter((_, i) => i !== index));
  }

  function addEventDraft() {
    setEventDrafts((current) => [
      ...current,
      {
        event_name: "",
        guest_count: "",
        package_name: "",
        total_pay_gs: "",
        service_comments: "",
        sort_order: current.length,
      },
    ]);
  }

  async function handleExport() {
    if (!exportRootRef.current) {
      toast.alert("Could not export — report content is not ready.");
      return;
    }

    setIsExporting(true);
    try {
      await exportDailySnapPdfFromElement(
        exportRootRef.current,
        buildDailySnapPdfFilename(venueName, selectedDate),
        { userDisplayName },
      );
    } catch (error) {
      console.error("[daily-snap] PDF export failed:", error);
      toast.error(error instanceof Error ? error.message : "Export failed.");
    } finally {
      setIsExporting(false);
    }
  }

  const missingData: string[] = [];
  if (!snapshot.hasDailySales) missingData.push("Daily Sales");
  if (!snapshot.hasWaiterSales) missingData.push("Waiter Sales");
  if (!snapshot.hasDiscounts) missingData.push("Discounts");

  return (
    <div
      ref={exportRootRef}
      data-daily-snap-export-root
      className="space-y-3"
    >
      <div data-export-hide>
        <SalesEntryDateBar
          selectedDate={selectedDate}
          canEdit={canEdit}
          onDateChange={setDate}
          isFormOpen={isFormOpen}
          isExisting={isExisting}
          isPending={isPending}
          onOpenForm={() => setIsFormOpen(true)}
          onSave={handleSaveNotes}
          datesWithEntries={datesWithEntries}
          trailingActions={
            <button
              type="button"
              disabled={isExporting}
              onClick={handleExport}
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md bg-[var(--venue-primary)] px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <FileDown className="h-4 w-4" />
              {isExporting ? "Exporting…" : "Export PDF"}
            </button>
          }
        />
      </div>

      {!isFormOpen && canEdit ? (
        <p
          data-export-hide
          className="text-center text-sm text-black/50"
        >
          Viewing {isExisting ? "saved entry" : "empty day"} for this date. Click{" "}
          {isExisting ? "Edit entry" : "Create entry"} to make changes.
        </p>
      ) : null}

      {missingData.length > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          Missing entries for this date: {missingData.join(", ")}. Data shown is
          partial until all forms are completed.
        </div>
      ) : null}

      <DailySnapReportHeader
        venueName={venueName}
        venueLogoUrl={venueLogoUrl}
        selectedDate={selectedDate}
      />

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-9">
        <KpiCard
          label="Total Revenue"
          value={formatMoney(snapshot.totalRevenueGs)}
          grossNetSub={{
            gross: formatMoney(snapshot.totalRevenueGs),
            net: formatMoney(snapshot.totalRevenueNetGs),
          }}
        />
        <KpiCard
          label="Lunch Revenue"
          value={formatMoney(snapshot.lunchRevenueGs)}
          grossNetSub={{
            gross: formatMoney(snapshot.lunchRevenueGs),
            net: formatMoney(snapshot.lunchRevenueNetGs),
          }}
        />
        <KpiCard
          label="Dinner Revenue"
          value={formatMoney(snapshot.dinnerRevenueGs)}
          grossNetSub={{
            gross: formatMoney(snapshot.dinnerRevenueGs),
            net: formatMoney(snapshot.dinnerRevenueNetGs),
          }}
        />
        <KpiCard
          label="Covers"
          value={String(snapshot.totalCovers + snapshot.totalWalkinCovers)}
          sub={`${snapshot.totalWalkinCovers} walk-in covers`}
        />
        <KpiCard
          label="Bookings"
          value={String(snapshot.totalBookings + snapshot.totalWalkinTables)}
          sub={`${snapshot.totalWalkinTables} walk-in tables`}
        />
        <KpiCard label="Avg Spend" value={formatMoney(snapshot.averageSpend)} />
        <KpiCard
          label="Gratuity"
          value={formatMoney(snapshot.gratuityTotalGs)}
          sub={`CC ${formatMoney(snapshot.gratuityCcGs)} · Cash ${formatMoney(snapshot.gratuityCashGs)}`}
        />
        <KpiCard label="Cash Tender" value={formatMoney(snapshot.cashTenderGs)} />
        <KpiCard label="Discounts" value={formatMoney(snapshot.totalDiscountGs)} />
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 [&>*]:min-w-0">
        <ForecastCard label="Daily vs Forecast" deviation={snapshot.dailyForecast} />
        <ForecastCard label="Weekly vs Forecast" deviation={snapshot.weeklyForecast} />
        <ForecastCard label="Monthly vs Forecast" deviation={snapshot.monthlyForecast} />
        <PeriodComparisonCard
          label="Week to Date Revenue"
          comparison={snapshot.weekToDateRevenue}
          previousLabel="prev week"
        />
        <PeriodComparisonCard
          label="Month to Date Revenue"
          comparison={snapshot.monthToDateRevenue}
          previousLabel="prev month"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3 [&>*]:min-w-0">
        <RevenueTable
          title="Revenue Centers"
          rows={snapshot.revenueCenters}
          showEmpty={snapshot.hasDailySales}
        />
        <Card className="min-w-0 overflow-hidden p-0">
          <div className="border-b border-black/5 px-3 py-2 2xl:px-4">
            <h3 className={sectionTitleClass} title="Tenders">
              Tenders
            </h3>
          </div>
          <div className="overflow-x-auto p-2 2xl:p-3">
            {snapshot.tenderRows.length === 0 ? (
              <p className="text-sm text-black/50">No tenders configured for this venue.</p>
            ) : (
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th className={thClass}>Tender</th>
                    <th className={cn(thClass, numericClass)}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.tenderRows.map((row) => (
                    <tr key={row.tenderId}>
                      <td className={tdClass}>{row.tenderName}</td>
                      <td className={cn(tdClass, numericClass)}>
                        {formatMoney(row.amountGs)}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-[#F5F6F0] font-semibold">
                    <td className={tdClass}>Total</td>
                    <td className={cn(tdClass, numericClass)}>
                      {formatMoney(snapshot.verification.totalTendersGs)}
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        </Card>
        <RevenueTable
          title="Discounts by Category"
          rows={snapshot.discountCategories}
          showEmpty={snapshot.hasDiscounts}
          hideService
        />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2 [&>*]:min-w-0">
        <WaiterSalesTable snapshot={snapshot} />
        <VerificationBox verification={snapshot.verification} />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,16rem)_1fr] [&>*]:min-w-0">
        <CashDrawerBox
          openingGs={notesDraft.cash_drawer_opening_gs}
          closingGs={notesDraft.cash_drawer_closing_gs}
          cashTenderGs={snapshot.cashTenderGs}
          editable={fieldsEditable}
          onOpeningChange={(value) =>
            setNotesDraft((current) => ({ ...current, cash_drawer_opening_gs: value }))
          }
          onClosingChange={(value) =>
            setNotesDraft((current) => ({ ...current, cash_drawer_closing_gs: value }))
          }
        />

        <Card className="flex h-full flex-col p-4">
          <h3 className={cn(sectionTitleClass, "mb-3")}>Daily Comments</h3>
          <div className="grid flex-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-black/55">
              86&apos;s — Lunch
            </label>
            <BulletedCommentTextarea
              value={notesDraft.eighty_six_lunch}
              onChange={(value) =>
                setNotesDraft((current) => ({ ...current, eighty_six_lunch: value }))
              }
              disabled={!fieldsEditable}
              rows={3}
              className={commentInputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-black/55">
              86&apos;s — Dinner
            </label>
            <BulletedCommentTextarea
              value={notesDraft.eighty_six_dinner}
              onChange={(value) =>
                setNotesDraft((current) => ({ ...current, eighty_six_dinner: value }))
              }
              disabled={!fieldsEditable}
              rows={3}
              className={commentInputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-black/55">
              Service Comments — Lunch
            </label>
            <BulletedCommentTextarea
              value={notesDraft.service_comments_lunch}
              onChange={(value) =>
                setNotesDraft((current) => ({
                  ...current,
                  service_comments_lunch: value,
                }))
              }
              disabled={!fieldsEditable}
              rows={3}
              className={commentInputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-black/55">
              Service Comments — Dinner
            </label>
            <BulletedCommentTextarea
              value={notesDraft.service_comments_dinner}
              onChange={(value) =>
                setNotesDraft((current) => ({
                  ...current,
                  service_comments_dinner: value,
                }))
              }
              disabled={!fieldsEditable}
              rows={3}
              className={commentInputClass}
            />
          </div>
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-black/5 px-4 py-2">
          <h3 className={sectionTitleClass}>Events Breakdown</h3>
          {fieldsEditable ? (
            <button
              type="button"
              data-export-hide
              onClick={addEventDraft}
              className="inline-flex items-center gap-1 rounded-md border border-black/10 px-2 py-1 text-xs hover:bg-black/[0.03]"
            >
              <Plus className="h-3.5 w-3.5" />
              Add event
            </button>
          ) : null}
        </div>
        <div className="overflow-x-auto p-3">
          {eventDrafts.length === 0 ? (
            <p className="text-sm text-black/50">
              No events recorded for {formatDisplayDate(selectedDate)}.
            </p>
          ) : (
            <table className={tableClass}>
              <colgroup>
                <col className="w-[22%]" />
                <col className="w-[7%]" />
                <col className="w-[14%]" />
                <col className="w-[10%]" />
                <col className="w-[37%]" />
                {fieldsEditable ? <col className="w-[10%]" /> : null}
              </colgroup>
              <thead>
                <tr>
                  <th className={thClass}>Event</th>
                  <th className={cn(thClass, numericClass)}>Guests</th>
                  <th className={thClass}>Package</th>
                  <th className={cn(thClass, numericClass)}>Total Pay</th>
                  <th className={thClass}>Service Comments</th>
                  {fieldsEditable ? (
                    <th className={thClass} data-export-hide>
                      Actions
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {eventDrafts.map((event, index) => (
                  <tr key={event.id ?? `event-draft-${index}`}>
                    <td className={tdClass}>
                      {fieldsEditable ? (
                        <input
                          className={tableTextInputClass(fieldsEditable)}
                          value={event.event_name}
                          onChange={(e) =>
                            setEventDrafts((current) =>
                              current.map((row, i) =>
                                i === index
                                  ? { ...row, event_name: e.target.value }
                                  : row,
                              ),
                            )
                          }
                        />
                      ) : (
                        event.event_name
                      )}
                    </td>
                    <td className={cn(tdClass, numericClass)}>
                      {fieldsEditable ? (
                        <TableCellInputWrap>
                          <input
                            className={tableCompactInputClass(fieldsEditable)}
                            type="number"
                            min="0"
                            step="1"
                            inputMode="numeric"
                            value={event.guest_count}
                            onChange={(e) =>
                              setEventDrafts((current) =>
                                current.map((row, i) =>
                                  i === index
                                    ? { ...row, guest_count: e.target.value }
                                    : row,
                                ),
                              )
                            }
                          />
                        </TableCellInputWrap>
                      ) : (
                        event.guest_count
                      )}
                    </td>
                    <td className={tdClass}>
                      {fieldsEditable ? (
                        <input
                          className={tableTextInputClass(fieldsEditable)}
                          value={event.package_name}
                          onChange={(e) =>
                            setEventDrafts((current) =>
                              current.map((row, i) =>
                                i === index
                                  ? { ...row, package_name: e.target.value }
                                  : row,
                              ),
                            )
                          }
                        />
                      ) : (
                        event.package_name
                      )}
                    </td>
                    <td className={cn(tdClass, numericClass)}>
                      {fieldsEditable ? (
                        <TableCellInputWrap>
                          <input
                            className={tableNumericInputClass(fieldsEditable)}
                            type="number"
                            min="0"
                            step="0.01"
                            inputMode="decimal"
                            value={event.total_pay_gs}
                            onChange={(e) =>
                              setEventDrafts((current) =>
                                current.map((row, i) =>
                                  i === index
                                    ? { ...row, total_pay_gs: e.target.value }
                                    : row,
                                ),
                              )
                            }
                          />
                        </TableCellInputWrap>
                      ) : (
                        formatMoney(Number(event.total_pay_gs) || 0)
                      )}
                    </td>
                    <td className={tdClass}>
                      {fieldsEditable ? (
                        <input
                          className={tableTextInputClass(fieldsEditable)}
                          value={event.service_comments}
                          onChange={(e) =>
                            setEventDrafts((current) =>
                              current.map((row, i) =>
                                i === index
                                  ? { ...row, service_comments: e.target.value }
                                  : row,
                              ),
                            )
                          }
                        />
                      ) : (
                        event.service_comments
                      )}
                    </td>
                    {fieldsEditable ? (
                      <td className={tdClass} data-export-hide>
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => handleSaveEvent(index)}
                            className="rounded border border-black/10 px-2 py-0.5 text-[10px] hover:bg-black/[0.03]"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => handleRemoveEvent(index)}
                            className="rounded border border-red-200 px-2 py-0.5 text-[10px] text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-black/5 px-4 py-2">
          <h3 className={sectionTitleClass}>
            Discounts &amp; Complementaries — Detail
          </h3>
          {fieldsEditable ? (
            <button
              type="button"
              data-export-hide
              onClick={addLineDraft}
              className="inline-flex items-center gap-1 rounded-md border border-black/10 px-2 py-1 text-xs hover:bg-black/[0.03]"
            >
              <Plus className="h-3.5 w-3.5" />
              Add row
            </button>
          ) : null}
        </div>
        <div className="overflow-x-auto p-3">
          {lineDrafts.length === 0 ? (
            <p className="text-sm text-black/50">
              No detailed discount lines for {formatDisplayDate(selectedDate)}.
            </p>
          ) : (
            <table className={tableClass}>
              <colgroup>
                <col className="w-[8%]" />
                <col className="w-[10%]" />
                <col className="w-[16%]" />
                <col className="w-[46%]" />
                <col className="w-[10%]" />
                {fieldsEditable ? <col className="w-[10%]" /> : null}
              </colgroup>
              <thead>
                <tr>
                  <th className={thClass}>Table</th>
                  <th className={thClass}>Time</th>
                  <th className={thClass}>Guest</th>
                  <th className={thClass}>Reason</th>
                  <th className={cn(thClass, numericClass)}>Amount</th>
                  {fieldsEditable ? (
                    <th className={thClass} data-export-hide>
                      Actions
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {lineDrafts.map((line, index) => (
                  <tr key={line.id ?? `draft-${index}`}>
                    <td className={tdClass}>
                      {fieldsEditable ? (
                        <TableCellInputWrap>
                          <input
                            className={tableCompactInputClass(fieldsEditable)}
                            value={line.table_number}
                            onChange={(e) =>
                              setLineDrafts((current) =>
                                current.map((row, i) =>
                                  i === index
                                    ? { ...row, table_number: e.target.value }
                                    : row,
                                ),
                              )
                            }
                          />
                        </TableCellInputWrap>
                      ) : (
                        line.table_number
                      )}
                    </td>
                    <td className={tdClass}>
                      {fieldsEditable ? (
                        <input
                          className={tableTextInputClass(fieldsEditable)}
                          value={line.time_of_day}
                          onChange={(e) =>
                            setLineDrafts((current) =>
                              current.map((row, i) =>
                                i === index
                                  ? { ...row, time_of_day: e.target.value }
                                  : row,
                              ),
                            )
                          }
                        />
                      ) : (
                        line.time_of_day
                      )}
                    </td>
                    <td className={tdClass}>
                      {fieldsEditable ? (
                        <input
                          className={tableTextInputClass(fieldsEditable)}
                          value={line.guest_name}
                          onChange={(e) =>
                            setLineDrafts((current) =>
                              current.map((row, i) =>
                                i === index
                                  ? { ...row, guest_name: e.target.value }
                                  : row,
                              ),
                            )
                          }
                        />
                      ) : (
                        line.guest_name
                      )}
                    </td>
                    <td className={tdClass}>
                      {fieldsEditable ? (
                        <input
                          className={tableTextInputClass(fieldsEditable)}
                          value={line.reason}
                          onChange={(e) =>
                            setLineDrafts((current) =>
                              current.map((row, i) =>
                                i === index ? { ...row, reason: e.target.value } : row,
                              ),
                            )
                          }
                        />
                      ) : (
                        line.reason
                      )}
                    </td>
                    <td className={cn(tdClass, numericClass)}>
                      {fieldsEditable ? (
                        <TableCellInputWrap>
                          <input
                            className={tableNumericInputClass(fieldsEditable)}
                            type="number"
                            min="0"
                            step="0.01"
                            inputMode="decimal"
                            value={line.amount_gs}
                            onChange={(e) =>
                              setLineDrafts((current) =>
                                current.map((row, i) =>
                                  i === index
                                    ? { ...row, amount_gs: e.target.value }
                                    : row,
                                ),
                              )
                            }
                          />
                        </TableCellInputWrap>
                      ) : (
                        formatMoney(Number(line.amount_gs) || 0)
                      )}
                    </td>
                    {fieldsEditable ? (
                      <td className={tdClass} data-export-hide>
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => handleSaveLine(index)}
                            className="rounded border border-black/10 px-2 py-0.5 text-[10px] hover:bg-black/[0.03]"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => handleRemoveLine(index)}
                            className="rounded border border-red-200 px-2 py-0.5 text-[10px] text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  );
}
