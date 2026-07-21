"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { LeaveCalendarDialog } from "@/components/hr/leave-calendar-dialog";
import {
  buildMonthGrid,
  leaveCalendarStatusLabel,
  type LeaveCalendarEvent,
} from "@/lib/hr/leave";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

type LeaveTypeOption = {
  code: string;
  name: string;
  leaveTypeId: string | null;
  bgColor: string;
  textColor: string;
  borderColor: string;
};

type LeaveCalendarClientProps = {
  year: number;
  month: number;
  events: LeaveCalendarEvent[];
  leaveTypes: LeaveTypeOption[];
  departments: Array<{ id: string; name: string }>;
  canManage: boolean;
  error?: string | null;
};

function firstName(fullName: string): string {
  const part = fullName.trim().split(/\s+/)[0];
  return part || fullName;
}

type MonthCell = {
  key: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
};

type LaneSegment = "single" | "start" | "middle" | "end" | "week-start" | "week-end";

type DayLaneSlot = {
  event: LeaveCalendarEvent;
  lane: number;
  segment: LaneSegment;
  showLabel: boolean;
};

/** Stable vertical lanes so a multi-day leave lines up across the week. */
function buildWeekLanes(
  weekCells: MonthCell[],
  eventsByDay: Map<string, LeaveCalendarEvent[]>,
): { slotsByDay: Map<string, DayLaneSlot[]>; laneCount: number } {
  const weekKeys = weekCells.map((c) => c.key);
  const eventsInWeek = new Map<string, LeaveCalendarEvent>();

  for (const key of weekKeys) {
    for (const event of eventsByDay.get(key) ?? []) {
      eventsInWeek.set(event.id, event);
    }
  }

  const ordered = Array.from(eventsInWeek.values()).sort((a, b) => {
    if (a.fromDate !== b.fromDate) return a.fromDate.localeCompare(b.fromDate);
    if (a.toDate !== b.toDate) return b.toDate.localeCompare(a.toDate);
    return a.fullName.localeCompare(b.fullName) || a.id.localeCompare(b.id);
  });

  const laneByEvent = new Map<string, number>();
  /** Inclusive end date currently occupying each lane. */
  const laneEnds: string[] = [];

  for (const event of ordered) {
    let lane = laneEnds.findIndex((end) => end < event.fromDate);
    if (lane < 0) {
      lane = laneEnds.length;
      laneEnds.push(event.toDate);
    } else {
      laneEnds[lane] = event.toDate;
    }
    laneByEvent.set(event.id, lane);
  }

  const slotsByDay = new Map<string, DayLaneSlot[]>();
  for (const key of weekKeys) {
    const dayEvents = eventsByDay.get(key) ?? [];
    const slots: DayLaneSlot[] = dayEvents
      .map((event) => {
        const lane = laneByEvent.get(event.id) ?? 0;
        const isStart = event.fromDate === key;
        const isEnd = event.toDate === key;
        const multi = event.fromDate !== event.toDate;
        const weekStart = key === weekKeys[0];
        const weekEnd = key === weekKeys[weekKeys.length - 1];

        let segment: LaneSegment = "single";
        if (!multi || (isStart && isEnd)) {
          segment = "single";
        } else if (isStart) {
          segment = "start";
        } else if (isEnd) {
          segment = "end";
        } else if (weekStart) {
          segment = "week-start";
        } else if (weekEnd) {
          segment = "week-end";
        } else {
          segment = "middle";
        }

        return {
          event,
          lane,
          segment,
          showLabel: isStart || segment === "week-start",
        };
      })
      .sort((a, b) => a.lane - b.lane);

    slotsByDay.set(key, slots);
  }

  return { slotsByDay, laneCount: laneEnds.length };
}

export function LeaveCalendarClient({
  year,
  month,
  events,
  leaveTypes,
  departments,
  canManage,
  error,
}: LeaveCalendarClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [departmentId, setDepartmentId] = useState("");
  const [selected, setSelected] = useState<LeaveCalendarEvent | null>(null);

  const typeByCode = useMemo(() => {
    const map = new Map(leaveTypes.map((t) => [t.code, t] as const));
    return map;
  }, [leaveTypes]);

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      // Empty selection → nothing on the calendar until types are chosen.
      if (selectedCodes.length === 0) return false;
      if (!selectedCodes.includes(event.labelCode)) return false;
      if (departmentId && event.departmentId !== departmentId) {
        return false;
      }
      return true;
    });
  }, [events, selectedCodes, departmentId]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, LeaveCalendarEvent[]>();
    for (const event of filteredEvents) {
      // Index every day the leave covers that falls in the visible month window.
      const from = event.fromDate;
      const to = event.toDate;
      const start = new Date(
        Number(from.slice(0, 4)),
        Number(from.slice(5, 7)) - 1,
        Number(from.slice(8, 10)),
      );
      const end = new Date(
        Number(to.slice(0, 4)),
        Number(to.slice(5, 7)) - 1,
        Number(to.slice(8, 10)),
      );
      for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
        const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
        const list = map.get(key) ?? [];
        list.push(event);
        map.set(key, list);
      }
    }
    return map;
  }, [filteredEvents]);

  const cells = useMemo(
    () => buildMonthGrid(year, month - 1),
    [year, month],
  );

  const weeks = useMemo(() => {
    const rows: MonthCell[][] = [];
    for (let i = 0; i < cells.length; i += 7) {
      rows.push(cells.slice(i, i + 7));
    }
    return rows.map((weekCells) => {
      const { slotsByDay, laneCount } = buildWeekLanes(weekCells, eventsByDay);
      return { weekCells, slotsByDay, laneCount };
    });
  }, [cells, eventsByDay]);

  function navigateMonth(delta: number) {
    const d = new Date(year, month - 1 + delta, 1);
    const params = new URLSearchParams(searchParams.toString());
    params.set("year", String(d.getFullYear()));
    params.set("month", String(d.getMonth() + 1));
    router.push(`?${params.toString()}`);
  }

  function goToday() {
    const now = new Date();
    const params = new URLSearchParams(searchParams.toString());
    params.set("year", String(now.getFullYear()));
    params.set("month", String(now.getMonth() + 1));
    router.push(`?${params.toString()}`);
  }

  function toggleType(code: string) {
    setSelectedCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  }

  const visibleCount = filteredEvents.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => navigateMonth(-1)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-black/10 bg-white text-[#3D421F] transition hover:bg-black/[0.03]"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <h2 className="min-w-[11rem] text-center font-serif text-xl text-[#3D421F]">
            {MONTH_NAMES[month - 1]} {year}
          </h2>
          <button
            type="button"
            onClick={() => navigateMonth(1)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-black/10 bg-white text-[#3D421F] transition hover:bg-black/[0.03]"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={goToday}
            className="ml-1 h-9 rounded-md border border-black/10 bg-white px-3 text-sm font-medium text-[#3D421F] transition hover:bg-black/[0.03]"
          >
            Today
          </button>
        </div>
        <p className="text-sm text-black/50">
          {visibleCount} leave period{visibleCount === 1 ? "" : "s"}
        </p>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-black/45">
            Leave type
          </span>
          <button
            type="button"
            onClick={() => setSelectedCodes([])}
            disabled={selectedCodes.length === 0}
            className={cn(
              "h-7 shrink-0 rounded-md border px-2.5 text-xs font-medium transition",
              selectedCodes.length === 0
                ? "cursor-default border-transparent text-black/30"
                : "border-black/10 bg-white text-[#3D421F] hover:bg-black/[0.03]",
            )}
          >
            Clear selection
          </button>
        </div>
        <div className="-mx-1 flex flex-nowrap items-center gap-1.5 overflow-x-auto px-1 pb-0.5">
          {leaveTypes.map((type) => {
            const selected = selectedCodes.includes(type.code);
            return (
              <button
                key={type.code}
                type="button"
                onClick={() => toggleType(type.code)}
                aria-pressed={selected}
                className={cn(
                  "inline-flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-xs font-medium whitespace-nowrap transition",
                  selected
                    ? "ring-2 ring-[var(--venue-primary,#818a40)]/35 opacity-100"
                    : "opacity-40 hover:opacity-70",
                )}
                style={{
                  backgroundColor: type.bgColor,
                  color: type.textColor,
                  borderColor: type.borderColor,
                }}
                title={type.name}
              >
                <span className="font-mono">{type.code}</span>
                <span>{type.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {departments.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <label
            htmlFor="leave-cal-dept"
            className="text-xs font-medium uppercase tracking-wide text-black/45"
          >
            Department
          </label>
          <select
            id="leave-cal-dept"
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            className="h-8 rounded-md border border-black/10 bg-white px-2.5 text-sm text-[#3D421F] outline-none focus:border-[var(--venue-primary,#818a40)]/50"
          >
            <option value="">All departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {error}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-black/10 bg-white">
        <div className="grid grid-cols-7 border-b border-black/10 bg-black/[0.02]">
          {WEEKDAYS.map((d) => (
            <div
              key={d}
              className="px-2 py-2 text-center text-[11px] font-medium uppercase tracking-wide text-black/45"
            >
              {d}
            </div>
          ))}
        </div>
        <div>
          {weeks.map(({ weekCells, slotsByDay, laneCount }, weekIndex) => (
            <div
              key={weekCells[0]?.key ?? weekIndex}
              className="grid grid-cols-7 items-stretch"
            >
              {weekCells.map((cell) => {
                const slots = slotsByDay.get(cell.key) ?? [];
                const byLane = new Map(slots.map((s) => [s.lane, s] as const));
                return (
                  <div
                    key={cell.key}
                    className={cn(
                      "flex min-h-[6.5rem] flex-col border-b border-r border-black/5",
                      !cell.inMonth && "bg-black/[0.015]",
                      cell.isToday && "bg-[var(--venue-secondary,#F0F3DD)]/40",
                    )}
                  >
                    <div className="mb-1 px-1.5 pt-1.5">
                      <span
                        className={cn(
                          "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs tabular-nums",
                          cell.isToday
                            ? "bg-[var(--venue-primary,#818a40)] font-semibold text-white"
                            : cell.inMonth
                              ? "text-[#3D421F]"
                              : "text-black/30",
                        )}
                      >
                        {cell.day}
                      </span>
                    </div>
                    <div
                      className="relative flex min-h-0 flex-1 flex-col pb-1.5"
                      style={{
                        minHeight: Math.max(laneCount, 1) * 22 + 4,
                      }}
                    >
                      {Array.from({ length: Math.max(laneCount, 0) }, (_, lane) => {
                        const slot = byLane.get(lane);
                        if (!slot) {
                          return (
                            <div
                              key={`empty-${lane}`}
                              className="h-[22px] shrink-0"
                              aria-hidden
                            />
                          );
                        }
                        const type = typeByCode.get(slot.event.labelCode);
                        const { segment, showLabel, event } = slot;
                        return (
                          <div
                            key={`${event.id}-${cell.key}`}
                            className="relative h-[22px] shrink-0"
                          >
                            <button
                              type="button"
                              onClick={() => setSelected(event)}
                              className={cn(
                                "absolute inset-y-0.5 z-[1] flex items-center gap-1 overflow-hidden text-left text-[11px] leading-tight transition hover:brightness-95 hover:z-[2]",
                                // Bleed across the day divider so multi-day leave reads as one bar.
                                segment === "single" &&
                                  "left-1.5 right-1.5 rounded-md border",
                                segment === "start" &&
                                  "left-1.5 -right-px rounded-l-md rounded-r-none border border-r-0",
                                segment === "end" &&
                                  "left-0 right-1.5 rounded-r-md rounded-l-none border border-l-0",
                                segment === "middle" &&
                                  "left-0 -right-px rounded-none border-y border-x-0",
                                segment === "week-start" &&
                                  "left-1.5 -right-px rounded-l-md rounded-r-none border border-r-0",
                                segment === "week-end" &&
                                  "left-0 right-1.5 rounded-r-md rounded-l-none border border-l-0",
                                showLabel ? "px-1.5" : "px-0",
                              )}
                              style={{
                                backgroundColor: type?.bgColor ?? "#e5e5e5",
                                color: type?.textColor ?? "#404040",
                                borderColor: type?.borderColor ?? "#d4d4d4",
                              }}
                              title={`${event.fullName} · ${type?.name ?? event.labelCode} · ${leaveCalendarStatusLabel(event.status)}`}
                            >
                              {showLabel ? (
                                <>
                                  <span className="shrink-0 font-mono font-medium">
                                    {event.labelCode}
                                  </span>
                                  <span className="truncate">
                                    {firstName(event.fullName)}
                                  </span>
                                </>
                              ) : (
                                <span className="sr-only">
                                  {event.labelCode} {firstName(event.fullName)}
                                </span>
                              )}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {filteredEvents.length === 0 ? (
        <p className="text-center text-sm text-black/50">
          {selectedCodes.length === 0
            ? "Select one or more leave types to show them on the calendar."
            : `No leave on the schedule for this month${departmentId ? " with the current filters" : ""}.`}
        </p>
      ) : null}

      <LeaveCalendarDialog
        key={selected?.id ?? "closed"}
        open={Boolean(selected)}
        event={selected}
        leaveTypes={leaveTypes}
        canManage={canManage}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
