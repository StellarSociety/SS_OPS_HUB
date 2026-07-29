"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Download } from "lucide-react";
import { ScopedLink as Link } from "@/components/layout/scoped-link";
import { GratuityByWaiterReportExportDialog } from "@/components/sales/gratuity-by-waiter-report-export-dialog";
import { formatDisplayDate } from "@/lib/dates/display";
import {
  formatMoney,
  formatMonthLabel,
  getCurrentMonthKey,
} from "@/lib/sales/daily-sales-calculations";
import {
  buildGratuityByWaiterReportMonth,
  GRATUITY_BY_WAITER_ALL,
  listGratuityByWaiterOptions,
} from "@/lib/sales/gratuity-by-waiter-report";
import {
  defaultGratuityReportMonth,
  listGratuityReportMonths,
} from "@/lib/sales/gratuity-report";
import type { VenueWaiterGratuityRow } from "@/lib/sales/waiter-sales-store";

const selectClass =
  "h-10 rounded-lg border border-black/10 bg-white px-3 text-sm text-[#3D421F] outline-none transition focus:border-[var(--venue-primary,#818a40)]/50 focus:ring-2 focus:ring-[var(--venue-primary,#818a40)]/20";

type GratuityByWaiterReportPreviewProps = {
  venueName: string;
  venueLogoUrl?: string | null;
  userDisplayName: string;
  waiterRecords: VenueWaiterGratuityRow[];
};

export function GratuityByWaiterReportPreview({
  venueName,
  venueLogoUrl,
  userDisplayName,
  waiterRecords,
}: GratuityByWaiterReportPreviewProps) {
  const monthOptions = useMemo(() => {
    return listGratuityReportMonths(waiterRecords).map((monthKey) => ({
      value: monthKey,
      label: formatMonthLabel(monthKey),
    }));
  }, [waiterRecords]);

  const [monthKey, setMonthKey] = useState(() =>
    defaultGratuityReportMonth(monthOptions.map((option) => option.value)),
  );
  const [waiterId, setWaiterId] = useState(GRATUITY_BY_WAITER_ALL);
  const [exportOpen, setExportOpen] = useState(false);

  const waiterOptions = useMemo(
    () => listGratuityByWaiterOptions(waiterRecords, monthKey),
    [waiterRecords, monthKey],
  );

  useEffect(() => {
    if (
      monthKey &&
      !monthOptions.some((option) => option.value === monthKey)
    ) {
      setMonthKey(
        defaultGratuityReportMonth(monthOptions.map((option) => option.value)),
      );
    }
  }, [monthKey, monthOptions]);

  useEffect(() => {
    if (waiterId === GRATUITY_BY_WAITER_ALL) return;
    if (!waiterOptions.some((option) => option.id === waiterId)) {
      setWaiterId(GRATUITY_BY_WAITER_ALL);
    }
  }, [waiterId, waiterOptions]);

  const report = useMemo(
    () =>
      buildGratuityByWaiterReportMonth(waiterRecords, monthKey, {
        waiterId,
      }),
    [waiterRecords, monthKey, waiterId],
  );

  const selectedWaiterName =
    waiterId === GRATUITY_BY_WAITER_ALL
      ? null
      : (waiterOptions.find((option) => option.id === waiterId)?.name ?? null);

  return (
    <>
      <div className="mx-auto w-full max-w-none space-y-6">
        <div>
          <Link
            href="/sales/reports"
            className="inline-flex items-center gap-1.5 text-sm text-black/55 transition-colors hover:text-[#3D421F]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Reports
          </Link>
          <h1 className="mt-2 font-serif text-2xl text-[#3D421F] md:text-3xl">
            Monthly gratuity by waiter
          </h1>
          <p className="mt-1 text-sm text-black/60">
            Cash and credit card gratuity by waiter for every day · {venueName}
          </p>
          <hr className="mt-4 border-black/10" />
        </div>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-black/50">
                Month
              </span>
              <select
                className={selectClass}
                value={monthKey}
                onChange={(event) => setMonthKey(event.target.value)}
              >
                {monthOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-black/50">
                Waiter
              </span>
              <select
                className={`${selectClass} min-w-[12rem]`}
                value={waiterId}
                onChange={(event) => setWaiterId(event.target.value)}
              >
                <option value={GRATUITY_BY_WAITER_ALL}>All waiters</option>
                {waiterOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => setMonthKey(getCurrentMonthKey())}
              className="h-10 rounded-lg border border-black/10 bg-white px-3 text-sm font-medium text-[#3D421F] hover:bg-black/[0.03]"
            >
              This month
            </button>
          </div>

          <button
            type="button"
            onClick={() => setExportOpen(true)}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[var(--venue-primary,#818a40)] px-4 text-sm font-medium text-white hover:opacity-90"
          >
            <Download className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            Export
          </button>
        </div>

        <dl className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-black/10 bg-white/60 px-4 py-3 text-center">
            <dt className="text-xs font-medium uppercase tracking-wide text-black/45">
              Cash
            </dt>
            <dd className="mt-1 font-serif text-xl tabular-nums text-[#3D421F]">
              {formatMoney(report.summary.cashGs)}
            </dd>
          </div>
          <div className="rounded-xl border border-black/10 bg-white/60 px-4 py-3 text-center">
            <dt className="text-xs font-medium uppercase tracking-wide text-black/45">
              Credit card
            </dt>
            <dd className="mt-1 font-serif text-xl tabular-nums text-[#3D421F]">
              {formatMoney(report.summary.ccGs)}
            </dd>
          </div>
          <div className="rounded-xl border border-black/10 bg-white/60 px-4 py-3 text-center">
            <dt className="text-xs font-medium uppercase tracking-wide text-black/45">
              Total · {report.monthLabel}
              {selectedWaiterName ? ` · ${selectedWaiterName}` : ""}
            </dt>
            <dd className="mt-1 font-serif text-xl tabular-nums text-[#3D421F]">
              {formatMoney(report.summary.totalGs)}
            </dd>
          </div>
        </dl>

        <div className="overflow-x-auto rounded-xl border border-black/10 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[var(--venue-secondary,#F0F3DD)]/70 text-xs uppercase tracking-wide text-black/50">
              <tr>
                <th className="px-3 py-2.5 font-medium">Date</th>
                <th className="px-3 py-2.5 font-medium">Day</th>
                <th className="px-3 py-2.5 font-medium">Waiter</th>
                <th className="px-3 py-2.5 text-right font-medium">Cash</th>
                <th className="px-3 py-2.5 text-right font-medium">
                  Credit card
                </th>
                <th className="px-3 py-2.5 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {report.rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-8 text-center text-sm text-black/50"
                  >
                    {selectedWaiterName
                      ? `No gratuity recorded for ${selectedWaiterName} in ${report.monthLabel}.`
                      : `No gratuity recorded in ${report.monthLabel}.`}
                  </td>
                </tr>
              ) : (
                report.rows.map((day) => {
                  if (!day.hasActivity || day.contributors.length === 0) {
                    return (
                      <tr
                        key={day.saleDate}
                        className="bg-black/[0.015] text-black/40"
                      >
                        <td className="px-3 py-2.5 tabular-nums">
                          {formatDisplayDate(day.saleDate)}
                        </td>
                        <td className="px-3 py-2.5">{day.weekDay}</td>
                        <td className="px-3 py-2.5">—</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {formatMoney(0)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {formatMoney(0)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {formatMoney(0)}
                        </td>
                      </tr>
                    );
                  }

                  const showDayTotal = day.contributors.length > 1;

                  return (
                    <Fragment key={day.saleDate}>
                      {day.contributors.map((contributor) => (
                        <tr key={`${day.saleDate}-${contributor.waiterId}`}>
                          <td className="px-3 py-2.5 tabular-nums text-[#3D421F]">
                            {formatDisplayDate(day.saleDate)}
                          </td>
                          <td className="px-3 py-2.5">{day.weekDay}</td>
                          <td className="px-3 py-2.5 font-medium text-[#3D421F]">
                            {contributor.waiterName}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            {formatMoney(contributor.cashGs)}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            {formatMoney(contributor.ccGs)}
                          </td>
                          <td className="px-3 py-2.5 text-right font-medium tabular-nums text-[#3D421F]">
                            {formatMoney(contributor.totalGs)}
                          </td>
                        </tr>
                      ))}
                      {showDayTotal ? (
                        <tr className="bg-[var(--venue-secondary,#F0F3DD)]/35 text-[#3D421F]">
                          <td className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-black/45">
                            {formatDisplayDate(day.saleDate)}
                          </td>
                          <td className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-black/45">
                            Day total
                          </td>
                          <td className="px-3 py-2 text-xs font-medium text-black/45">
                            {day.contributors.length} waiters
                          </td>
                          <td className="px-3 py-2 text-right text-sm font-semibold tabular-nums">
                            {formatMoney(day.cashGs)}
                          </td>
                          <td className="px-3 py-2 text-right text-sm font-semibold tabular-nums">
                            {formatMoney(day.ccGs)}
                          </td>
                          <td className="px-3 py-2 text-right text-sm font-semibold tabular-nums">
                            {formatMoney(day.totalGs)}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })
              )}
            </tbody>
            {report.rows.length > 0 ? (
              <tfoot>
                <tr className="border-t border-black/10 bg-[var(--venue-secondary,#F0F3DD)]/50 font-semibold text-[#3D421F]">
                  <td className="px-3 py-3">Month total</td>
                  <td className="px-3 py-3 text-sm font-medium text-black/55">
                    {report.summary.activeDayCount} day
                    {report.summary.activeDayCount === 1 ? "" : "s"}
                  </td>
                  <td className="px-3 py-3 text-sm font-medium text-black/55">
                    {report.summary.contributorCount} waiter
                    {report.summary.contributorCount === 1 ? "" : "s"}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {formatMoney(report.summary.cashGs)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {formatMoney(report.summary.ccGs)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {formatMoney(report.summary.totalGs)}
                  </td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </div>

      <GratuityByWaiterReportExportDialog
        open={exportOpen}
        venueName={venueName}
        venueLogoUrl={venueLogoUrl}
        userDisplayName={userDisplayName}
        report={report}
        waiterId={waiterId}
        onClose={() => setExportOpen(false)}
      />
    </>
  );
}
