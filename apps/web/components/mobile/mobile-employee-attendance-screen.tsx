"use client";

import {
  useEffect,
  useMemo,
  useState,
  useTransition,
  type CSSProperties,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Ban,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  House,
} from "lucide-react";
import { loadMobileAttendanceMonthAction } from "@/lib/actions/mobile-employee-attendance";
import { MobileTabBar } from "@/components/mobile/mobile-tab-bar";
import { formatMonthKeyLabel, isValidMonthKey } from "@/lib/hr/attendance-months";
import {
  formatAttendanceClock,
  formatShiftRangeLabel,
  formatWeekRangeLabel,
  isOutsideEmploymentWindow,
} from "@/lib/hr/schedules";
import { shiftMonthKey } from "@/lib/sentiment/review-period";
import type {
  MobileAttendanceDay,
  MobileAttendanceMonth,
} from "@/lib/mobile/employee-attendance";
import type { MobileTabItem } from "@/lib/mobile/tab-bars";
import type { Venue } from "@/lib/types/database";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

type MonthCell = {
  key: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
};

type MobileEmployeeAttendanceScreenProps = {
  venue: Venue;
  initial: MobileAttendanceMonth;
  previewStaffId?: string | null;
  employeeName?: string | null;
  onSelectTab?: (tab: MobileTabItem) => void;
};

function firstNameOf(name: string | null | undefined): string | null {
  const first = name?.trim().split(/\s+/)[0];
  return first || null;
}

function todayIso(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || "Asia/Dubai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function buildMonthCells(monthKey: string, today: string): MonthCell[] {
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));
  const first = new Date(Date.UTC(year, month - 1, 1));
  const startOffset = (first.getUTCDay() + 6) % 7;
  const last = new Date(Date.UTC(year, month, 0));
  const lastDate = last.getUTCDate();
  const endPad = 6 - ((last.getUTCDay() + 6) % 7);
  const total = startOffset + lastDate + endPad;
  const cells: MonthCell[] = [];

  for (let index = 0; index < total; index += 1) {
    const date = new Date(Date.UTC(year, month - 1, 1 - startOffset + index));
    const key = date.toISOString().slice(0, 10);
    cells.push({
      key,
      day: date.getUTCDate(),
      inMonth: date.getUTCMonth() === month - 1,
      isToday: key === today,
    });
  }

  return cells;
}

function defaultSelectedDay(
  monthKey: string,
  today: string,
  days: MobileAttendanceDay[],
): string {
  if (today.startsWith(monthKey)) return today;
  const withData = days
    .map((day) => day.workDate)
    .filter((key) => key.startsWith(monthKey))
    .sort();
  return withData[0] ?? `${monthKey}-01`;
}

function parseIsoUtc(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function shiftIsoDate(iso: string, days: number): string {
  const date = parseIsoUtc(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function mondayKeyFor(iso: string): string {
  const date = parseIsoUtc(iso);
  const offset = (date.getUTCDay() + 6) % 7;
  return shiftIsoDate(iso, -offset);
}

function weekKeysFor(iso: string): string[] {
  const monday = mondayKeyFor(iso);
  return Array.from({ length: 7 }, (_, index) => shiftIsoDate(monday, index));
}

function formatWeekHeading(mondayKey: string): string {
  const monday = parseIsoUtc(mondayKey);
  return formatWeekRangeLabel(
    new Date(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate()),
  );
}

function formatWeekdayShort(iso: string): string {
  return parseIsoUtc(iso).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function formatHoursAsTime(totalHours: number | null | undefined): string {
  if (totalHours == null || !Number.isFinite(Number(totalHours))) return "—";
  const totalMinutes = Math.round(Number(totalHours) * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.abs(totalMinutes % 60);
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

export function MobileEmployeeAttendanceScreen({
  venue,
  initial,
  previewStaffId = null,
  employeeName = null,
  onSelectTab,
}: MobileEmployeeAttendanceScreenProps) {
  const preview = Boolean(onSelectTab);
  const router = useRouter();
  const pathname = usePathname();
  const [previewMonth, setPreviewMonth] = useState<MobileAttendanceMonth | null>(
    null,
  );
  const [selectedOverride, setSelectedOverride] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const firstName = firstNameOf(employeeName);
  const month = preview ? (previewMonth ?? initial) : initial;
  const today = todayIso(month.timezone);
  const cells = useMemo(
    () => buildMonthCells(month.monthKey, today),
    [month.monthKey, today],
  );
  const byDate = useMemo(() => {
    const map = new Map<string, MobileAttendanceDay>();
    for (const day of month.days) map.set(day.workDate, day);
    return map;
  }, [month.days]);
  const fallbackDay = defaultSelectedDay(month.monthKey, today, month.days);
  const selectedDay =
    selectedOverride && selectedOverride.startsWith(month.monthKey)
      ? selectedOverride
      : fallbackDay;

  useEffect(() => {
    if (!pickerOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPickerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pickerOpen]);

  const weekKeys = useMemo(() => weekKeysFor(selectedDay), [selectedDay]);
  const weekMonday = weekKeys[0]!;

  function goToMonth(nextKey: string) {
    if (!isValidMonthKey(nextKey) || nextKey === month.monthKey) {
      setPickerOpen(false);
      return;
    }
    setPickerOpen(false);
    setSelectedOverride(null);
    if (preview) {
      startTransition(async () => {
        const next = await loadMobileAttendanceMonthAction({
          venueId: venue.id,
          monthKey: nextKey,
          staffId: previewStaffId,
        });
        setPreviewMonth(next);
      });
      return;
    }
    router.push(`${pathname}?month=${nextKey}`);
  }

  return (
    <div
      className="mobile-app-canvas relative flex h-full min-h-0 flex-col"
      style={
        {
          "--venue-primary": venue.primary_color,
          "--venue-secondary": venue.secondary_color,
        } as CSSProperties
      }
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-32 pt-4">
        <h1 className="text-center font-serif text-2xl font-semibold text-[#3D421F] dark:text-[CanvasText]">
          {firstName ? `${firstName} Attendance` : "Employee Attendance"}
        </h1>
        <hr className="mt-3 border-black/10 dark:border-white/12" />

        {!month.linked ? (
          <div className="mt-10 flex flex-col items-center gap-2 px-6 text-center">
            <CalendarCheck className="h-8 w-8 text-[#3D421F]/30 dark:text-white/30" />
            <p className="text-sm text-black/50 dark:text-white/50">
              Your login isn’t linked to a staff record yet. Ask HR to connect
              your profile.
            </p>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between gap-1 rounded-xl bg-[var(--venue-primary,#818a40)] px-1 py-1 text-white">
              <button
                type="button"
                onClick={() => goToMonth(shiftMonthKey(month.monthKey, -1))}
                disabled={pending}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-white transition hover:bg-white/15 disabled:opacity-50"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-expanded={pickerOpen}
                aria-haspopup="dialog"
                onClick={() => setPickerOpen((open) => !open)}
                className="min-w-0 flex-1 rounded-md px-2 py-1 text-center font-serif text-lg text-white hover:bg-white/10"
              >
                {formatMonthKeyLabel(month.monthKey)}
              </button>
              <button
                type="button"
                onClick={() => goToMonth(shiftMonthKey(month.monthKey, 1))}
                disabled={pending}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-white transition hover:bg-white/15 disabled:opacity-50"
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {pickerOpen ? (
              <MonthPicker
                monthKey={month.monthKey}
                currentMonthKey={today.slice(0, 7)}
                onSelect={goToMonth}
                onClose={() => setPickerOpen(false)}
              />
            ) : null}

            <div
              className={cn(
                "overflow-hidden rounded-xl border border-black/10 bg-white/70 dark:border-white/12 dark:bg-white/[0.08]",
                pending && "opacity-60",
              )}
            >
              <div className="grid grid-cols-7 bg-black/[0.08] dark:bg-white/[0.12]">
                {WEEKDAYS.map((label) => (
                  <div
                    key={label}
                    className="px-0.5 py-1.5 text-center text-[9px] font-semibold uppercase tracking-wide text-[#3D421F]/70 dark:text-white/70"
                  >
                    {label.slice(0, 1)}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 auto-rows-[60px]">
                {cells.map((cell) => {
                  const day = cell.inMonth ? byDate.get(cell.key) : undefined;
                  const outsideEmployment =
                    cell.inMonth &&
                    isOutsideEmploymentWindow(
                      cell.key,
                      month.joiningDate,
                      month.terminationDate,
                    );
                  const selected = cell.key === selectedDay && cell.inMonth;
                  const inWeek = weekKeys.includes(cell.key);
                  const rosterCode = (
                    day?.rosterLabel ??
                    day?.rosterAbbreviation ??
                    ""
                  )
                    .trim()
                    .toUpperCase();
                  const isOff = !outsideEmployment && rosterCode === "OFF";
                  const isAbs = !outsideEmployment && rosterCode === "ABS";
                  return (
                    <button
                      key={cell.key}
                      type="button"
                      disabled={!cell.inMonth}
                      aria-pressed={selected}
                      aria-label={daySummaryLabel(cell, day, outsideEmployment)}
                      onClick={() => setSelectedOverride(cell.key)}
                      className={cn(
                        "relative flex h-full flex-col items-center gap-px overflow-hidden border-b border-r border-black/5 px-0.5 py-1 text-left [&:nth-child(7n)]:border-r-0 dark:border-white/10",
                        !cell.inMonth &&
                          "bg-[var(--venue-secondary,#F0F3DD)]/30 text-black/30",
                        cell.inMonth &&
                          !outsideEmployment &&
                          "hover:bg-[var(--venue-secondary)]/35",
                        inWeek &&
                          cell.inMonth &&
                          !outsideEmployment &&
                          "bg-[var(--venue-primary)]/10",
                        selected && !outsideEmployment && "bg-[var(--venue-primary)]/20",
                        outsideEmployment && "bg-black/[0.03] dark:bg-white/[0.04]",
                        cell.isToday &&
                          cell.inMonth &&
                          "z-[1] ring-2 ring-inset ring-[var(--venue-primary,#818a40)]",
                      )}
                    >
                      <span
                        className={cn(
                          "leading-none",
                          outsideEmployment
                            ? "font-medium text-black/35 dark:text-white/35"
                            : cell.isToday && cell.inMonth
                              ? "font-semibold text-[var(--venue-primary,#818a40)]"
                              : "font-medium text-[#3D421F] dark:text-[CanvasText]",
                        )}
                      >
                        <span className="text-[11px]">{cell.day}</span>
                      </span>
                      {outsideEmployment ? (
                        <span aria-hidden className="pointer-events-none absolute inset-0">
                          <span className="absolute left-1/2 top-1/2 h-px w-[140%] -translate-x-1/2 -translate-y-1/2 rotate-45 bg-black/40 dark:bg-white/40" />
                          <span className="absolute left-1/2 top-1/2 h-px w-[140%] -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-black/40 dark:bg-white/40" />
                        </span>
                      ) : null}
                      {isOff ? (
                        <House className="h-4 w-4 shrink-0" strokeWidth={2} />
                      ) : isAbs ? (
                        <Ban
                          className="h-4 w-4 shrink-0 text-[#DC2626]"
                          strokeWidth={2}
                        />
                      ) : null}
                      {!outsideEmployment &&
                      (day?.rosterAbbreviation || day?.holidayName) ? (
                        <span
                          className="max-w-full truncate rounded px-0.5 text-[8px] font-semibold leading-tight"
                          style={
                            day.rosterBgColor
                              ? {
                                  backgroundColor: day.rosterBgColor,
                                  color: day.rosterTextColor ?? "#3D421F",
                                }
                              : undefined
                          }
                        >
                          {day.rosterAbbreviation ?? "PH"}
                        </span>
                      ) : null}
                      {!outsideEmployment && (day?.clockIn || day?.clockOut) ? (
                        <span className="flex flex-col items-center gap-px text-[7px] leading-none text-black/55 dark:text-white/55">
                          <span>{formatAttendanceClock(day.clockIn) ?? "—"}</span>
                          <span>{formatAttendanceClock(day.clockOut) ?? "—"}</span>
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            <WeekDetail
              weekMonday={weekMonday}
              weekKeys={weekKeys}
              monthKey={month.monthKey}
              byDate={byDate}
              selectedDay={selectedDay}
              joiningDate={month.joiningDate}
              terminationDate={month.terminationDate}
              onSelectDay={setSelectedOverride}
            />
          </div>
        )}
      </div>

      <MobileTabBar
        app="profile"
        activeId="attendance"
        venueSlug={venue.slug}
        onSelectTab={onSelectTab}
      />
    </div>
  );
}

function daySummaryLabel(
  cell: MonthCell,
  day: MobileAttendanceDay | undefined,
  outsideEmployment = false,
) {
  const parts = [`${cell.day}`];
  if (outsideEmployment) {
    parts.push("Not employed");
    return parts.join(", ");
  }
  if (day?.rosterName) parts.push(day.rosterName);
  if (day?.clockIn) parts.push(`in ${formatAttendanceClock(day.clockIn)}`);
  if (day?.clockOut) parts.push(`out ${formatAttendanceClock(day.clockOut)}`);
  return parts.join(", ");
}

function MonthPicker({
  monthKey,
  currentMonthKey,
  onSelect,
  onClose,
}: {
  monthKey: string;
  currentMonthKey: string;
  onSelect: (monthKey: string) => void;
  onClose: () => void;
}) {
  const selectedYear = Number(monthKey.slice(0, 4));
  const selectedMonth = Number(monthKey.slice(5, 7));
  const [year, setYear] = useState(selectedYear);

  return (
    <div
      role="dialog"
      aria-label="Select month"
      className="rounded-xl border border-black/10 bg-white p-2 shadow-sm dark:border-white/12 dark:bg-[#1c1c1c]"
    >
      <div className="mb-1 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setYear((current) => current - 1)}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#3D421F] hover:bg-black/[0.04] dark:text-[CanvasText]"
          aria-label="Previous year"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="font-serif text-sm text-[#3D421F] dark:text-[CanvasText]">
          {year}
        </p>
        <button
          type="button"
          onClick={() => setYear((current) => current + 1)}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#3D421F] hover:bg-black/[0.04] dark:text-[CanvasText]"
          aria-label="Next year"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-4 gap-1">
        {MONTH_SHORT.map((label, index) => {
          const key = `${year}-${String(index + 1).padStart(2, "0")}`;
          const selected = year === selectedYear && index + 1 === selectedMonth;
          const current = key === currentMonthKey;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              aria-current={current ? "date" : undefined}
              aria-pressed={selected}
              className={cn(
                "h-8 rounded-md px-1 text-xs font-medium",
                selected
                  ? "bg-[var(--venue-primary,#818a40)] text-white"
                  : "text-[#3D421F] hover:bg-black/[0.04] dark:text-[CanvasText] dark:hover:bg-white/[0.08]",
                current &&
                  !selected &&
                  "bg-[var(--venue-primary,#818a40)]/15 font-semibold text-[var(--venue-primary,#818a40)] ring-1 ring-inset ring-[var(--venue-primary,#818a40)]",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="mt-1 w-full rounded-md py-1 text-[11px] text-black/45 dark:text-white/45"
      >
        Close
      </button>
    </div>
  );
}

function timeLabelKey(value: string): string {
  return value.replace(/[–—]/g, "-").replace(/\s+/g, "").toLowerCase();
}

function shiftAndHoursLabel(day: MobileAttendanceDay): string {
  const hours =
    day.scheduleStartTime && day.scheduleEndTime
      ? formatShiftRangeLabel(day.scheduleStartTime, day.scheduleEndTime)
      : day.scheduleTime;
  const shiftName = day.shiftName?.trim() || null;
  const roster = (day.rosterName ?? day.rosterLabel ?? "Unscheduled").trim();

  if (shiftName && hours && timeLabelKey(shiftName) !== timeLabelKey(hours)) {
    return `${shiftName} · ${hours}`;
  }
  if (hours) {
    return roster && roster !== hours ? `${roster} · ${hours}` : hours;
  }
  return shiftName || roster;
}

function PunchTag({ label }: { label: string }) {
  return (
    <span className="rounded bg-black/[0.08] px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#3D421F] dark:bg-white/12 dark:text-[CanvasText]">
      {label}
    </span>
  );
}

function WeekDetail({
  weekMonday,
  weekKeys,
  monthKey,
  byDate,
  selectedDay,
  joiningDate,
  terminationDate,
  onSelectDay,
}: {
  weekMonday: string;
  weekKeys: string[];
  monthKey: string;
  byDate: Map<string, MobileAttendanceDay>;
  selectedDay: string;
  joiningDate: string | null;
  terminationDate: string | null;
  onSelectDay: (iso: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-black/10 bg-black/[0.03] dark:border-white/12 dark:bg-white/[0.08]">
      <p className="border-b border-black/10 px-4 py-3 font-serif text-lg text-[#3D421F] dark:border-white/12 dark:text-[CanvasText]">
        Week {formatWeekHeading(weekMonday)}
      </p>
      <ul>
        {weekKeys.map((key) => {
          const day = byDate.get(key) ?? null;
          const selected = key === selectedDay;
          const outsideEmployment = isOutsideEmploymentWindow(
            key,
            joiningDate,
            terminationDate,
          );
          const punchIn = formatAttendanceClock(day?.clockIn);
          const punchOut = formatAttendanceClock(day?.clockOut);
          const hasPunch = Boolean(punchIn || punchOut);
          return (
            <li key={key} className="border-b border-black/5 last:border-b-0 dark:border-white/10">
              <button
                type="button"
                onClick={() => {
                  if (key.startsWith(monthKey)) onSelectDay(key);
                }}
                aria-pressed={selected}
                className={cn(
                  "flex w-full flex-col gap-1 px-4 py-2.5 text-left",
                  selected && !outsideEmployment && "bg-[var(--venue-primary,#818a40)]/12",
                  (!key.startsWith(monthKey) || outsideEmployment) && "opacity-60",
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      "text-sm font-semibold text-[#3D421F] dark:text-[CanvasText]",
                      outsideEmployment && "line-through",
                    )}
                  >
                    {formatWeekdayShort(key)}
                  </span>
                  {!outsideEmployment && day?.rosterLabel ? (
                    <span
                      className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                      style={
                        day.rosterBgColor
                          ? {
                              backgroundColor: day.rosterBgColor,
                              color: day.rosterTextColor ?? "#3D421F",
                            }
                          : undefined
                      }
                    >
                      {day.rosterAbbreviation ?? day.rosterLabel}
                    </span>
                  ) : null}
                </span>
                {outsideEmployment ? (
                  <span className="text-xs text-black/45 dark:text-white/45">
                    Not employed
                  </span>
                ) : day ? (
                  <>
                    <span className="text-xs text-[#3D421F] dark:text-[CanvasText]">
                      {shiftAndHoursLabel(day)}
                    </span>
                    {hasPunch ? (
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-black/55 dark:text-white/55">
                        <span className="inline-flex items-center gap-1">
                          <PunchTag label="In" />
                          {punchIn ?? "—"}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <PunchTag label="Out" />
                          {punchOut ?? "—"}
                        </span>
                        {day.totalHours != null ? (
                          <span>{formatHoursAsTime(day.totalHours)} hrs</span>
                        ) : null}
                      </span>
                    ) : (
                      <span className="text-xs text-black/55 dark:text-white/55">
                        No clock in / clock out
                      </span>
                    )}
                    {day.holidayName ? (
                      <span className="text-[11px] font-medium text-[#5b21b6]">
                        Public holiday · {day.holidayName}
                      </span>
                    ) : null}
                    {day.issue ? (
                      <span className="text-[11px] text-amber-800 dark:text-amber-300">
                        {day.issue}
                      </span>
                    ) : null}
                    {day.notes ? (
                      <span className="text-[11px] text-black/50 dark:text-white/50">
                        {day.notes}
                      </span>
                    ) : null}
                  </>
                ) : (
                  <span className="text-xs text-black/45 dark:text-white/45">
                    No schedule or attendance
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
