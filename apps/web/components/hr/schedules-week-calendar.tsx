"use client";

import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { ChevronLeft, ChevronRight, Eraser, X } from "lucide-react";
import { WorkingStatusBadge } from "@/components/hr/working-status-badge";
import { Button } from "@/components/ui/button";
import {
  listScheduleDaysForRange,
  saveScheduleDayChanges,
} from "@/lib/actions/hr";
import {
  formatWeekRangeLabel,
  getMondayForWeekOffset,
  getScheduleDayLabel,
  getWeekDayColumns,
  scheduleCellKey,
  scheduleDayLabelStyle,
  type ScheduleDayLabel,
  type ScheduleStaffRow,
} from "@/lib/hr/schedules";
import { cn } from "@/lib/utils";

type SchedulesWeekCalendarProps = {
  departmentLabel: string;
  staff: ScheduleStaffRow[];
  labels: ScheduleDayLabel[];
  canEdit?: boolean;
};

type SelectedCell = {
  key: string;
  staffId: string;
  dateKey: string;
};

/** Draft label for a cell; `null` means clear the day on save. */
type DraftMap = Record<string, string | null>;

type DragLabelPayload = {
  key: string;
  staffId: string;
  dateKey: string;
  labelCode: string;
};

const DRAG_MIME = "application/x-ss-ops-schedule-label";

function reconcileDraft(
  drafts: DraftMap,
  saved: Record<string, string>,
  key: string,
  labelCode: string | null,
): DraftMap {
  const next = { ...drafts };
  const savedValue = saved[key] ?? null;
  if (labelCode === savedValue) delete next[key];
  else next[key] = labelCode;
  return next;
}

export function SchedulesWeekCalendar({
  departmentLabel,
  staff,
  labels,
  canEdit = false,
}: SchedulesWeekCalendarProps) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<DraftMap>({});
  const [selected, setSelected] = useState<Map<string, SelectedCell>>(
    () => new Map(),
  );
  const [isPainting, setIsPainting] = useState(false);
  const [paintMode, setPaintMode] = useState<"add" | "remove">("add");
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const suppressClickRef = useRef(false);
  const [, startTransition] = useTransition();

  const monday = useMemo(
    () => getMondayForWeekOffset(weekOffset),
    [weekOffset],
  );
  const days = useMemo(() => getWeekDayColumns(monday), [monday]);
  const rangeLabel = formatWeekRangeLabel(monday);
  const fromDate = days[0]?.key ?? "";
  const toDate = days[6]?.key ?? "";
  const staffIdsKey = staff.map((s) => s.id).join(",");
  const knownCodes = useMemo(
    () => new Set(labels.map((label) => label.code)),
    [labels],
  );
  const selectedCount = selected.size;
  const draftEntries = useMemo(() => Object.entries(drafts), [drafts]);
  const dirtyCount = draftEntries.length;

  const displayAssignments = useMemo(() => {
    const next: Record<string, string | null> = { ...saved };
    for (const [key, value] of draftEntries) {
      next[key] = value;
    }
    return next;
  }, [saved, draftEntries]);

  const loadWeek = useEffectEvent(async () => {
    const staffIds = staffIdsKey ? staffIdsKey.split(",") : [];
    if (!fromDate || !toDate || staffIds.length === 0) {
      setSaved({});
      return;
    }

    const result = await listScheduleDaysForRange({
      staffIds,
      fromDate,
      toDate,
    });

    const next: Record<string, string> = {};
    for (const day of result.days ?? []) {
      if (!knownCodes.has(day.label_code) && day.label_code !== "LP") continue;
      const code = day.label_code === "LP" ? "AL" : day.label_code;
      if (!knownCodes.has(code)) continue;
      next[scheduleCellKey(day.staff_id, day.work_date)] = code;
    }
    setSaved(next);
  });

  useEffect(() => {
    void loadWeek();
  }, [fromDate, toDate, staffIdsKey, knownCodes]);

  useEffect(() => {
    setSelected(new Map());
    setDrafts({});
    setDraggingKey(null);
    setDropTargetKey(null);
  }, [weekOffset, departmentLabel]);

  useEffect(() => {
    function stopPaint() {
      setIsPainting(false);
    }
    window.addEventListener("mouseup", stopPaint);
    window.addEventListener("blur", stopPaint);
    return () => {
      window.removeEventListener("mouseup", stopPaint);
      window.removeEventListener("blur", stopPaint);
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setSelected(new Map());
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function paintCell(staffId: string, dateKey: string, mode: "add" | "remove") {
    const key = scheduleCellKey(staffId, dateKey);
    setSelected((current) => {
      const next = new Map(current);
      if (mode === "remove") next.delete(key);
      else next.set(key, { key, staffId, dateKey });
      return next;
    });
  }

  function toggleCell(staffId: string, dateKey: string) {
    const key = scheduleCellKey(staffId, dateKey);
    const removing = selected.has(key);
    setPaintMode(removing ? "remove" : "add");
    setIsPainting(true);
    paintCell(staffId, dateKey, removing ? "remove" : "add");
  }

  function toggleSelectOnly(staffId: string, dateKey: string) {
    const key = scheduleCellKey(staffId, dateKey);
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(key)) next.delete(key);
      else next.set(key, { key, staffId, dateKey });
      return next;
    });
  }

  /** Stage a label on the current selection only (no DB write). */
  function stageLabel(labelCode: string | null) {
    if (!canEdit || selectedCount === 0) return;

    setDrafts((current) => {
      let next = current;
      for (const cell of selected.values()) {
        next = reconcileDraft(next, saved, cell.key, labelCode);
      }
      return next;
    });
    setSelected(new Map());
    setError(null);
  }

  /** Stage clearing every day this week for one staff member (no DB write). */
  function stageClearWeek(staffId: string) {
    if (!canEdit) return;

    setDrafts((current) => {
      let next = current;
      for (const day of days) {
        const key = scheduleCellKey(staffId, day.key);
        next = reconcileDraft(next, saved, key, null);
      }
      return next;
    });
    setSelected((current) => {
      const next = new Map(current);
      for (const day of days) {
        next.delete(scheduleCellKey(staffId, day.key));
      }
      return next;
    });
    setError(null);
  }

  /** Move a label from one day cell to another (draft only). */
  function stageMoveLabel(
    from: DragLabelPayload,
    toStaffId: string,
    toDateKey: string,
  ) {
    const toKey = scheduleCellKey(toStaffId, toDateKey);
    if (from.key === toKey) return;

    const movingCode = from.labelCode;
    const targetCode = displayAssignments[toKey] ?? null;

    setDrafts((current) => {
      let next = reconcileDraft(current, saved, toKey, movingCode);
      // Swap if the target already had a label; otherwise clear the source.
      next = reconcileDraft(next, saved, from.key, targetCode);
      return next;
    });
    setSelected(new Map());
    setError(null);
  }

  function discardDrafts() {
    setDrafts({});
    setError(null);
  }

  function saveDrafts() {
    if (!canEdit || dirtyCount === 0) return;

    const changes = draftEntries.map(([key, labelCode]) => {
      const [staffId, dateKey] = key.split(":");
      return { staffId, workDate: dateKey, labelCode };
    });

    setPending(true);
    setError(null);

    startTransition(async () => {
      const result = await saveScheduleDayChanges({ changes });
      setPending(false);
      if (result.error) {
        setError(result.error);
        return;
      }

      setSaved((current) => {
        const next = { ...current };
        for (const [key, value] of draftEntries) {
          if (value) next[key] = value;
          else delete next[key];
        }
        return next;
      });
      setDrafts({});
      setSelected(new Map());
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-black/55">
          {departmentLabel} roster · week of{" "}
          <span className="font-medium text-[#3D421F]">{rangeLabel}</span>
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setWeekOffset((o) => o - 1)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-black/10 bg-white/70 text-[#3D421F] transition-colors hover:bg-white"
            aria-label="Previous week"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setWeekOffset(0)}
            disabled={weekOffset === 0}
            className={cn(
              "h-9 rounded-lg border px-3 text-xs font-medium uppercase tracking-wide transition-colors",
              weekOffset === 0
                ? "cursor-default border-transparent text-black/35"
                : "border-black/10 bg-white/70 text-[#3D421F] hover:bg-white",
            )}
          >
            This week
          </button>
          <button
            type="button"
            onClick={() => setWeekOffset((o) => o + 1)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-black/10 bg-white/70 text-[#3D421F] transition-colors hover:bg-white"
            aria-label="Next week"
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </p>
      ) : null}

      {canEdit ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
          <div className="min-w-0 flex-1 rounded-lg border border-[var(--venue-primary)]/25 bg-[var(--venue-primary)]/8 p-3">
            <div className="mb-2 min-w-0 space-y-1">
              <p className="text-sm font-medium text-[#3D421F]">
                {selectedCount > 0
                  ? `${selectedCount} day${selectedCount === 1 ? "" : "s"} selected — pick a label (not saved yet)`
                  : "Roster labels"}
              </p>
              <p className="text-xs text-black/50">
                Click or drag empty days to multi-select, then assign a label.
                Drag an existing label onto another day to move it (swaps if the
                target is filled). Save when ready. Esc clears selection.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {labels.map((label) => (
                <button
                  key={label.code}
                  type="button"
                  disabled={pending || selectedCount === 0}
                  title={label.name}
                  onClick={() => stageLabel(label.code)}
                  className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold uppercase tracking-wide transition-opacity hover:opacity-90 disabled:opacity-40"
                  style={scheduleDayLabelStyle(label)}
                >
                  {label.abbreviation}
                </button>
              ))}
              <button
                type="button"
                disabled={pending || selectedCount === 0}
                onClick={() => stageLabel(null)}
                className="rounded-md border border-black/15 bg-white/80 px-2 py-1 text-[11px] font-medium text-black/55 transition-colors hover:text-[#3D421F] disabled:opacity-40"
              >
                Clear days
              </button>
            </div>
          </div>

          <div className="flex shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-black/10 bg-white/70 px-2.5 py-2 text-center sm:w-[152px]">
            <p className="w-full text-[11px] leading-tight text-black/45">
              {dirtyCount > 0
                ? `${dirtyCount} unsaved change${dirtyCount === 1 ? "" : "s"}`
                : "No unsaved changes"}
            </p>
            <Button
              type="button"
              size="sm"
              disabled={pending || dirtyCount === 0}
              onClick={saveDrafts}
              className="h-8 w-full"
            >
              {pending ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending || dirtyCount === 0}
              onClick={discardDrafts}
              className="h-7 w-full bg-black/[0.06] hover:bg-black/10"
            >
              Discard
            </Button>
            <button
              type="button"
              disabled={pending || selectedCount === 0}
              onClick={() => setSelected(new Map())}
              className="inline-flex h-6 w-full items-center justify-center gap-1 rounded-md px-1 text-[10px] font-medium leading-none text-black/55 transition-colors hover:bg-black/5 hover:text-[#3D421F] disabled:opacity-40"
            >
              <X className="h-3 w-3 shrink-0" aria-hidden />
              Clear selection
            </button>
          </div>
        </div>
      ) : null}

      <div
        className="overflow-x-auto rounded-lg border border-black/10 select-none"
        onMouseLeave={() => setIsPainting(false)}
      >
        <table className="w-full min-w-[900px] table-fixed border-collapse text-sm">
          <colgroup>
            <col className="w-[240px]" />
            <col className="w-[94px]" />
            <col className="w-[94px]" />
            <col className="w-[94px]" />
            <col className="w-[94px]" />
            <col className="w-[94px]" />
            <col className="w-[94px]" />
            <col className="w-[94px]" />
            {canEdit ? <col className="w-10" /> : null}
          </colgroup>
          <thead>
            <tr className="bg-black/[0.03]">
              <th
                scope="col"
                className="sticky left-0 z-10 w-[240px] border-b border-r border-black/10 bg-[var(--venue-secondary,#F0F3DD)]/80 px-3 py-2.5 text-left font-serif text-sm font-medium text-[#3D421F] backdrop-blur-md"
              >
                Staff
              </th>
              {days.map((day) => (
                <th
                  key={day.key}
                  scope="col"
                  className={cn(
                    "w-[94px] border-b border-black/10 px-2 py-2.5 text-center font-medium",
                    day.isToday
                      ? "bg-[var(--venue-primary)]/15 text-[#3D421F]"
                      : "text-black/60",
                  )}
                >
                  <span className="block text-[10px] font-semibold uppercase tracking-[0.08em]">
                    {day.weekdayLabel}
                  </span>
                  <span className="mt-0.5 block text-xs tabular-nums">
                    {day.dayLabel}
                  </span>
                </th>
              ))}
              {canEdit ? (
                <th
                  scope="col"
                  className="w-10 border-b border-l border-black/10 p-0"
                >
                  <span className="sr-only">Actions</span>
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {staff.length === 0 ? (
              <tr>
                <td
                  colSpan={canEdit ? 9 : 8}
                  className="px-3 py-10 text-center text-sm text-black/45"
                >
                  No ON Board staff in {departmentLabel}.
                </td>
              </tr>
            ) : (
              staff.map((member) => (
                <tr
                  key={member.id}
                  className="border-b border-black/5 last:border-b-0"
                >
                  <th
                    scope="row"
                    className="sticky left-0 z-10 w-[240px] border-r border-black/10 bg-white/90 px-3 py-2.5 text-left font-medium text-[#3D421F] backdrop-blur-md"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate">{member.fullName}</span>
                      <WorkingStatusBadge status={member.workingStatus} />
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-[11px] font-normal text-black/50">
                      <span className="shrink-0 tabular-nums text-black/40">
                        {member.empNo}
                      </span>
                      <span className="text-black/25" aria-hidden>
                        ·
                      </span>
                      <span className="min-w-0 truncate">
                        {member.position ?? "—"}
                      </span>
                    </span>
                  </th>
                  {days.map((day) => {
                    const key = scheduleCellKey(member.id, day.key);
                    const code = displayAssignments[key] ?? null;
                    const label = getScheduleDayLabel(labels, code);
                    const isSelected = selected.has(key);
                    const isDraft = Object.prototype.hasOwnProperty.call(
                      drafts,
                      key,
                    );
                    const isDropTarget = dropTargetKey === key;
                    const isDragging = draggingKey === key;
                    const canDragLabel = Boolean(canEdit && code && !pending);

                    return (
                      <td
                        key={day.key}
                        className={cn(
                          "relative h-12 w-[94px] border-l border-black/5 px-1 align-middle",
                          day.isToday && "bg-[var(--venue-primary)]/5",
                        )}
                        onDragOver={(event) => {
                          if (!canEdit || pending || !draggingKey) return;
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                          if (dropTargetKey !== key) setDropTargetKey(key);
                        }}
                        onDragLeave={() => {
                          if (dropTargetKey === key) setDropTargetKey(null);
                        }}
                        onDrop={(event) => {
                          if (!canEdit || pending) return;
                          event.preventDefault();
                          setDropTargetKey(null);
                          setDraggingKey(null);

                          let payload: DragLabelPayload | null = null;
                          try {
                            const raw =
                              event.dataTransfer.getData(DRAG_MIME) ||
                              event.dataTransfer.getData("text/plain");
                            if (raw) {
                              payload = JSON.parse(raw) as DragLabelPayload;
                            }
                          } catch {
                            payload = null;
                          }
                          if (!payload?.labelCode || !payload.key) return;

                          suppressClickRef.current = true;
                          stageMoveLabel(payload, member.id, day.key);
                          window.setTimeout(() => {
                            suppressClickRef.current = false;
                          }, 0);
                        }}
                      >
                        <button
                          type="button"
                          disabled={!canEdit || pending}
                          draggable={canDragLabel}
                          title={
                            label
                              ? `${label.abbreviation} — ${label.name}${isDraft ? " (unsaved)" : ""}${canDragLabel ? " · drag to move" : ""}`
                              : canEdit
                                ? isDraft
                                  ? "Cleared (unsaved)"
                                  : "Select day"
                                : undefined
                          }
                          aria-pressed={isSelected}
                          aria-label={
                            label
                              ? `${member.fullName} ${day.dayLabel}: ${label.name}`
                              : `${member.fullName} ${day.dayLabel}: empty`
                          }
                          onMouseDown={(event) => {
                            if (!canEdit || pending) return;
                            // Labeled cells stay free for HTML5 drag; empty cells paint-select.
                            if (code) return;
                            event.preventDefault();
                            toggleCell(member.id, day.key);
                          }}
                          onClick={() => {
                            if (!canEdit || pending || !code) return;
                            if (suppressClickRef.current) return;
                            toggleSelectOnly(member.id, day.key);
                          }}
                          onMouseEnter={() => {
                            if (
                              !canEdit ||
                              !isPainting ||
                              pending ||
                              draggingKey
                            ) {
                              return;
                            }
                            paintCell(member.id, day.key, paintMode);
                          }}
                          onDragStart={(event) => {
                            if (!canDragLabel || !code) {
                              event.preventDefault();
                              return;
                            }
                            const payload: DragLabelPayload = {
                              key,
                              staffId: member.id,
                              dateKey: day.key,
                              labelCode: code,
                            };
                            event.dataTransfer.setData(
                              DRAG_MIME,
                              JSON.stringify(payload),
                            );
                            event.dataTransfer.setData(
                              "text/plain",
                              JSON.stringify(payload),
                            );
                            event.dataTransfer.effectAllowed = "move";
                            setIsPainting(false);
                            setDraggingKey(key);
                            suppressClickRef.current = true;
                          }}
                          onDragEnd={() => {
                            setDraggingKey(null);
                            setDropTargetKey(null);
                            window.setTimeout(() => {
                              suppressClickRef.current = false;
                            }, 0);
                          }}
                          className={cn(
                            "flex h-9 w-full items-center justify-center rounded-md border text-[11px] font-semibold uppercase tracking-wide transition-colors",
                            label
                              ? "border"
                              : "border-dashed border-black/15 bg-transparent text-black/25",
                            canEdit &&
                              "hover:border-[var(--venue-primary)]/40 hover:bg-white/80",
                            canDragLabel && "cursor-grab active:cursor-grabbing",
                            !canEdit && "cursor-default",
                            pending && "opacity-60",
                            isSelected &&
                              "ring-2 ring-[var(--venue-primary)] ring-offset-1",
                            isDraft &&
                              !isSelected &&
                              !isDropTarget &&
                              "outline outline-1 outline-dashed outline-black/25",
                            isDragging && "opacity-40",
                            isDropTarget &&
                              "ring-2 ring-[var(--venue-primary)] ring-offset-1 scale-[1.02]",
                          )}
                          style={label ? scheduleDayLabelStyle(label) : undefined}
                        >
                          {label?.abbreviation ?? "·"}
                        </button>
                      </td>
                    );
                  })}
                  {canEdit ? (
                    <td className="w-10 border-l border-black/5 p-0 align-middle">
                      <div className="flex h-full min-h-12 items-center justify-center">
                        <button
                          type="button"
                          disabled={pending}
                          title={`Clear all labels this week for ${member.fullName}`}
                          aria-label={`Clear week for ${member.fullName}`}
                          onClick={() => stageClearWeek(member.id)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-black/40 transition-colors hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
                        >
                          <Eraser className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
