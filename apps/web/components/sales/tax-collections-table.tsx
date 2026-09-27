"use client";

import { useMemo, useState } from "react";
import { DateInput } from "@/components/ui/date-input";
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
import type { TaxCollectionDay } from "@/lib/sales/tax-collections";
import { cn } from "@/lib/utils";

type TaxCollectionsTableProps = {
  days: TaxCollectionDay[];
  taxSettings: TaxSettingsInput;
};

const TAX_COLUMNS = [
  { key: "municipalityGs", label: "Municipality", rate: "municipality" },
  { key: "vatGs", label: "VAT", rate: "vat" },
  {
    key: "vatOnServiceChargeGs",
    label: "VAT on service",
    rate: "vatOnService",
  },
  { key: "taxTotalGs", label: "Total", rate: "taxTotal" },
] as const;

const AMOUNT_COLUMNS = [
  ...TAX_COLUMNS,
  { key: "serviceChargeGs", label: "Service Charge" },
  { key: "totalCollectedGs", label: "Total collected" },
] as const;

type AmountKey = (typeof AMOUNT_COLUMNS)[number]["key"];

function formatRate(pct: number): string {
  return `${Number(pct.toFixed(3))}%`;
}

export function TaxCollectionsTable({
  days,
  taxSettings,
}: TaxCollectionsTableProps) {
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
    for (const column of AMOUNT_COLUMNS) {
      sums[column.key] = Math.round(sums[column.key] * 100) / 100;
    }
    return sums;
  }, [filtered]);

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

  const rateLabel = {
    municipality: formatRate(taxSettings.municipality_fee_pct),
    vat: formatRate(taxSettings.vat_pct),
    vatOnService: `${formatRate(taxSettings.vat_on_service_charge_pct)} of service charge`,
    taxTotal: "Excl. service charge",
  };

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
        Amounts entered on Daily Sales tax collection. Municipality and
        service charge are stored as entered. VAT is stored as one amount,
        including VAT on the service charge, and is split here with the venue
        rates so the two VAT columns add back to what was entered.
      </p>

      <div className="overflow-x-auto rounded-xl border border-black/10 bg-white">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-black/10 bg-[var(--venue-secondary,#F0F3DD)] text-left text-xs font-semibold uppercase tracking-[0.06em] text-[#3D421F]">
              <th
                rowSpan={2}
                className="sticky left-0 z-10 bg-[var(--venue-secondary,#F0F3DD)] px-3 py-2.5 align-bottom"
              >
                Date
              </th>
              <th rowSpan={2} className="px-3 py-2.5 align-bottom">
                Day
              </th>
              <th
                colSpan={TAX_COLUMNS.length}
                className="border-l border-black/10 px-3 py-2 text-center"
              >
                Tax
              </th>
              <th
                rowSpan={2}
                className="border-l border-black/10 px-3 py-2.5 text-right align-bottom"
              >
                <span className="block">Service Charge</span>
                <span className="mt-0.5 block text-[10px] font-medium normal-case tracking-normal text-black/50">
                  {formatRate(taxSettings.service_charge_pct)}
                </span>
              </th>
              <th
                rowSpan={2}
                className="px-3 py-2.5 text-right align-bottom text-[#3D421F]"
              >
                Total collected
              </th>
            </tr>
            <tr className="border-b border-black/10 bg-[var(--venue-secondary,#F0F3DD)] text-right text-[10px] font-semibold uppercase tracking-[0.06em] text-[#3D421F]">
              {TAX_COLUMNS.map((column) => (
                <th
                  key={column.key}
                  className={cn(
                    "px-3 py-2",
                    column.key === "municipalityGs" && "border-l border-black/10",
                  )}
                >
                  <span className="block">{column.label}</span>
                  <span className="mt-0.5 block font-medium normal-case tracking-normal text-black/50">
                    {rateLabel[column.rate]}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={2 + AMOUNT_COLUMNS.length}
                  className="px-3 py-10 text-center text-sm text-black/45"
                >
                  No tax collections in this period.
                </td>
              </tr>
            ) : (
              filtered.map((day) => (
                <tr
                  key={day.saleDate}
                  className="border-b border-black/5 last:border-b-0"
                >
                  <td className="sticky left-0 z-10 bg-white px-3 py-2 font-medium tabular-nums text-[#3D421F]">
                    {formatDisplayDate(day.saleDate)}
                  </td>
                  <td className="px-3 py-2 text-xs font-medium text-black/60">
                    {day.weekDay}
                  </td>
                  {AMOUNT_COLUMNS.map((column) => (
                    <td
                      key={column.key}
                      className={cn(
                        "px-3 py-2 text-right tabular-nums text-black/80",
                        column.key === "municipalityGs" &&
                          "border-l border-black/5",
                        column.key === "taxTotalGs" &&
                          "font-semibold text-[#3D421F]",
                        column.key === "serviceChargeGs" &&
                          "border-l border-black/5",
                        column.key === "totalCollectedGs" &&
                          "font-semibold text-[#3D421F]",
                      )}
                    >
                      {formatMoney(day[column.key])}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
          {filtered.length > 0 ? (
            <tfoot>
              <tr className="border-t border-black/10 bg-[#E2E8C8] font-semibold text-[#3D421F]">
                <td className="sticky left-0 z-10 bg-[#E2E8C8] px-3 py-2.5">
                  Total
                </td>
                <td className="px-3 py-2.5 text-xs font-medium text-black/60">
                  {filtered.length} {filtered.length === 1 ? "day" : "days"}
                </td>
                {AMOUNT_COLUMNS.map((column) => (
                  <td
                    key={column.key}
                    className="px-3 py-2.5 text-right tabular-nums"
                  >
                    {formatMoney(totals[column.key])}
                  </td>
                ))}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  );
}
