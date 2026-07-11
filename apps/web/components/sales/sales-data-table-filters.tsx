"use client";

import { SalesDateInput } from "@/components/sales/sales-date-input";
import {
  salesTableFilterButtonClass,
  salesTableFilterClearButtonClass,
  salesTableFilterControlClass,
  salesTableFilterFieldClass,
} from "@/lib/sales/sales-data-table-ui";

type Option = { value: string; label: string };

type SalesDataTableFiltersProps = {
  fromDate: string;
  toDate: string;
  weekFilter: string;
  monthFilter: string;
  weekOptions: Option[];
  monthOptions: Option[];
  onFromDateChange: (value: string) => void;
  onToDateChange: (value: string) => void;
  onWeekFilterChange: (value: string) => void;
  onMonthFilterChange: (value: string) => void;
  onThisWeek: () => void;
  onThisMonth: () => void;
  onThisYear: () => void;
  onClear: () => void;
};

export function SalesDataTableFilters({
  fromDate,
  toDate,
  weekFilter,
  monthFilter,
  weekOptions,
  monthOptions,
  onFromDateChange,
  onToDateChange,
  onWeekFilterChange,
  onMonthFilterChange,
  onThisWeek,
  onThisMonth,
  onThisYear,
  onClear,
}: SalesDataTableFiltersProps) {
  return (
    <div className="rounded-xl border border-black/10 bg-white/80 p-3">
      <div className="flex min-w-0 flex-nowrap items-end gap-2 overflow-x-auto">
        <label className={salesTableFilterFieldClass()}>
          <span className="text-black/60">From date</span>
          <SalesDateInput
            value={fromDate}
            onChange={onFromDateChange}
            className={salesTableFilterControlClass()}
          />
        </label>
        <label className={salesTableFilterFieldClass()}>
          <span className="text-black/60">To date</span>
          <SalesDateInput
            value={toDate}
            onChange={onToDateChange}
            className={salesTableFilterControlClass()}
          />
        </label>
        <label className={salesTableFilterFieldClass()}>
          <span className="text-black/60">Week number</span>
          <select
            value={weekFilter}
            onChange={(e) => onWeekFilterChange(e.target.value)}
            className={`${salesTableFilterControlClass()} rounded-md border border-black/10 bg-white px-2 text-sm text-[#3D421F]`}
          >
            <option value="">All weeks</option>
            {weekOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className={salesTableFilterFieldClass()}>
          <span className="text-black/60">Month</span>
          <select
            value={monthFilter}
            onChange={(e) => onMonthFilterChange(e.target.value)}
            className={`${salesTableFilterControlClass()} rounded-md border border-black/10 bg-white px-2 text-sm text-[#3D421F]`}
          >
            <option value="">All months</option>
            {monthOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={onThisWeek} className={salesTableFilterButtonClass()}>
          This week
        </button>
        <button type="button" onClick={onThisMonth} className={salesTableFilterButtonClass()}>
          This month
        </button>
        <button type="button" onClick={onThisYear} className={salesTableFilterButtonClass()}>
          This year
        </button>
        <button type="button" onClick={onClear} className={salesTableFilterClearButtonClass()}>
          Clear
        </button>
      </div>
    </div>
  );
}
