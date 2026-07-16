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
import {
  Calendar,
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  formatWeekRangeLabel,
  getIsoWeekNumber,
  getWeekMonday,
  weekStartKeyFromDate,
} from "@/lib/hr/schedules";
import { cn } from "@/lib/utils";

const WEEKDAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const;

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

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseIsoDate(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Monday ISO key (YYYY-MM-DD) for the week containing a work_date. */
export function mondayKeyForWorkDate(workDate: string): string | null {
  const date = parseIsoDate(workDate);
  if (!date) return null;
  return weekStartKeyFromDate(getWeekMonday(date));
}

/** Calendar month key (YYYY-MM) for a work_date. */
export function monthKeyForWorkDate(workDate: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) return null;
  return workDate.slice(0, 7);
}

export function monthKeyFromDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function formatMonthKeyLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  if (!y || !m) return monthKey;
  return new Date(y, m - 1, 1).toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });
}

type CalendarWeek = {
  monday: Date;
  weekKey: string;
  weekNumber: number;
  days: Date[];
};

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
      weekKey: weekStartKeyFromDate(monday),
      weekNumber: getIsoWeekNumber(monday),
      days,
    });
    cursor.setDate(cursor.getDate() + 7);
    if (weeks.length > 6) break;
  }

  return weeks;
}

function usePopoverPosition(open: boolean, containerRef: React.RefObject<HTMLElement | null>) {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(
    null,
  );

  const update = () => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 304;
    const left = Math.min(
      Math.max(8, rect.left),
      window.innerWidth - width - 8,
    );
    setPosition({ top: rect.bottom + 6, left });
  };

  useLayoutEffect(() => {
    if (!open) return;
    update();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handle = () => update();
    window.addEventListener("resize", handle);
    window.addEventListener("scroll", handle, true);
    return () => {
      window.removeEventListener("resize", handle);
      window.removeEventListener("scroll", handle, true);
    };
  }, [open]);

  return { position, update };
}

type AttendanceMultiWeekPickerProps = {
  selectedWeekKeys: string[];
  onChange: (weekKeys: string[]) => void;
  /** Field label above the trigger. Defaults to "Weeks". */
  fieldLabel?: string;
  /** Trigger text when nothing is selected. Defaults to "Any week". */
  emptyLabel?: string;
};

export function AttendanceMultiWeekPicker({
  selectedWeekKeys,
  onChange,
  fieldLabel = "Weeks",
  emptyLabel = "Any week",
}: AttendanceMultiWeekPickerProps) {
  const calendarId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => new Set(selectedWeekKeys), [selectedWeekKeys]);
  const [viewMonth, setViewMonth] = useState(() => monthStart(new Date()));
  const { position, update } = usePopoverPosition(open, containerRef);
  const weeks = useMemo(() => buildMonthWeeks(viewMonth), [viewMonth]);
  const today = startOfLocalDay(new Date());
  const thisMondayKey = weekStartKeyFromDate(getWeekMonday(today));

  const label = useMemo(() => {
    if (selectedWeekKeys.length === 0) return emptyLabel;
    if (selectedWeekKeys.length === 1) {
      const monday = parseIsoDate(selectedWeekKeys[0]!);
      if (!monday) return "1 week";
      return `W${getIsoWeekNumber(monday)} · ${formatWeekRangeLabel(monday)}`;
    }
    const nums = selectedWeekKeys
      .map((key) => {
        const monday = parseIsoDate(key);
        return monday ? getIsoWeekNumber(monday) : null;
      })
      .filter((n): n is number => n != null)
      .sort((a, b) => a - b);
    return `${selectedWeekKeys.length} weeks · W${nums.join(", W")}`;
  }, [selectedWeekKeys, emptyLabel]);

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
    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  function toggleWeek(weekKey: string) {
    const next = new Set(selected);
    if (next.has(weekKey)) next.delete(weekKey);
    else next.add(weekKey);
    onChange([...next].sort());
  }

  const monthLabel = viewMonth.toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });

  return (
    <>
      <div ref={containerRef} className="flex flex-col gap-1">
        <span className="text-[11px] font-medium uppercase tracking-wide text-black/45">
          {fieldLabel}
        </span>
        <button
          type="button"
          aria-controls={calendarId}
          aria-expanded={open}
          aria-haspopup="dialog"
          title={label}
          onClick={() => {
            if (open) setOpen(false);
            else {
              setViewMonth(monthStart(new Date()));
              update();
              setOpen(true);
            }
          }}
          className={cn(
            "inline-flex h-10 max-w-[18rem] items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium tabular-nums transition-colors",
            open || selectedWeekKeys.length > 0
              ? "border-[var(--venue-primary)]/40 bg-white text-[#3D421F]"
              : "border-black/10 bg-white text-[#3D421F] hover:bg-black/[0.02]",
          )}
        >
          <Calendar className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
          <span className="truncate">{label}</span>
        </button>
      </div>

      {open && position
        ? createPortal(
            <div
              ref={popoverRef}
              id={calendarId}
              role="dialog"
              aria-label="Select weeks"
              className="fixed z-[250]"
              style={{ top: position.top, left: position.left }}
            >
              <div className="w-[19rem] rounded-lg border border-black/10 bg-white p-3 shadow-lg">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setViewMonth(addMonths(viewMonth, -1))}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-black/10 text-[#3D421F] hover:bg-[var(--venue-secondary)]/30"
                    aria-label="Previous month"
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden />
                  </button>
                  <p className="text-sm font-semibold text-[#3D421F]">
                    {monthLabel}
                  </p>
                  <button
                    type="button"
                    onClick={() => setViewMonth(addMonths(viewMonth, 1))}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-black/10 text-[#3D421F] hover:bg-[var(--venue-secondary)]/30"
                    aria-label="Next month"
                  >
                    <ChevronRight className="h-4 w-4" aria-hidden />
                  </button>
                </div>

                <div className="space-y-0.5 text-center">
                  <div className="flex items-center gap-0.5">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center text-[10px] font-semibold uppercase tracking-wide text-black/35">
                      Wk
                    </div>
                    <div className="grid min-w-0 flex-1 grid-cols-7 gap-0.5">
                      {WEEKDAY_LABELS.map((l) => (
                        <div
                          key={l}
                          className="py-1 text-[10px] font-semibold uppercase tracking-wide text-black/45"
                        >
                          {l}
                        </div>
                      ))}
                    </div>
                  </div>

                  {weeks.map((week) => {
                    const isSelected = selected.has(week.weekKey);
                    const isCurrent = week.weekKey === thisMondayKey;
                    return (
                      <button
                        key={week.weekKey}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => toggleWeek(week.weekKey)}
                        className={cn(
                          "flex w-full items-center gap-0.5 rounded-md transition-colors",
                          isSelected
                            ? "bg-[var(--venue-primary)] text-white"
                            : "text-[#3D421F] hover:bg-[var(--venue-secondary)]/35",
                          isCurrent &&
                            !isSelected &&
                            "ring-1 ring-inset ring-[var(--venue-primary)]/40",
                        )}
                        aria-pressed={isSelected}
                        aria-label={`Week ${week.weekNumber}, ${formatWeekRangeLabel(week.monday)}`}
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
                            const inMonth =
                              day.getMonth() === viewMonth.getMonth();
                            const isToday = isSameDay(day, today);
                            return (
                              <span
                                key={toDateKey(day)}
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
                  <p className="text-[10px] text-black/45">
                    Click weeks to multi-select
                  </p>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => onChange([])}
                    className="rounded-md px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-[#3D421F] hover:bg-[var(--venue-secondary)]/35"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

type AttendanceDayRangePickerProps = {
  startDate: string;
  endDate: string;
  onChange: (range: { startDate: string; endDate: string }) => void;
};

export function AttendanceDayRangePicker({
  startDate,
  endDate,
  onChange,
}: AttendanceDayRangePickerProps) {
  const calendarId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => monthStart(new Date()));
  const [anchor, setAnchor] = useState<string | null>(null);
  const { position, update } = usePopoverPosition(open, containerRef);
  const weeks = useMemo(() => buildMonthWeeks(viewMonth), [viewMonth]);
  const today = startOfLocalDay(new Date());

  const rangeStart = startDate && endDate
    ? startDate <= endDate
      ? startDate
      : endDate
    : startDate || endDate;
  const rangeEnd = startDate && endDate
    ? startDate <= endDate
      ? endDate
      : startDate
    : "";

  const label = useMemo(() => {
    if (!startDate && !endDate) return "Any days";
    if (startDate && !endDate) return `${startDate} → …`;
    if (startDate && endDate) {
      const a = startDate <= endDate ? startDate : endDate;
      const b = startDate <= endDate ? endDate : startDate;
      return a === b ? a : `${a} → ${b}`;
    }
    return "Any days";
  }, [startDate, endDate]);

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
      setAnchor(null);
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setAnchor(null);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  function pickDay(dayKey: string) {
    if (!anchor) {
      setAnchor(dayKey);
      onChange({ startDate: dayKey, endDate: "" });
      return;
    }
    const start = anchor <= dayKey ? anchor : dayKey;
    const end = anchor <= dayKey ? dayKey : anchor;
    onChange({ startDate: start, endDate: end });
    setAnchor(null);
    setOpen(false);
  }

  const monthLabel = viewMonth.toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });

  return (
    <>
      <div ref={containerRef} className="flex flex-col gap-1">
        <span className="text-[11px] font-medium uppercase tracking-wide text-black/45">
          Days
        </span>
        <button
          type="button"
          aria-controls={calendarId}
          aria-expanded={open}
          aria-haspopup="dialog"
          title={label}
          onClick={() => {
            if (open) {
              setOpen(false);
              setAnchor(null);
            } else {
              const focus = parseIsoDate(startDate || endDate);
              setViewMonth(monthStart(focus ?? new Date()));
              setAnchor(startDate && !endDate ? startDate : null);
              update();
              setOpen(true);
            }
          }}
          className={cn(
            "inline-flex h-10 max-w-[18rem] items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium tabular-nums transition-colors",
            open || startDate || endDate
              ? "border-[var(--venue-primary)]/40 bg-white text-[#3D421F]"
              : "border-black/10 bg-white text-[#3D421F] hover:bg-black/[0.02]",
          )}
        >
          <CalendarRange
            className="h-3.5 w-3.5 shrink-0 opacity-70"
            aria-hidden
          />
          <span className="truncate">{label}</span>
        </button>
      </div>

      {open && position
        ? createPortal(
            <div
              ref={popoverRef}
              id={calendarId}
              role="dialog"
              aria-label="Select day range"
              className="fixed z-[250]"
              style={{ top: position.top, left: position.left }}
            >
              <div className="w-[19rem] rounded-lg border border-black/10 bg-white p-3 shadow-lg">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setViewMonth(addMonths(viewMonth, -1))}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-black/10 text-[#3D421F] hover:bg-[var(--venue-secondary)]/30"
                    aria-label="Previous month"
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden />
                  </button>
                  <p className="text-sm font-semibold text-[#3D421F]">
                    {monthLabel}
                  </p>
                  <button
                    type="button"
                    onClick={() => setViewMonth(addMonths(viewMonth, 1))}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-black/10 text-[#3D421F] hover:bg-[var(--venue-secondary)]/30"
                    aria-label="Next month"
                  >
                    <ChevronRight className="h-4 w-4" aria-hidden />
                  </button>
                </div>

                <div className="mb-2 grid grid-cols-7 gap-0.5 text-center">
                  {WEEKDAY_LABELS.map((l) => (
                    <div
                      key={l}
                      className="py-1 text-[10px] font-semibold uppercase tracking-wide text-black/45"
                    >
                      {l}
                    </div>
                  ))}
                </div>

                <div className="space-y-0.5">
                  {weeks.map((week) => (
                    <div
                      key={week.weekKey}
                      className="grid grid-cols-7 gap-0.5"
                    >
                      {week.days.map((day) => {
                        const dayKey = toDateKey(day);
                        const inMonth =
                          day.getMonth() === viewMonth.getMonth();
                        const isToday = isSameDay(day, today);
                        const isStart = dayKey === (anchor || rangeStart);
                        const isEnd = Boolean(rangeEnd) && dayKey === rangeEnd;
                        const inRange =
                          Boolean(rangeStart) &&
                          Boolean(rangeEnd) &&
                          dayKey >= rangeStart &&
                          dayKey <= rangeEnd;
                        const isAnchorOnly =
                          Boolean(anchor) && dayKey === anchor && !rangeEnd;

                        return (
                          <button
                            key={dayKey}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => pickDay(dayKey)}
                            className={cn(
                              "flex h-8 items-center justify-center rounded-md text-sm tabular-nums transition-colors",
                              !inMonth && "text-black/30",
                              inMonth && "text-[#3D421F]",
                              inRange &&
                                !isStart &&
                                !isEnd &&
                                "bg-[var(--venue-primary)]/15",
                              (isStart || isEnd || isAnchorOnly) &&
                                "bg-[var(--venue-primary)] font-semibold text-white",
                              isToday &&
                                !isStart &&
                                !isEnd &&
                                !isAnchorOnly &&
                                "font-semibold text-[var(--venue-primary)]",
                              inMonth &&
                                !inRange &&
                                !isStart &&
                                !isEnd &&
                                !isAnchorOnly &&
                                "hover:bg-[var(--venue-secondary)]/40",
                            )}
                          >
                            {day.getDate()}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>

                <div className="mt-3 flex items-center justify-between gap-2 border-t border-black/5 pt-2">
                  <p className="text-[10px] text-black/45">
                    {anchor
                      ? "Click the last day"
                      : "First click start · second click end"}
                  </p>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setAnchor(null);
                      onChange({ startDate: "", endDate: "" });
                    }}
                    className="rounded-md px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-[#3D421F] hover:bg-[var(--venue-secondary)]/35"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

type AttendanceMultiMonthPickerProps = {
  selectedMonthKeys: string[];
  onChange: (monthKeys: string[]) => void;
};

export function AttendanceMultiMonthPicker({
  selectedMonthKeys,
  onChange,
}: AttendanceMultiMonthPickerProps) {
  const calendarId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selected = useMemo(
    () => new Set(selectedMonthKeys),
    [selectedMonthKeys],
  );
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const { position, update } = usePopoverPosition(open, containerRef);
  const todayKey = monthKeyFromDate(new Date());

  const label = useMemo(() => {
    if (selectedMonthKeys.length === 0) return "Any month";
    if (selectedMonthKeys.length === 1) {
      return formatMonthKeyLabel(selectedMonthKeys[0]!);
    }
    const sorted = [...selectedMonthKeys].sort();
    if (sorted.length <= 3) {
      return sorted
        .map((key) => {
          const [y, m] = key.split("-").map(Number);
          return new Date(y, m - 1, 1).toLocaleString(undefined, {
            month: "short",
            year: "2-digit",
          });
        })
        .join(", ");
    }
    return `${sorted.length} months`;
  }, [selectedMonthKeys]);

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
    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  function toggleMonth(monthKey: string) {
    const next = new Set(selected);
    if (next.has(monthKey)) next.delete(monthKey);
    else next.add(monthKey);
    onChange([...next].sort());
  }

  const months = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const date = new Date(viewYear, i, 1);
      return {
        key: monthKeyFromDate(date),
        label: date.toLocaleString(undefined, { month: "short" }),
      };
    });
  }, [viewYear]);

  return (
    <>
      <div ref={containerRef} className="flex flex-col gap-1">
        <span className="text-[11px] font-medium uppercase tracking-wide text-black/45">
          Months
        </span>
        <button
          type="button"
          aria-controls={calendarId}
          aria-expanded={open}
          aria-haspopup="dialog"
          title={label}
          onClick={() => {
            if (open) setOpen(false);
            else {
              setViewYear(new Date().getFullYear());
              update();
              setOpen(true);
            }
          }}
          className={cn(
            "inline-flex h-10 max-w-[18rem] items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium tabular-nums transition-colors",
            open || selectedMonthKeys.length > 0
              ? "border-[var(--venue-primary)]/40 bg-white text-[#3D421F]"
              : "border-black/10 bg-white text-[#3D421F] hover:bg-black/[0.02]",
          )}
        >
          <CalendarDays
            className="h-3.5 w-3.5 shrink-0 opacity-70"
            aria-hidden
          />
          <span className="truncate">{label}</span>
        </button>
      </div>

      {open && position
        ? createPortal(
            <div
              ref={popoverRef}
              id={calendarId}
              role="dialog"
              aria-label="Select months"
              className="fixed z-[250]"
              style={{ top: position.top, left: position.left }}
            >
              <div className="w-[19rem] rounded-lg border border-black/10 bg-white p-3 shadow-lg">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setViewYear((y) => y - 1)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-black/10 text-[#3D421F] hover:bg-[var(--venue-secondary)]/30"
                    aria-label="Previous year"
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden />
                  </button>
                  <p className="text-sm font-semibold text-[#3D421F]">
                    {viewYear}
                  </p>
                  <button
                    type="button"
                    onClick={() => setViewYear((y) => y + 1)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-black/10 text-[#3D421F] hover:bg-[var(--venue-secondary)]/30"
                    aria-label="Next year"
                  >
                    <ChevronRight className="h-4 w-4" aria-hidden />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  {months.map((month) => {
                    const isSelected = selected.has(month.key);
                    const isCurrent = month.key === todayKey;
                    return (
                      <button
                        key={month.key}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => toggleMonth(month.key)}
                        className={cn(
                          "flex h-10 items-center justify-center rounded-md text-sm font-medium transition-colors",
                          isSelected
                            ? "bg-[var(--venue-primary)] text-white"
                            : "text-[#3D421F] hover:bg-[var(--venue-secondary)]/35",
                          isCurrent &&
                            !isSelected &&
                            "ring-1 ring-inset ring-[var(--venue-primary)]/40",
                        )}
                        aria-pressed={isSelected}
                        aria-label={formatMonthKeyLabel(month.key)}
                      >
                        {month.label}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-3 flex items-center justify-between gap-2 border-t border-black/5 pt-2">
                  <p className="text-[10px] text-black/45">
                    Click months to multi-select
                  </p>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => onChange([])}
                    className="rounded-md px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-[#3D421F] hover:bg-[var(--venue-secondary)]/35"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
