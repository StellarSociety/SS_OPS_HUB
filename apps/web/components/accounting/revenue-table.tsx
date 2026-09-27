"use client";

import { useMemo, useState } from "react";
import { DateInput } from "@/components/ui/date-input";
import type { AccountingRevenueDay } from "@/lib/accounting/revenue-from-sales";
import { formatDisplayDate } from "@/lib/dates/display";
import {
  formatIsoWeekLabel,
  formatMoney,
  getCurrentMonthKey,
  getIsoWeekParts,
} from "@/lib/sales/daily-sales-calculations";
import type { TaxSettingsInput } from "@/lib/sales/daily-sales-types";
import {
  buildSalesTableWeekOptions,
  getCurrentWeekFilterKey,
  getDatesInMonth,
} from "@/lib/sales/sales-data-table-dates";
import {
  salesTableFilterButtonClass,
  salesTableFilterClearButtonClass,
  salesTableFilterControlClass,
  salesTableFilterFieldClass,
} from "@/lib/sales/sales-data-table-ui";
import { cn } from "@/lib/utils";

type RevenueTableProps = {
  days: AccountingRevenueDay[];
  taxSettings: TaxSettingsInput;
};

const GROSS_COLUMNS = [
  { key: "foodGs", label: "Food" },
  { key: "beveragesGs", label: "Beverages" },
  { key: "wineGs", label: "Wine" },
  { key: "shishaGs", label: "Shisha" },
  { key: "tobaccoGs", label: "Tobacco" },
  { key: "othersGs", label: "Others" },
  { key: "serviceFeesGs", label: "Service Fees" },
  { key: "dailyTotalGs", label: "Daily Total" },
] as const;

const TAX_COLUMNS = [
  { key: "municipalityGs", label: "Municipality" },
  { key: "vatGs", label: "VAT" },
  { key: "vatOnServiceChargeGs", label: "VAT on service" },
] as const;

const TRAILING_COLUMNS = [
  { key: "serviceChargeGs", label: "Service Charge" },
  { key: "netRevenueGs", label: "Net Revenue" },
] as const;

const AMOUNT_COLUMNS = [
  ...GROSS_COLUMNS,
  ...TAX_COLUMNS,
  ...TRAILING_COLUMNS,
] as const;

function formatRate(pct: number): string {
  const rounded = Number(pct.toFixed(3));
  return `${rounded}%`;
}

function formatContribution(value: number, total: number): string {
  if (!total) return "0%";
  return `${Number(((value / total) * 100).toFixed(1))}%`;
}

function getTaxTotal(
  row: Pick<
    AccountingRevenueDay,
    "municipalityGs" | "vatGs" | "vatOnServiceChargeGs"
  >,
) {
  return row.municipalityGs + row.vatGs + row.vatOnServiceChargeGs;
}

type AmountKey = (typeof AMOUNT_COLUMNS)[number]["key"];

export function RevenueTable({ days, taxSettings }: RevenueTableProps) {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [weekFilter, setWeekFilter] = useState(getCurrentWeekFilterKey);

  const weekOptions = useMemo(
    () =>
      buildSalesTableWeekOptions(
        days.map((day) => day.saleDate),
        formatIsoWeekLabel,
        getIsoWeekParts,
      ),
    [days],
  );

  const filtered = useMemo(() => {
    return days.filter((day) => {
      if (weekFilter) {
        const { week, year } = getIsoWeekParts(day.saleDate);
        const key = `${year}-W${String(week).padStart(2, "0")}`;
        return key === weekFilter;
      }
      if (fromDate && day.saleDate < fromDate) return false;
      if (toDate && day.saleDate > toDate) return false;
      return true;
    });
  }, [days, fromDate, toDate, weekFilter]);

  const totals = useMemo(() => {
    const sums = Object.fromEntries(
      AMOUNT_COLUMNS.map((column) => [column.key, 0]),
    ) as Record<AmountKey, number>;
    for (const day of filtered) {
      for (const column of AMOUNT_COLUMNS) {
        sums[column.key] += day[column.key];
      }
    }
    return sums;
  }, [filtered]);

  const totalTax =
    totals.municipalityGs + totals.vatGs + totals.vatOnServiceChargeGs;
  const totalTaxRate =
    taxSettings.municipality_fee_pct +
    taxSettings.vat_pct +
    (taxSettings.service_charge_pct *
      taxSettings.vat_on_service_charge_pct) /
      100;

  function setFrom(value: string) {
    setFromDate(value);
    setWeekFilter("");
  }

  function setTo(value: string) {
    setToDate(value);
    setWeekFilter("");
  }

  function applyThisWeek() {
    setFromDate("");
    setToDate("");
    setWeekFilter(getCurrentWeekFilterKey());
  }

  function applyThisMonth() {
    const dates = getDatesInMonth(getCurrentMonthKey());
    setWeekFilter("");
    setFromDate(dates[0] ?? "");
    setToDate(dates[dates.length - 1] ?? "");
  }

  function clearFilters() {
    setFromDate("");
    setToDate("");
    setWeekFilter("");
  }

  return (
    <div className="w-full space-y-4">
      <div className="rounded-xl border border-black/10 bg-white/80 p-3">
        <div className="flex min-w-0 flex-nowrap items-end gap-2 overflow-x-auto">
          <label className={salesTableFilterFieldClass()}>
            <span className="text-black/60">From date</span>
            <DateInput
              value={fromDate}
              onChange={setFrom}
              aria-label="From date"
              className={salesTableFilterControlClass()}
              inputClassName="h-9"
            />
          </label>
          <label className={salesTableFilterFieldClass()}>
            <span className="text-black/60">To date</span>
            <DateInput
              value={toDate}
              onChange={setTo}
              aria-label="To date"
              className={salesTableFilterControlClass()}
              inputClassName="h-9"
            />
          </label>
          <label className={salesTableFilterFieldClass()}>
            <span className="text-black/60">Week number</span>
            <select
              value={weekFilter}
              onChange={(event) => {
                setWeekFilter(event.target.value);
                setFromDate("");
                setToDate("");
              }}
              className={`${salesTableFilterControlClass()} rounded-md border border-black/10 bg-white px-2 text-sm text-[#3D421F]`}
            >
              <option value="">All weeks</option>
              {weekOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={applyThisWeek}
            className={salesTableFilterButtonClass()}
          >
            This week
          </button>
          <button
            type="button"
            onClick={applyThisMonth}
            className={salesTableFilterButtonClass()}
          >
            This month
          </button>
          <button
            type="button"
            onClick={clearFilters}
            className={salesTableFilterClearButtonClass()}
          >
            Clear
          </button>
        </div>
      </div>

      <p className="text-sm text-black/55">
        Gross sales (GS) from Daily Sales, lunch and dinner combined. Service
        fees include every service-fee line. Tax is municipality fee, VAT, and
        VAT on the service charge. Service charge is calculated on net revenue,
        and VAT on service is that percentage of the service charge. These
        daily totals are the receivables and income on Cash Flow.
      </p>

      <div className="overflow-x-auto rounded-xl border border-black/10 bg-white">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-black/10 bg-[var(--venue-secondary,#F0F3DD)] text-left text-xs font-semibold uppercase tracking-[0.06em] text-[#3D421F]">
              <th
                rowSpan={2}
                className="sticky left-0 z-10 bg-[var(--venue-secondary,#F0F3DD)] px-2 py-2.5 align-bottom"
              >
                Date
              </th>
              <th rowSpan={2} className="px-2 py-2.5 align-bottom">
                Day
              </th>
              {GROSS_COLUMNS.map((column) => (
                <th
                  key={column.key}
                  rowSpan={2}
                  className={cn(
                    "px-2 py-2.5 text-right align-bottom",
                    column.key === "dailyTotalGs" && "text-[#3D421F]",
                  )}
                >
                  <span className="block">{column.label}</span>
                  <span className="mt-0.5 block text-[10px] font-medium normal-case tracking-normal text-black/50">
                    {formatContribution(
                      totals[column.key],
                      totals.dailyTotalGs,
                    )}
                  </span>
                </th>
              ))}
              <th
                rowSpan={2}
                className="border-l border-black/10 px-2 py-2.5 text-right align-bottom"
              >
                <span className="block">Service Charge</span>
                <span className="mt-0.5 block text-[10px] font-medium normal-case tracking-normal text-black/50">
                  {formatRate(taxSettings.service_charge_pct)}
                </span>
              </th>
              <th
                colSpan={TAX_COLUMNS.length + 1}
                className="border-l border-black/10 px-2 py-2 text-center"
              >
                Tax
              </th>
              <th
                rowSpan={2}
                className="px-2 py-2.5 text-right align-bottom text-[#3D421F]"
              >
                Net Revenue
              </th>
            </tr>
            <tr className="border-b border-black/10 bg-[var(--venue-secondary,#F0F3DD)] text-right text-[10px] font-semibold uppercase tracking-[0.06em] text-[#3D421F]">
              <th className="border-l border-black/10 px-2 py-2">
                <span className="block">Municipality</span>
                <span className="mt-0.5 block font-medium normal-case tracking-normal text-black/50">
                  {formatRate(taxSettings.municipality_fee_pct)}
                </span>
              </th>
              <th className="px-2 py-2">
                <span className="block">VAT</span>
                <span className="mt-0.5 block font-medium normal-case tracking-normal text-black/50">
                  {formatRate(taxSettings.vat_pct)}
                </span>
              </th>
              <th className="px-2 py-2">
                <span className="block">VAT on service</span>
                <span className="mt-0.5 block font-medium normal-case tracking-normal text-black/50">
                  {formatRate(taxSettings.vat_on_service_charge_pct)} of service
                  charge
                </span>
              </th>
              <th className="px-2 py-2">
                <span className="block">Total Tax</span>
                <span className="mt-0.5 block font-medium normal-case tracking-normal text-black/50">
                  {formatRate(totalTaxRate)}
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={3 + AMOUNT_COLUMNS.length}
                  className="px-2 py-10 text-center text-sm text-black/45"
                >
                  No daily sales in this period.
                </td>
              </tr>
            ) : (
              filtered.map((day) => (
                <tr
                  key={day.saleDate}
                  className="border-b border-black/5 last:border-b-0"
                >
                  <td className="sticky left-0 z-10 bg-white px-2 py-2 font-medium tabular-nums text-[#3D421F]">
                    {formatDisplayDate(day.saleDate)}
                  </td>
                  <td className="px-2 py-2 text-xs font-medium text-black/60">
                    {day.weekDay}
                  </td>
                  {GROSS_COLUMNS.map((column) => (
                    <td
                      key={column.key}
                      className={cn(
                        "px-2 py-2 text-right tabular-nums text-black/80",
                        column.key === "dailyTotalGs" &&
                          "font-semibold text-[#3D421F]",
                      )}
                    >
                      {formatMoney(day[column.key])}
                    </td>
                  ))}
                  <td className="border-l border-black/5 px-2 py-2 text-right tabular-nums text-black/80">
                    {formatMoney(day.serviceChargeGs)}
                  </td>
                  {TAX_COLUMNS.map((column) => (
                    <td
                      key={column.key}
                      className="bg-black/[0.035] px-2 py-2 text-right tabular-nums text-black/80"
                    >
                      {formatMoney(day[column.key])}
                    </td>
                  ))}
                  <td className="bg-black/[0.06] px-2 py-2 text-right font-semibold tabular-nums text-[#3D421F]">
                    {formatMoney(getTaxTotal(day))}
                  </td>
                  <td className="px-2 py-2 text-right font-semibold tabular-nums text-[#3D421F]">
                    {formatMoney(day.netRevenueGs)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {filtered.length > 0 ? (
            <tfoot>
              <tr className="border-t border-black/10 bg-[#E2E8C8] font-semibold text-[#3D421F]">
                <td className="sticky left-0 z-10 bg-[#E2E8C8] px-2 py-2.5">
                  Total
                </td>
                <td className="px-2 py-2.5 text-xs font-medium text-black/60">
                  {filtered.length} {filtered.length === 1 ? "day" : "days"}
                </td>
                {GROSS_COLUMNS.map((column) => (
                  <td
                    key={column.key}
                    className="px-2 py-2.5 text-right tabular-nums"
                  >
                    {formatMoney(totals[column.key])}
                  </td>
                ))}
                <td className="border-l border-black/5 px-2 py-2.5 text-right tabular-nums">
                  {formatMoney(totals.serviceChargeGs)}
                </td>
                {TAX_COLUMNS.map((column) => (
                  <td
                    key={column.key}
                    className="bg-black/[0.035] px-2 py-2.5 text-right tabular-nums"
                  >
                    {formatMoney(totals[column.key])}
                  </td>
                ))}
                <td className="bg-black/[0.06] px-2 py-2.5 text-right font-bold tabular-nums">
                  {formatMoney(totalTax)}
                </td>
                <td className="px-2 py-2.5 text-right tabular-nums">
                  {formatMoney(totals.netRevenueGs)}
                </td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  );
}
