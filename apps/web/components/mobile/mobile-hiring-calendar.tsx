"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MobileHiringAppointment } from "@/lib/mobile/hiring-replies";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"] as const;
const MONTHS = [
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

function isoDay(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfGrid(year: number, month: number): Date {
  const first = new Date(year, month, 1);
  const weekday = (first.getDay() + 6) % 7;
  first.setDate(first.getDate() - weekday);
  return first;
}

function formatTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function formatDayHeading(iso: string) {
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function defaultSelectedDay(
  year: number,
  month: number,
  byDay: Map<string, MobileHiringAppointment[]>,
) {
  const today = isoDay(new Date());
  const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
  if (today.startsWith(prefix)) return today;
  const booked = [...byDay.keys()].filter((key) => key.startsWith(prefix)).sort();
  return booked[0] ?? `${prefix}-01`;
}

export function MobileHiringCalendar({
  appointments,
}: {
  appointments: MobileHiringAppointment[];
}) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [selectedDay, setSelectedDay] = useState(() => isoDay(now));
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const cells = useMemo(() => {
    const start = startOfGrid(year, month);
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [year, month]);

  const byDay = useMemo(() => {
    const map = new Map<string, MobileHiringAppointment[]>();
    for (const appointment of appointments) {
      const key = isoDay(new Date(appointment.startsAt));
      const list = map.get(key) ?? [];
      list.push(appointment);
      map.set(key, list);
    }
    return map;
  }, [appointments]);

  const todayKey = isoDay(now);
  const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}`;
  const monthCount = appointments.filter((item) =>
    isoDay(new Date(item.startsAt)).startsWith(monthPrefix),
  ).length;
  const dayItems = (byDay.get(selectedDay) ?? []).slice().sort((a, b) =>
    a.startsAt.localeCompare(b.startsAt),
  );
  const selected = dayItems.find((item) => item.id === selectedId) ?? null;

  function goMonth(delta: number) {
    const next = new Date(year, month + delta, 1);
    const nextYear = next.getFullYear();
    const nextMonth = next.getMonth();
    setYear(nextYear);
    setMonth(nextMonth);
    setSelectedDay(defaultSelectedDay(nextYear, nextMonth, byDay));
    setSelectedId(null);
  }

  return (
    <div className="mt-3 space-y-3">
      <div className="flex items-center justify-between gap-1 rounded-xl bg-[var(--venue-primary,#818a40)] px-1 py-1 text-white">
        <button
          type="button"
          onClick={() => goMonth(-1)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-white transition hover:bg-white/15"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="min-w-0 flex-1 text-center font-serif text-lg text-white">
          {MONTHS[month]} {year}
        </p>
        <button
          type="button"
          onClick={() => goMonth(1)}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-white transition hover:bg-white/15"
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <p className="px-1 text-xs text-black/45 dark:text-white/45">
        {monthCount === 1 ? "1 appointment" : `${monthCount} appointments`} this
        month
      </p>

      <div className="overflow-hidden rounded-xl border border-black/10 bg-white/75 dark:border-white/12 dark:bg-white/10">
        <div className="grid grid-cols-7 bg-black/[0.08] dark:bg-white/[0.08]">
          {WEEKDAYS.map((label, index) => (
            <div
              key={`${label}-${index}`}
              className="px-0.5 py-1.5 text-center text-[9px] font-semibold uppercase tracking-wide text-[#3D421F]/70 dark:text-white/55"
            >
              {label}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((date) => {
            const key = isoDay(date);
            const inMonth = date.getMonth() === month;
            const count = inMonth ? (byDay.get(key)?.length ?? 0) : 0;
            const isToday = key === todayKey;
            const selected = key === selectedDay && inMonth;
            return (
              <button
                key={key}
                type="button"
                disabled={!inMonth}
                aria-pressed={selected}
                aria-label={`${date.getDate()} ${MONTHS[month]}${
                  count
                    ? `, ${count} appointment${count === 1 ? "" : "s"}`
                    : ""
                }`}
                onClick={() => {
                  setSelectedDay(key);
                  setSelectedId(null);
                }}
                className={cn(
                  "flex min-h-[2.75rem] flex-col items-center gap-0 border-b border-r border-black/5 p-1 [&:nth-child(7n)]:border-r-0 dark:border-white/10",
                  !inMonth && "bg-black/[0.03] text-black/30 dark:bg-white/[0.04]",
                  inMonth && "hover:bg-[var(--venue-secondary,#F0F3DD)]/50",
                  selected && "bg-[var(--venue-primary)]/12",
                  isToday &&
                    inMonth &&
                    "relative z-[1] rounded-lg ring-2 ring-inset ring-[var(--venue-primary,#818a40)]",
                  selected &&
                    !isToday &&
                    "ring-1 ring-inset ring-[var(--venue-primary)]/40",
                )}
              >
                <span
                  className={cn(
                    "inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums",
                    selected
                      ? "bg-[var(--venue-primary)] text-white"
                      : isToday && inMonth
                        ? "text-[var(--venue-primary,#818a40)]"
                        : "text-[#3D421F] dark:text-[CanvasText]",
                    !inMonth && "text-black/30 dark:text-white/30",
                  )}
                >
                  {date.getDate()}
                </span>
                {count > 0 ? (
                  <span className="text-[9px] font-medium tabular-nums text-[#3D421F]/70 dark:text-white/55">
                    {count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {selected ? (
        <AppointmentDetail
          appointment={selected}
          onBack={() => setSelectedId(null)}
        />
      ) : (
        <div>
          <p className="px-1 text-sm font-medium text-[#3D421F] dark:text-[CanvasText]">
            {formatDayHeading(selectedDay)}
          </p>
          {dayItems.length === 0 ? (
            <p className="px-1 py-8 text-center text-sm text-black/45 dark:text-white/45">
              No interviews or meetings on this day.
            </p>
          ) : (
            <div className="mt-2 space-y-2">
              {dayItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-black/10 bg-white/75 px-3 py-2.5 text-left dark:border-white/12 dark:bg-white/10"
                >
                  <span className="w-12 shrink-0 text-sm font-medium tabular-nums text-[#3D421F] dark:text-[CanvasText]">
                    {formatTime(item.startsAt)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-[#3D421F] dark:text-[CanvasText]">
                      {item.applicantName}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-black/50 dark:text-white/50">
                      {item.format === "video" ? "Video call" : "In person"}
                      {item.formName ? ` · ${item.formName}` : ""}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AppointmentDetail({
  appointment,
  onBack,
}: {
  appointment: MobileHiringAppointment;
  onBack: () => void;
}) {
  const when = new Date(appointment.startsAt);
  const whenLabel = Number.isNaN(when.getTime())
    ? "—"
    : when.toLocaleString("en-GB", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

  return (
    <div className="rounded-2xl border border-black/10 bg-white/75 px-3 py-3 dark:border-white/12 dark:bg-white/10">
      <button
        type="button"
        onClick={onBack}
        className="text-sm font-medium text-[var(--venue-primary,#818a40)]"
      >
        Back to day
      </button>
      <h2 className="mt-2 font-serif text-xl font-semibold text-[#3D421F] dark:text-[CanvasText]">
        {appointment.applicantName}
      </h2>
      <p className="mt-1 text-sm text-[#3D421F] dark:text-[CanvasText]">{whenLabel}</p>
      <p className="mt-1 text-sm text-black/55 dark:text-white/55">
        {appointment.format === "video" ? "Video call" : "In person"}
        {appointment.formName ? ` · ${appointment.formName}` : ""}
      </p>
      {appointment.format === "video" && appointment.meetingLink ? (
        <a
          href={appointment.meetingLink}
          className="mt-2 block break-all text-sm text-[var(--venue-primary,#818a40)] underline"
          target="_blank"
          rel="noreferrer"
        >
          {appointment.meetingLink}
        </a>
      ) : null}
      {appointment.format === "in_person" && appointment.locationDetails ? (
        <p className="mt-2 text-sm text-[#3D421F] dark:text-[CanvasText]">
          {appointment.locationDetails}
        </p>
      ) : null}
      {appointment.applicantEmail ? (
        <p className="mt-2 text-sm text-black/55 dark:text-white/55">
          {appointment.applicantEmail}
        </p>
      ) : null}
    </div>
  );
}
