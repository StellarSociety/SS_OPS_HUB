import { getSalesEntryDateBannerParts } from "@/lib/sales/daily-sales-calculations";

type SalesEntryDateBannerProps = {
  dateStr: string;
};

const dayBadgeClass =
  "inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full border-2 border-[var(--venue-primary)] bg-[var(--venue-primary)]/10 px-1.5 text-xs tabular-nums text-[var(--venue-primary)]";

export function SalesEntryDateBanner({ dateStr }: SalesEntryDateBannerProps) {
  const { weekNumber, day, dayOrdinal, monthName, year, weekday } =
    getSalesEntryDateBannerParts(dateStr);

  return (
    <span className="inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
      <span className="inline-flex items-center gap-1.5">
        <span>Week №</span>
        <span className="tabular-nums">{weekNumber}</span>
      </span>
      <span className="text-black/30">|</span>
      <span className="inline-flex items-center gap-1">
        <span className={dayBadgeClass}>
          <span className="font-bold">{day}</span>
          <span className="font-normal">{dayOrdinal}</span>
        </span>
        <span>
          {monthName} {year}
        </span>
      </span>
      <span className="text-black/30">|</span>
      <span>{weekday}</span>
    </span>
  );
}
