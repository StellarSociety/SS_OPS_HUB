"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import {
  formatDisplayDate,
  parseDisplayDate,
} from "@/lib/dates/display";
import { cn } from "@/lib/utils";

export type DateInputProps = {
  value: string;
  onChange: (isoDate: string) => void;
  disabled?: boolean;
  className?: string;
  /** Classes applied to the text input (defaults suit form fields). */
  inputClassName?: string;
  placeholder?: string;
  id?: string;
  name?: string;
  /** When set, dates after this (YYYY-MM-DD) cannot be selected. */
  maxDate?: string;
  /**
   * ISO dates (YYYY-MM-DD) that already have an entry. When provided, past days
   * without an entry are highlighted with a red background in the calendar.
   */
  datesWithEntries?: ReadonlySet<string>;
};

const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;

function dateToIso(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isoToDate(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function monthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function buildCalendarDays(viewMonth: Date): Array<Date | null> {
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<Date | null> = [];

  for (let index = 0; index < firstDay; index += 1) {
    cells.push(null);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(year, month, day));
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return cells;
}

type DateCalendarProps = {
  viewMonth: Date;
  selectedIso: string;
  maxDate?: string;
  datesWithEntries?: ReadonlySet<string>;
  onSelect: (iso: string) => void;
  onViewMonthChange: (month: Date) => void;
};

function DateCalendar({
  viewMonth,
  selectedIso,
  maxDate,
  datesWithEntries,
  onSelect,
  onViewMonthChange,
}: DateCalendarProps) {
  const today = new Date();
  const todayIso = dateToIso(today);
  const selectedDate = isoToDate(selectedIso);
  const monthLabel = viewMonth.toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });
  const days = buildCalendarDays(viewMonth);

  return (
    <div className="w-[16.5rem] rounded-lg border border-black/10 bg-white p-3 shadow-lg">
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onViewMonthChange(addMonths(viewMonth, -1))}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-black/10 text-[#3D421F] transition-colors hover:bg-[var(--venue-secondary)]/30"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="text-sm font-semibold text-[#3D421F]">{monthLabel}</p>
        <button
          type="button"
          onClick={() => onViewMonthChange(addMonths(viewMonth, 1))}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-black/10 text-[#3D421F] transition-colors hover:bg-[var(--venue-secondary)]/30"
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="py-1 text-[10px] font-semibold uppercase tracking-wide text-black/45"
          >
            {label}
          </div>
        ))}
        {days.map((day, index) => {
          if (!day) {
            return <div key={`empty-${index}`} className="h-8" />;
          }

          const iso = dateToIso(day);
          const isSelected = selectedDate ? isSameDay(day, selectedDate) : false;
          const isToday = isSameDay(day, today);
          const isAfterMax = maxDate ? iso > maxDate : false;
          const isMissingEntry =
            !!datesWithEntries &&
            iso < todayIso &&
            !isAfterMax &&
            !datesWithEntries.has(iso);

          return (
            <button
              key={iso}
              type="button"
              disabled={isAfterMax}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onSelect(iso)}
              title={isMissingEntry ? "No entry for this day" : undefined}
              className={cn(
                "inline-flex h-8 w-8 items-center justify-center rounded-md text-sm tabular-nums transition-colors",
                isSelected
                  ? "bg-[var(--venue-primary)] font-semibold text-white"
                  : isMissingEntry
                    ? "bg-red-500/12 text-red-700 hover:bg-red-500/20"
                    : "text-[#3D421F] hover:bg-[var(--venue-secondary)]/35",
                isToday &&
                  !isSelected &&
                  "ring-2 ring-[var(--venue-primary)]/45 ring-offset-1",
                isToday && isSelected && "ring-2 ring-white/70 ring-offset-1",
                isAfterMax && "cursor-not-allowed opacity-35 hover:bg-transparent",
              )}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>

      {datesWithEntries ? (
        <div className="mt-3 flex items-center gap-1.5 border-t border-black/5 pt-2 text-[10px] text-black/50">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-500/25" />
          No entry for that day
        </div>
      ) : null}
    </div>
  );
}

/**
 * Date field that always displays and accepts `DD/MM/YYYY`, while storing
 * ISO `YYYY-MM-DD` in `value` / `onChange` (and an optional hidden `name` input).
 */
export function DateInput({
  value,
  onChange,
  disabled = false,
  className,
  inputClassName,
  placeholder = "DD/MM/YYYY",
  id,
  name,
  maxDate,
  datesWithEntries,
}: DateInputProps) {
  const calendarId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [text, setText] = useState(() =>
    value ? formatDisplayDate(value) : "",
  );
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() =>
    monthStart(isoToDate(value) ?? new Date()),
  );
  const [popoverPosition, setPopoverPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);

  useEffect(() => {
    setText(value ? formatDisplayDate(value) : "");
  }, [value]);

  const updatePopoverPosition = () => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPopoverPosition({
      top: rect.bottom + 6,
      left: rect.left,
    });
  };

  useLayoutEffect(() => {
    if (!calendarOpen) return;
    updatePopoverPosition();
  }, [calendarOpen]);

  useEffect(() => {
    if (!calendarOpen) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        containerRef.current?.contains(target) ||
        popoverRef.current?.contains(target)
      ) {
        return;
      }
      setCalendarOpen(false);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setCalendarOpen(false);
      }
    }

    function handleReposition() {
      updatePopoverPosition();
    }

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [calendarOpen]);

  function applyIsoDate(iso: string) {
    if (maxDate && iso > maxDate) return;
    onChange(iso);
    setText(formatDisplayDate(iso));
    setViewMonth(monthStart(isoToDate(iso) ?? new Date()));
    setCalendarOpen(false);
  }

  function handleBlur() {
    if (!text.trim()) {
      if (value) onChange("");
      setText("");
      return;
    }

    const parsed = parseDisplayDate(text);
    if (!parsed) {
      setText(value ? formatDisplayDate(value) : "");
      return;
    }

    if (maxDate && parsed > maxDate) {
      setText(value ? formatDisplayDate(value) : "");
      return;
    }

    applyIsoDate(parsed);
  }

  function openCalendar() {
    if (disabled) return;
    setViewMonth(monthStart(isoToDate(value) ?? new Date()));
    updatePopoverPosition();
    setCalendarOpen(true);
  }

  return (
    <>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <div ref={containerRef} className={cn("relative inline-flex", className)}>
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          disabled={disabled}
          value={text}
          placeholder={placeholder}
          onChange={(event) => setText(event.target.value)}
          onBlur={handleBlur}
          className={cn(
            "h-full w-full rounded-md border border-black/10 bg-white ps-3 text-sm tabular-nums text-[#3D421F] placeholder:text-black/35",
            disabled && "cursor-not-allowed opacity-60",
            inputClassName,
            // Keep space for the calendar button even if inputClassName sets px-*
            "pe-9",
          )}
        />
        <button
          type="button"
          disabled={disabled}
          aria-controls={calendarId}
          aria-expanded={calendarOpen}
          aria-label="Open calendar"
          onMouseDown={(event) => event.preventDefault()}
          onClick={openCalendar}
          className={cn(
            "absolute right-2 top-1/2 inline-flex -translate-y-1/2 items-center justify-center rounded p-0.5 text-black/45 transition-colors hover:text-[#3D421F]",
            disabled && "cursor-not-allowed opacity-60",
          )}
        >
          <Calendar className="h-4 w-4" />
        </button>
      </div>

      {calendarOpen && popoverPosition
        ? createPortal(
            <div
              ref={popoverRef}
              id={calendarId}
              className="fixed z-[250]"
              style={{
                top: popoverPosition.top,
                left: popoverPosition.left,
              }}
            >
              <DateCalendar
                viewMonth={viewMonth}
                selectedIso={value}
                maxDate={maxDate}
                datesWithEntries={datesWithEntries}
                onSelect={applyIsoDate}
                onViewMonthChange={setViewMonth}
              />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
