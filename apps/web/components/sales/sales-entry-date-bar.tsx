"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  getIsoWeekNumber,
  getWeekDayLabel,
} from "@/lib/sales/daily-sales-calculations";
import {
  canCreateSalesEntryForDate,
  getLocalTodayIsoDate,
  isFutureSalesEntryDate,
} from "@/lib/sales/sales-entry-dates";
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
  trailingActions?: React.ReactNode;
  className?: string;
  /** ISO dates that already have an entry — past days not in this set get flagged. */
  datesWithEntries?: ReadonlySet<string>;
};

function formatLocalDate(date: Date): string {
  return getLocalTodayIsoDate(date);
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

/** Fixed width so SAVE / Saving… / Edit entry / Create entry never resize the bar. */
const entryActionButtonClass =
  "inline-flex h-10 w-[8.75rem] shrink-0 items-center justify-center rounded-md text-sm";

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
  trailingActions,
  className,
  datesWithEntries,
}: SalesEntryDateBarProps) {
  const todayIso = getLocalTodayIsoDate();
  const isFutureDate = isFutureSalesEntryDate(selectedDate, todayIso);
  const canCreateEntry = canCreateSalesEntryForDate(selectedDate, isExisting);
  const isAtToday = selectedDate >= todayIso;

  return (
    <Card className={cn("p-4", className)}>
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        <span className={metaBadgeClass}>
          Week {getIsoWeekNumber(selectedDate)}
        </span>
        <span className={metaBadgeClass}>
          {getWeekDayLabel(selectedDate)}
        </span>
        {extraBadges}
        <button
          type="button"
          disabled={!canEdit}
          onClick={() => onDateChange(shiftDate(selectedDate, -1))}
          title="Previous day"
          className={navButtonClass}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <SalesDateInput
          disabled={!canEdit}
          value={selectedDate}
          onChange={onDateChange}
          maxDate={todayIso}
          datesWithEntries={datesWithEntries}
          className="h-10 w-[10.5rem] min-w-0 shrink-0"
        />
        <button
          type="button"
          disabled={!canEdit || isAtToday}
          onClick={() => onDateChange(shiftDate(selectedDate, 1))}
          title="Next day"
          className={navButtonClass}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          disabled={!canEdit}
          onClick={() => onDateChange(todayIso)}
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
              className={cn(
                entryActionButtonClass,
                "bg-[var(--venue-primary)] font-semibold tracking-wide text-white transition-opacity hover:opacity-90 disabled:opacity-50",
              )}
            >
              {isPending ? "Saving…" : "SAVE"}
            </button>
          ) : (
            <button
              type="button"
              disabled={!canCreateEntry}
              title={
                isFutureDate && !isExisting
                  ? "Entries cannot be created for a future date."
                  : undefined
              }
              onClick={onOpenForm}
              className={cn(
                entryActionButtonClass,
                "border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                isExisting
                  ? "border-black/10 bg-[var(--venue-secondary)]/30 text-[#3D421F] hover:bg-[var(--venue-secondary)]/45"
                  : "border-black/10 bg-white text-[#3D421F] hover:bg-[var(--venue-secondary)]/30",
              )}
            >
              {isExisting ? "Edit entry" : "Create entry"}
            </button>
          )
        ) : null}
        {trailingActions}
      </div>
    </Card>
  );
}
