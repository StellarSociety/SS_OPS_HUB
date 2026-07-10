"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  getIsoWeekNumber,
  getWeekDayLabel,
} from "@/lib/sales/daily-sales-calculations";
import { SalesDateInput } from "@/components/sales/sales-date-input";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type SalesEntryDateBarProps = {
  selectedDate: string;
  canEdit: boolean;
  onDateChange: (isoDate: string) => void;
  isFormOpen: boolean;
  isExisting: boolean;
  isPending?: boolean;
  onOpenForm: () => void;
  onSave: () => void;
  extraBadges?: React.ReactNode;
};

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftDate(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return formatLocalDate(date);
}

const metaBadgeClass =
  "inline-flex h-10 shrink-0 items-center rounded-full border border-black/10 bg-[var(--venue-secondary)]/30 px-3 text-sm text-black/60";

const navButtonClass =
  "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-black/10 bg-white text-[#3D421F] transition-colors hover:bg-[var(--venue-secondary)]/30 disabled:opacity-50";

export function SalesEntryDateBar({
  selectedDate,
  canEdit,
  onDateChange,
  isFormOpen,
  isExisting,
  isPending = false,
  onOpenForm,
  onSave,
  extraBadges,
}: SalesEntryDateBarProps) {
  return (
    <Card className="p-3">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <span className={metaBadgeClass}>
          Week {getIsoWeekNumber(selectedDate)}
        </span>
        <span className={metaBadgeClass}>
          {getWeekDayLabel(selectedDate)}
        </span>
        {extraBadges}
        <SalesDateInput
          disabled={!canEdit}
          value={selectedDate}
          onChange={onDateChange}
          className="h-10 w-[10.5rem] min-w-0 shrink-0"
        />
        <button
          type="button"
          disabled={!canEdit}
          onClick={() => onDateChange(shiftDate(selectedDate, -1))}
          title="Previous day"
          className={navButtonClass}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          disabled={!canEdit}
          onClick={() => onDateChange(shiftDate(selectedDate, 1))}
          title="Next day"
          className={navButtonClass}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          disabled={!canEdit}
          onClick={() => onDateChange(formatLocalDate(new Date()))}
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-md border border-black/10 bg-white px-3 text-sm font-medium text-[#3D421F] transition-colors hover:bg-[var(--venue-secondary)]/30 disabled:opacity-50"
        >
          Today
        </button>
        {canEdit ? (
          isFormOpen ? (
            <button
              type="button"
              disabled={isPending}
              onClick={onSave}
              className="inline-flex h-10 shrink-0 items-center justify-center rounded-md bg-[var(--venue-primary)] px-6 text-sm font-semibold tracking-wide text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {isPending ? "Saving…" : "SAVE"}
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenForm}
              className={cn(
                "inline-flex h-10 shrink-0 items-center justify-center rounded-md border px-6 text-sm font-medium transition-colors",
                isExisting
                  ? "border-[var(--venue-primary)]/30 bg-[var(--venue-primary)]/10 text-[#3D421F] hover:bg-[var(--venue-primary)]/15"
                  : "border-black/10 bg-white text-[#3D421F] hover:bg-[var(--venue-secondary)]/30",
              )}
            >
              {isExisting ? "Edit entry" : "Create entry"}
            </button>
          )
        ) : null}
      </div>
    </Card>
  );
}
