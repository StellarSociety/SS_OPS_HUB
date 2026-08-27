"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { daysInMonth, MONTH_DAY_MONTHS } from "@/lib/guests-intel/types";
import { cn } from "@/lib/utils";

const selectClass =
  "flex h-10 w-full rounded-md border border-black/10 bg-white px-3 text-[16px] text-[#3D421F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#818a40] disabled:opacity-50 md:text-sm";

type MonthDayInputProps = {
  id: string;
  name?: string;
  disabled?: boolean;
};

export function MonthDayInput({
  id,
  name = "birth_anniversary",
  disabled,
}: MonthDayInputProps) {
  const [month, setMonth] = useState("");
  const [day, setDay] = useState("");

  const maxDay = month ? daysInMonth(Number(month)) : 31;
  const dayOptions = useMemo(
    () => Array.from({ length: maxDay }, (_, index) => index + 1),
    [maxDay],
  );

  const value =
    month && day && Number(day) <= maxDay
      ? `${month}-${day.padStart(2, "0")}`
      : "";

  return (
    <div className="grid grid-cols-2 gap-2">
      <input type="hidden" name={name} value={value} />
      <select
        id={`${id}-day`}
        className={cn(selectClass)}
        disabled={disabled}
        value={day}
        aria-label="Day"
        onChange={(event) => setDay(event.target.value)}
      >
        <option value="">Day</option>
        {dayOptions.map((option) => {
          const padded = String(option).padStart(2, "0");
          return (
            <option key={padded} value={padded}>
              {option}
            </option>
          );
        })}
      </select>
      <select
        id={`${id}-month`}
        className={cn(selectClass)}
        disabled={disabled}
        value={month}
        aria-label="Month"
        onChange={(event) => {
          const nextMonth = event.target.value;
          setMonth(nextMonth);
          if (day && nextMonth) {
            const nextMax = daysInMonth(Number(nextMonth));
            if (Number(day) > nextMax) setDay("");
          }
        }}
      >
        <option value="">Month</option>
        {MONTH_DAY_MONTHS.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
    </div>
  );
}
