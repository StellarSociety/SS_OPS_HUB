"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import {
  formatWeekRangeLabel,
  getIsoWeekNumber,
  getMondayForWeekOffset,
  getWeekMonday,
  weekOffsetFromDate,
} from "@/lib/hr/schedules";
import { cn } from "@/lib/utils";

const WEEKDAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const;

type SchedulesWeekNavProps = {
  weekOffset: number;
  onWeekOffsetChange: (offset: number) => void;
  /** Wrap mutations (e.g. unsaved-changes guard). */
  guardAction?: (action: () => void) => void;
  className?: string;
};

function monthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

type CalendarWeek = {
  monday: Date;
  weekNumber: number;
  days: Date[];
};

/** Monday-start weeks that cover the visible calendar month. */
function buildMonthWeeks(viewMonth: Date): CalendarWeek[] {
  const firstOfMonth = monthStart(viewMonth);
  const cursor = getWeekMonday(firstOfMonth);
  const lastOfMonth = new Date(
    viewMonth.getFullYear(),
    viewMonth.getMonth() + 1,
    0,
  );
  const weeks: CalendarWeek[] = [];

  while (cursor <= lastOfMonth || weeks.length === 0) {
    const monday = startOfLocalDay(cursor);
    const days: Date[] = [];
    for (let i = 0; i < 7; i += 1) {
      const day = new Date(monday);
      day.setDate(monday.getDate() + i);
      days.push(day);
    }
    weeks.push({
      monday,
      weekNumber: getIsoWeekNumber(monday),
      days,
    });
    cursor.setDate(cursor.getDate() + 7);
    if (weeks.length > 6) break;
  }

  return weeks;
}

type WeekPickerCalendarProps = {
  viewMonth: Date;
  selectedMonday: Date;
  onSelectWeek: (monday: Date) => void;
  onViewMonthChange: (month: Date) => void;
  onGoToThisWeek: () => void;
};

function WeekPickerCalendar({
  viewMonth,
  selectedMonday,
  onSelectWeek,
  onViewMonthChange,
  onGoToThisWeek,
}: WeekPickerCalendarProps) {
  const today = startOfLocalDay(new Date());
  const thisMonday = getWeekMonday(today);
  const weeks = useMemo(() => buildMonthWeeks(viewMonth), [viewMonth]);
  const monthLabel = viewMonth.toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });
  const isThisWeekSelected = isSameDay(selectedMonday, thisMonday);

  return (
    <div className="w-[19rem] rounded-lg border border-black/10 bg-white p-3 shadow-lg">
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onViewMonthChange(addMonths(viewMonth, -1))}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-black/10 text-[#3D421F] transition-colors hover:bg-[var(--venue-secondary)]/30"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <p className="text-sm font-semibold text-[#3D421F]">{monthLabel}</p>
        <button
          type="button"
          onClick={() => onViewMonthChange(addMonths(viewMonth, 1))}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-black/10 text-[#3D421F] transition-colors hover:bg-[var(--venue-secondary)]/30"
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className="space-y-0.5 text-center">
        <div className="flex items-center gap-0.5">
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center text-[10px] font-semibold uppercase tracking-wide text-black/35"
            title="ISO week"
          >
            Wk
          </div>
          <div className="grid min-w-0 flex-1 grid-cols-7 gap-0.5">
            {WEEKDAY_LABELS.map((label) => (
              <div
                key={label}
                className="py-1 text-[10px] font-semibold uppercase tracking-wide text-black/45"
              >
                {label}
              </div>
            ))}
          </div>
        </div>

        {weeks.map((week) => {
          const isSelected = isSameDay(week.monday, selectedMonday);
          const isCurrentWeek = isSameDay(week.monday, thisMonday);
          const weekKey = `${week.monday.getFullYear()}-${week.monday.getMonth()}-${week.monday.getDate()}`;

          return (
            <button
              key={weekKey}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onSelectWeek(week.monday)}
              className={cn(
                "flex w-full items-center gap-0.5 rounded-md transition-colors",
                isSelected
                  ? "bg-[var(--venue-primary)] text-white"
                  : "text-[#3D421F] hover:bg-[var(--venue-secondary)]/35",
                isCurrentWeek &&
                  !isSelected &&
                  "ring-1 ring-inset ring-[var(--venue-primary)]/40",
              )}
              aria-label={`Week ${week.weekNumber}, ${formatWeekRangeLabel(week.monday)}`}
              aria-pressed={isSelected}
            >
              <span
                className={cn(
                  "flex h-8 w-7 shrink-0 items-center justify-center text-[10px] font-semibold tabular-nums",
                  isSelected ? "text-white/85" : "text-black/40",
                )}
              >
                {week.weekNumber}
              </span>
              <span className="grid min-w-0 flex-1 grid-cols-7 gap-0.5">
                {week.days.map((day) => {
                  const inMonth = day.getMonth() === viewMonth.getMonth();
                  const isToday = isSameDay(day, today);
                  const dayKey = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
                  return (
                    <span
                      key={dayKey}
                      className={cn(
                        "flex h-8 items-center justify-center text-sm tabular-nums",
                        !inMonth && !isSelected && "text-black/30",
                        isToday &&
                          !isSelected &&
                          "font-semibold text-[var(--venue-primary)]",
                        isToday && isSelected && "font-semibold",
                      )}
                    >
                      {day.getDate()}
                    </span>
                  );
                })}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-black/5 pt-2">
        <p className="text-[10px] text-black/45">Weeks Mon–Sun · ISO week nos.</p>
        <button
          type="button"
          disabled={isThisWeekSelected}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onGoToThisWeek}
          className={cn(
            "rounded-md px-2 py-1 text-[11px] font-medium uppercase tracking-wide transition-colors",
            isThisWeekSelected
              ? "cursor-default text-black/30"
              : "text-[#3D421F] hover:bg-[var(--venue-secondary)]/35",
          )}
        >
          This week
        </button>
      </div>
    </div>
  );
}

export function SchedulesWeekNav({
  weekOffset,
  onWeekOffsetChange,
  guardAction,
  className,
}: SchedulesWeekNavProps) {
  const run = guardAction ?? ((action: () => void) => action());
  const calendarId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);

  const monday = useMemo(
    () => getMondayForWeekOffset(weekOffset),
    [weekOffset],
  );
  const rangeLabel = formatWeekRangeLabel(monday);
  const weekNumber = getIsoWeekNumber(monday);
  const [viewMonth, setViewMonth] = useState(() => monthStart(monday));

  const updatePopoverPosition = () => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 304; // ~19rem
    const left = Math.min(
      Math.max(8, rect.right - width),
      window.innerWidth - width - 8,
    );
    setPopoverPosition({
      top: rect.bottom + 6,
      left,
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePopoverPosition();
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        containerRef.current?.contains(target) ||
        popoverRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
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
  }, [open]);

  function openPicker() {
    setViewMonth(monthStart(monday));
    updatePopoverPosition();
    setOpen(true);
  }

  function selectOffset(next: number) {
    run(() => {
      onWeekOffsetChange(next);
      setOpen(false);
    });
  }

  const isCurrentWeek = weekOffset === 0;

  return (
    <>
      <div
        ref={containerRef}
        className={cn("flex items-center gap-1", className)}
      >
        <button
          type="button"
          onClick={() => run(() => onWeekOffsetChange(weekOffset - 1))}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-black/10 bg-white/70 text-[#3D421F] transition-colors hover:bg-white"
          aria-label="Previous week"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          aria-controls={calendarId}
          aria-expanded={open}
          aria-haspopup="dialog"
          title={`Week ${weekNumber} · ${rangeLabel}`}
          onClick={() => {
            if (open) setOpen(false);
            else openPicker();
          }}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium tabular-nums transition-colors",
            open
              ? "border-[var(--venue-primary)]/40 bg-white text-[#3D421F]"
              : "border-black/10 bg-white/70 text-[#3D421F] hover:bg-white",
          )}
        >
          <Calendar className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
          <span className="uppercase tracking-wide">W{weekNumber}</span>
          <span className="hidden text-black/45 sm:inline" aria-hidden>
            ·
          </span>
          <span className="hidden max-w-[9.5rem] truncate font-normal normal-case tracking-normal text-black/55 sm:inline">
            {rangeLabel}
          </span>
        </button>
        <button
          type="button"
          onClick={() => run(() => onWeekOffsetChange(weekOffset + 1))}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-black/10 bg-white/70 text-[#3D421F] transition-colors hover:bg-white"
          aria-label="Next week"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          disabled={isCurrentWeek}
          onClick={() => run(() => onWeekOffsetChange(0))}
          title={
            isCurrentWeek
              ? "Already viewing the current week"
              : "Jump to the current week"
          }
          className={cn(
            "ml-1 inline-flex h-9 items-center rounded-lg border px-2.5 text-[11px] font-semibold uppercase tracking-wide transition-colors",
            isCurrentWeek
              ? "cursor-default border-black/5 bg-black/[0.03] text-black/30"
              : "border-black/10 bg-white/70 text-[#3D421F] hover:bg-white",
          )}
        >
          Current week
        </button>
      </div>

      {open && popoverPosition
        ? createPortal(
            <div
              ref={popoverRef}
              id={calendarId}
              role="dialog"
              aria-label="Select schedule week"
              className="fixed z-[250]"
              style={{
                top: popoverPosition.top,
                left: popoverPosition.left,
              }}
            >
              <WeekPickerCalendar
                viewMonth={viewMonth}
                selectedMonday={monday}
                onViewMonthChange={setViewMonth}
                onSelectWeek={(nextMonday) => {
                  selectOffset(weekOffsetFromDate(nextMonday));
                }}
                onGoToThisWeek={() => selectOffset(0)}
              />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
