"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Pencil, Plus, X } from "lucide-react";
import { useVenueScope } from "@/components/providers/venue-scope-provider";
import {
  MONTH_LABELS,
  monthIndexForWeek,
  weeksInMonth,
} from "@/lib/sales/cos-calculations";
import type {
  CostCentre,
  CosRunStatus,
  VenueCosRunWithAdjustments,
} from "@/lib/sales/cos-types";
import { toScopedHref } from "@/lib/venue/scope-routing";
import { cn } from "@/lib/utils";

export type CosWeekRange = { weekNo: number; start: string; end: string };

const STATUS: Record<CosRunStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-black/5 text-black/60" },
  pending_approval: {
    label: "Pending approval",
    className: "bg-amber-100 text-amber-800",
  },
  approved: { label: "Approved", className: "bg-emerald-100 text-emerald-800" },
};

function ddmmyy(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

/**
 * Pre-select the most recent started week of the month without a run
 * (the one that usually needs entering next); otherwise the current week.
 */
function defaultWeek(
  monthWeeks: number[],
  runByWeek: Map<number, VenueCosRunWithAdjustments>,
  weekRanges: CosWeekRange[],
  today: string,
  todayWeek: number,
): number {
  const started = monthWeeks.filter(
    (w) => (weekRanges[w - 1]?.start ?? "") <= today,
  );
  const open = [...started].reverse().find((w) => !runByWeek.has(w));
  return open ?? (monthWeeks.includes(todayWeek) ? todayWeek : monthWeeks[0]);
}

export function CostRunWeekPickerDialog({
  costCentre,
  fiscalYear,
  runByWeek,
  weekRanges,
  today,
  todayWeek,
  onClose,
}: {
  costCentre: CostCentre;
  fiscalYear: number;
  runByWeek: Map<number, VenueCosRunWithAdjustments>;
  weekRanges: CosWeekRange[];
  today: string;
  todayWeek: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const { scope, slug } = useVenueScope();
  const [monthIndex, setMonthIndex] = useState(() =>
    monthIndexForWeek(todayWeek),
  );
  const monthWeeks = weeksInMonth(monthIndex);
  const [selected, setSelected] = useState(() =>
    defaultWeek(
      weeksInMonth(monthIndexForWeek(todayWeek)),
      runByWeek,
      weekRanges,
      today,
      todayWeek,
    ),
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function changeMonth(next: number) {
    setMonthIndex(next);
    setSelected(
      defaultWeek(weeksInMonth(next), runByWeek, weekRanges, today, todayWeek),
    );
  }

  const selectedRun = runByWeek.get(selected) ?? null;
  const base = `/gp-cos/${costCentre}/cost-runs`;
  const href = selectedRun
    ? `${base}/${selectedRun.id}`
    : `${base}/new?year=${fiscalYear}&week=${selected}`;

  function go() {
    router.push(toScopedHref(href, scope, slug));
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cost-run-week-title"
        className="w-full max-w-lg overflow-hidden rounded-xl border border-black/10 bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-black/8 px-5 py-4">
          <div>
            <h3
              id="cost-run-week-title"
              className="font-serif text-lg text-[#3D421F]"
            >
              Choose a week
            </h3>
            <p className="mt-0.5 text-sm text-black/50">
              Create a cost run for an empty week, or edit one already saved.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-black/45 transition hover:bg-black/5 hover:text-[#3D421F]"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex items-center justify-between border-b border-black/5 px-5 py-2.5">
          <button
            type="button"
            aria-label="Previous month"
            disabled={monthIndex === 0}
            onClick={() => changeMonth(monthIndex - 1)}
            className="inline-flex size-8 items-center justify-center rounded-md text-black/50 hover:bg-black/5 disabled:opacity-30"
          >
            <ChevronLeft className="size-4" />
          </button>
          <div className="text-sm font-semibold text-[#3D421F]">
            {MONTH_LABELS[monthIndex]} {fiscalYear}
            <span className="ml-2 font-normal text-black/45">
              W{monthWeeks[0]}–W{monthWeeks[monthWeeks.length - 1]}
            </span>
          </div>
          <button
            type="button"
            aria-label="Next month"
            disabled={monthIndex === 11}
            onClick={() => changeMonth(monthIndex + 1)}
            className="inline-flex size-8 items-center justify-center rounded-md text-black/50 hover:bg-black/5 disabled:opacity-30"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>

        <ul role="radiogroup" aria-label="Weeks" className="space-y-1.5 p-3">
          {monthWeeks.map((w) => {
            const range = weekRanges[w - 1];
            const run = runByWeek.get(w) ?? null;
            const isSelected = selected === w;
            const future = range ? range.start > today : false;
            return (
              <li key={w}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => setSelected(w)}
                  onDoubleClick={() => {
                    setSelected(w);
                    router.push(
                      toScopedHref(
                        run
                          ? `${base}/${run.id}`
                          : `${base}/new?year=${fiscalYear}&week=${w}`,
                        scope,
                        slug,
                      ),
                    );
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition",
                    isSelected
                      ? "border-[var(--venue-primary,#818a40)] bg-[var(--venue-secondary,#F0F3DD)]/60 ring-1 ring-[var(--venue-primary,#818a40)]/30"
                      : "border-black/10 hover:bg-black/[0.02]",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded-full border",
                      isSelected
                        ? "border-[var(--venue-primary,#818a40)]"
                        : "border-black/25",
                    )}
                    aria-hidden
                  >
                    {isSelected ? (
                      <span className="size-2 rounded-full bg-[var(--venue-primary,#818a40)]" />
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="font-medium text-[#3D421F]">W{w}</span>
                    {range ? (
                      <span className="ml-2 text-sm text-black/55">
                        {ddmmyy(range.start)} – {ddmmyy(range.end)}
                      </span>
                    ) : null}
                    {w === todayWeek ? (
                      <span className="ml-2 text-[10px] font-semibold uppercase text-[var(--venue-primary,#818a40)]">
                        This week
                      </span>
                    ) : null}
                  </span>
                  {run ? (
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        STATUS[run.status].className,
                      )}
                    >
                      {STATUS[run.status].label}
                    </span>
                  ) : (
                    <span
                      className={cn(
                        "text-xs",
                        future ? "text-black/35" : "font-medium text-red-700",
                      )}
                    >
                      {future ? "Upcoming" : "Not entered"}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="flex justify-end gap-2 border-t border-black/8 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center rounded-md border border-black/10 bg-white px-3 text-sm font-medium text-[#3D421F] hover:bg-black/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={go}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[var(--venue-primary,#818a40)] px-3 text-sm font-semibold text-white hover:opacity-90"
          >
            {selectedRun ? (
              <>
                <Pencil className="h-3.5 w-3.5" /> Edit W{selected} run
              </>
            ) : (
              <>
                <Plus className="h-3.5 w-3.5" /> Create W{selected} run
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
