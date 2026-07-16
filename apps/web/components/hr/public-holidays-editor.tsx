"use client";

import { Check, Pencil, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  deletePublicHoliday,
  upsertPublicHoliday,
} from "@/lib/actions/hr";
import type { PublicHoliday } from "@/lib/hr/types";
import { cn } from "@/lib/utils";

const LIGHT_INPUT =
  "border-black/15 bg-white text-black placeholder:text-black/40 focus-visible:ring-offset-white";

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

type PublicHolidaysEditorProps = {
  holidays: PublicHoliday[];
  initialYear: number;
};

function formatDisplayDate(dateKey: string) {
  const [y, m, d] = dateKey.split("-").map(Number);
  if (!y || !m || !d) return dateKey;
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function toDateKey(year: number, monthIndex: number, day: number) {
  const m = String(monthIndex + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

function daysInMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** Monday-first weekday index (0 = Mon … 6 = Sun). */
function mondayFirstIndex(year: number, monthIndex: number, day: number) {
  const js = new Date(year, monthIndex, day).getDay();
  return js === 0 ? 6 : js - 1;
}

export function PublicHolidaysEditor({
  holidays,
  initialYear,
}: PublicHolidaysEditorProps) {
  const [year, setYear] = useState(initialYear);
  const [rows, setRows] = useState(holidays);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftDate, setDraftDate] = useState(`${initialYear}-01-01`);
  const [draftName, setDraftName] = useState("");
  const [, startTransition] = useTransition();

  useEffect(() => {
    setRows(holidays);
  }, [holidays]);

  const yearHolidays = useMemo(
    () => rows.filter((h) => h.holidayDate.startsWith(`${year}-`)),
    [rows, year],
  );

  const holidayByDate = useMemo(() => {
    const map = new Map<string, PublicHoliday>();
    for (const h of yearHolidays) map.set(h.holidayDate, h);
    return map;
  }, [yearHolidays]);

  function fillForm(dateKey: string) {
    setEditingId(null);
    setDraftDate(dateKey);
    setDraftName(holidayByDate.get(dateKey)?.name ?? "");
  }

  function saveNew() {
    const name = draftName.trim();
    if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(draftDate)) return;
    const formData = new FormData();
    formData.set("holiday_date", draftDate);
    formData.set("name", name);
    const existing = rows.find((h) => h.holidayDate === draftDate);
    if (existing) formData.set("id", existing.id);

    startTransition(async () => {
      await upsertPublicHoliday(formData);
      setRows((current) => {
        const next = current.filter((h) => h.holidayDate !== draftDate);
        next.push({
          id: existing?.id ?? `temp:${draftDate}`,
          holidayDate: draftDate,
          name,
        });
        next.sort((a, b) => a.holidayDate.localeCompare(b.holidayDate));
        return next;
      });
      setDraftName("");
    });
  }

  function removeHoliday(id: string) {
    startTransition(async () => {
      await deletePublicHoliday(id);
      setRows((current) => current.filter((h) => h.id !== id));
    });
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-violet-200 bg-violet-50/80 px-3 py-2.5 text-xs leading-relaxed text-violet-950">
        <p className="font-medium text-violet-900">Leave balance rule</p>
        <p className="mt-1 text-violet-900/80">
          If an employee <span className="font-medium">worked</span> on a
          public holiday, their PH allowance increases. If they{" "}
          <span className="font-medium">did not work</span> that day, no
          extra days are added. This feeds future leave balance calculations.
        </p>
        <p className="mt-1.5 text-violet-900/70">
          Marked days highlight purple on the Schedules roster.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => setYear((y) => y - 1)}
        >
          ←
        </Button>
        <span className="min-w-[4.5rem] text-center font-serif text-lg text-[#3D421F]">
          {year}
        </span>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => setYear((y) => y + 1)}
        >
          →
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-black/10 bg-black/[0.02] p-3">
        <label className="space-y-1 text-xs text-black/55">
          Date
          <Input
            type="date"
            value={draftDate}
            onChange={(e) => setDraftDate(e.target.value)}
            className={cn("h-9 w-[11rem]", LIGHT_INPUT)}
          />
        </label>
        <label className="min-w-[12rem] flex-1 space-y-1 text-xs text-black/55">
          Name
          <Input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder="e.g. National Day"
            className={cn("h-9", LIGHT_INPUT)}
          />
        </label>
        <Button
          type="button"
          size="sm"
          className="gap-1"
          onClick={saveNew}
          disabled={!draftName.trim()}
        >
          <Check className="h-3.5 w-3.5" aria-hidden />
          Save
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MONTHS.map((monthName, monthIndex) => {
          const total = daysInMonth(year, monthIndex);
          const lead = mondayFirstIndex(year, monthIndex, 1);
          const cells: Array<number | null> = [
            ...Array.from({ length: lead }, () => null),
            ...Array.from({ length: total }, (_, i) => i + 1),
          ];
          while (cells.length % 7 !== 0) cells.push(null);

          return (
            <div
              key={monthName}
              className="rounded-lg border border-black/10 bg-white p-3"
            >
              <h3 className="mb-2 font-serif text-sm text-[#3D421F]">
                {monthName}
              </h3>
              <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-medium uppercase tracking-wide text-black/40">
                {WEEKDAYS.map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </div>
              <div className="mt-1 grid grid-cols-7 gap-0.5">
                {cells.map((day, idx) => {
                  if (day == null) {
                    return <span key={`e-${idx}`} className="h-7" />;
                  }
                  const dateKey = toDateKey(year, monthIndex, day);
                  const holiday = holidayByDate.get(dateKey);
                  const selected = draftDate === dateKey;
                  return (
                    <button
                      key={dateKey}
                      type="button"
                      title={
                        holiday
                          ? `${holiday.name} — click to edit`
                          : `Mark ${dateKey} as public holiday`
                      }
                      onClick={() => fillForm(dateKey)}
                      className={cn(
                        "flex h-7 items-center justify-center rounded text-xs tabular-nums transition-colors",
                        holiday
                          ? "bg-[#ede9fe] font-semibold text-[#5b21b6]"
                          : "text-black/70 hover:bg-black/[0.04]",
                        selected
                          ? "outline outline-2 outline-offset-[-1px] outline-[#5b21b6]"
                          : holiday
                            ? "ring-1 ring-[#ddd6fe]"
                            : null,
                      )}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="space-y-2">
        <h3 className="font-serif text-base text-[#3D421F]">
          Holidays in {year}
          <span className="ml-2 text-sm font-sans font-normal text-black/45">
            · {yearHolidays.length}{" "}
            {yearHolidays.length === 1 ? "day" : "days"}
          </span>
        </h3>
        {yearHolidays.length === 0 ? (
          <p className="text-sm text-black/45">
            No public holidays defined for {year}. Enter a date and name
            above, or click a day on the calendar.
          </p>
        ) : (
          <ul className="divide-y divide-black/5 rounded-lg border border-black/10">
            {yearHolidays.map((item) => (
              <HolidayRow
                key={item.id}
                item={item}
                editing={editingId === item.id}
                onEdit={() => {
                  setEditingId(item.id);
                  setDraftDate(item.holidayDate);
                  setDraftName(item.name);
                }}
                onCancel={() => setEditingId(null)}
                onSaved={(next) => {
                  setRows((current) =>
                    current
                      .map((row) => (row.id === next.id ? next : row))
                      .sort((a, b) =>
                        a.holidayDate.localeCompare(b.holidayDate),
                      ),
                  );
                  setEditingId(null);
                }}
                onDelete={() => removeHoliday(item.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function HolidayRow({
  item,
  editing,
  onEdit,
  onCancel,
  onSaved,
  onDelete,
}: {
  item: PublicHoliday;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSaved: (next: PublicHoliday) => void;
  onDelete: () => void;
}) {
  const [date, setDate] = useState(item.holidayDate);
  const [name, setName] = useState(item.name);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setDate(item.holidayDate);
    setName(item.name);
  }, [item]);

  if (!editing) {
    return (
      <li className="flex items-center gap-3 px-3 py-2.5">
        <span className="inline-flex h-6 min-w-[2.25rem] items-center justify-center rounded bg-[#ede9fe] px-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#5b21b6]">
          PH
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-black/85">
            {item.name}
          </p>
          <p className="text-xs text-black/45">
            {formatDisplayDate(item.holidayDate)}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0"
          onClick={onEdit}
          aria-label={`Edit ${item.name}`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0 text-red-700 hover:bg-red-50 hover:text-red-800"
          onClick={onDelete}
          aria-label={`Delete ${item.name}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-end gap-2 bg-black/[0.02] px-3 py-2.5">
      <label className="space-y-1 text-xs text-black/55">
        Date
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className={cn("h-9 w-[11rem]", LIGHT_INPUT)}
        />
      </label>
      <label className="min-w-[10rem] flex-1 space-y-1 text-xs text-black/55">
        Name
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={cn("h-9", LIGHT_INPUT)}
        />
      </label>
      <Button
        type="button"
        size="sm"
        className="gap-1"
        disabled={!name.trim()}
        onClick={() => {
          const formData = new FormData();
          formData.set("id", item.id);
          formData.set("holiday_date", date);
          formData.set("name", name.trim());
          startTransition(async () => {
            await upsertPublicHoliday(formData);
            onSaved({
              id: item.id,
              holidayDate: date,
              name: name.trim(),
            });
          });
        }}
      >
        <Check className="h-3.5 w-3.5" aria-hidden />
        Save
      </Button>
      <Button type="button" size="sm" variant="secondary" onClick={onCancel}>
        <X className="h-3.5 w-3.5" aria-hidden />
      </Button>
    </li>
  );
}
