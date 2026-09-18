"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { HiringDialog } from "@/components/hr/hiring-dialog";
import { cn } from "@/lib/utils";
import type { HiringAppointment } from "@/lib/hr/hiring/types";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
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

export function HiringCalendarClient({
  appointments,
}: {
  appointments: HiringAppointment[];
}) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selected, setSelected] = useState<HiringAppointment | null>(null);

  const cells = useMemo(() => {
    const start = startOfGrid(year, month);
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [year, month]);

  const byDay = useMemo(() => {
    const map = new Map<string, HiringAppointment[]>();
    for (const appointment of appointments) {
      const key = isoDay(new Date(appointment.starts_at));
      const list = map.get(key) ?? [];
      list.push(appointment);
      map.set(key, list);
    }
    return map;
  }, [appointments]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-serif text-2xl text-[#3D421F]">
          {MONTHS[month]} {year}
        </h2>
        <div className="flex gap-1">
          <button
            type="button"
            className="rounded-md p-2 hover:bg-black/5"
            aria-label="Previous month"
            onClick={() => {
              if (month === 0) {
                setYear(year - 1);
                setMonth(11);
              } else setMonth(month - 1);
            }}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="rounded-md p-2 hover:bg-black/5"
            aria-label="Next month"
            onClick={() => {
              if (month === 11) {
                setYear(year + 1);
                setMonth(0);
              } else setMonth(month + 1);
            }}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <Card className="overflow-hidden p-2">
        <div className="grid grid-cols-7 text-center text-xs font-semibold uppercase tracking-wide text-black/45">
          {WEEKDAYS.map((day) => (
            <div key={day} className="py-2">
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px bg-black/5">
          {cells.map((date) => {
            const key = isoDay(date);
            const inMonth = date.getMonth() === month;
            const items = byDay.get(key) ?? [];
            const isToday = key === isoDay(today);
            return (
              <div
                key={key}
                className={cn(
                  "min-h-24 bg-white p-1.5",
                  !inMonth && "bg-black/[0.02] text-black/30",
                  isToday && "ring-1 ring-inset ring-[var(--venue-primary,#818a40)]",
                )}
              >
                <p className="text-xs font-medium">{date.getDate()}</p>
                <div className="mt-1 space-y-1">
                  {items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="block w-full truncate rounded bg-[var(--venue-primary,#818a40)]/15 px-1 py-0.5 text-left text-[11px] text-[#3D421F]"
                      onClick={() => setSelected(item)}
                    >
                      {new Date(item.starts_at).toLocaleTimeString("en-GB", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      {item.applicant_name || "Candidate"}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <HiringDialog
        open={Boolean(selected)}
        title={selected?.applicant_name || "Appointment"}
        onClose={() => setSelected(null)}
      >
        {selected ? (
          <div className="space-y-2 text-sm text-[#3D421F]">
            <p>
              {new Date(selected.starts_at).toLocaleString("en-GB", {
                weekday: "long",
                day: "2-digit",
                month: "long",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
            <p>
              {selected.format === "video" ? "Video call" : "In person"}
              {selected.form_name ? ` · ${selected.form_name}` : ""}
            </p>
            {selected.format === "video" && selected.meeting_link ? (
              <a
                href={selected.meeting_link}
                className="text-[var(--venue-primary,#818a40)] underline"
                target="_blank"
                rel="noreferrer"
              >
                {selected.meeting_link}
              </a>
            ) : null}
            {selected.format === "in_person" && selected.location_details ? (
              <p>{selected.location_details}</p>
            ) : null}
            {selected.applicant_email ? <p>{selected.applicant_email}</p> : null}
          </div>
        ) : null}
      </HiringDialog>
    </div>
  );
}
