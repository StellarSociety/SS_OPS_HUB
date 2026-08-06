"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Download } from "lucide-react";
import { ScopedLink as Link } from "@/components/layout/scoped-link";
import { CashSalesReportExportDialog } from "@/components/sales/cash-sales-report-export-dialog";
import { formatDisplayDate } from "@/lib/dates/display";
import {
  formatMoney,
  formatMonthLabel,
  getCurrentMonthKey,
} from "@/lib/sales/daily-sales-calculations";
import {
  buildCashSalesReportMonth,
  defaultCashSalesReportMonth,
  listCashSalesReportMonths,
  type CashSalesRecord,
} from "@/lib/sales/cash-sales-report";
import { cn } from "@/lib/utils";

const selectClass =
  "h-10 rounded-lg border border-black/10 bg-white px-3 text-sm text-[#3D421F] outline-none transition focus:border-[var(--venue-primary,#818a40)]/50 focus:ring-2 focus:ring-[var(--venue-primary,#818a40)]/20";

type CashSalesReportPreviewProps = {
  venueName: string;
  venueLogoUrl?: string | null;
  userDisplayName: string;
  records: CashSalesRecord[];
};

export function CashSalesReportPreview({
  venueName,
  venueLogoUrl,
  userDisplayName,
  records,
}: CashSalesReportPreviewProps) {
  const monthOptions = useMemo(() => {
    return listCashSalesReportMonths(records).map((monthKey) => ({
      value: monthKey,
      label: formatMonthLabel(monthKey),
    }));
  }, [records]);

  const [monthKey, setMonthKey] = useState(() =>
    defaultCashSalesReportMonth(monthOptions.map((option) => option.value)),
  );
  const [exportOpen, setExportOpen] = useState(false);

  useEffect(() => {
    if (
      monthKey &&
      !monthOptions.some((option) => option.value === monthKey)
    ) {
      setMonthKey(
        defaultCashSalesReportMonth(monthOptions.map((option) => option.value)),
      );
    }
  }, [monthKey, monthOptions]);

  const report = useMemo(
    () => buildCashSalesReportMonth(records, monthKey),
    [records, monthKey],
  );

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
            Monthly cash sales
          </h1>
          <p className="mt-1 text-sm text-black/60">
            Cash tender totals for every day · {venueName}
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

        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-black/10 bg-white/60 px-4 py-3 text-center">
            <dt className="text-xs font-medium uppercase tracking-wide text-black/45">
              Active days
            </dt>
            <dd className="mt-1 font-serif text-xl tabular-nums text-[#3D421F]">
              {report.summary.activeDayCount}
            </dd>
          </div>
          <div className="rounded-xl border border-black/10 bg-white/60 px-4 py-3 text-center">
            <dt className="text-xs font-medium uppercase tracking-wide text-black/45">
              Cash sales · {report.monthLabel}
            </dt>
            <dd className="mt-1 font-serif text-xl tabular-nums text-[#3D421F]">
              {formatMoney(report.summary.cashGs)}
            </dd>
          </div>
        </dl>

        <div className="w-fit max-w-full overflow-x-auto rounded-xl border border-black/10 bg-white">
          <table className="w-auto text-left text-sm">
            <thead className="bg-[var(--venue-secondary,#F0F3DD)]/70 text-xs uppercase tracking-wide text-black/50">
              <tr>
                <th className="whitespace-nowrap px-3 py-2.5 font-medium">
                  Date
                </th>
                <th className="whitespace-nowrap px-3 py-2.5 font-medium">
                  Day
                </th>
                <th className="whitespace-nowrap px-3 py-2.5 text-right font-medium">
                  Cash sales
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {report.rows.map((row) => (
                <tr
                  key={row.saleDate}
                  className={cn(
                    !row.hasActivity && "bg-black/[0.015] text-black/40",
                  )}
                >
                  <td className="px-3 py-2.5 tabular-nums text-[#3D421F]">
                    {formatDisplayDate(row.saleDate)}
                  </td>
                  <td className="px-3 py-2.5">{row.weekDay}</td>
                  <td className="px-3 py-2.5 text-right font-medium tabular-nums text-[#3D421F]">
                    {formatMoney(row.cashGs)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-black/10 bg-[var(--venue-secondary,#F0F3DD)]/50 font-semibold text-[#3D421F]">
                <td className="px-3 py-3">Month total</td>
                <td className="px-3 py-3 text-sm font-medium text-black/55">
                  {report.summary.activeDayCount} day
                  {report.summary.activeDayCount === 1 ? "" : "s"}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {formatMoney(report.summary.cashGs)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <CashSalesReportExportDialog
        open={exportOpen}
        venueName={venueName}
        venueLogoUrl={venueLogoUrl}
        userDisplayName={userDisplayName}
        report={report}
        onClose={() => setExportOpen(false)}
      />
    </>
  );
}
