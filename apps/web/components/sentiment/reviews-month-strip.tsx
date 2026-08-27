"use client";

import { Star } from "lucide-react";
import { ScopedLink } from "@/components/layout/scoped-link";
import {
  formatMonthKeyLabel,
  formatMonthKeyShort,
} from "@/lib/sentiment/review-period";
import type { MonthReviewStats } from "@/lib/sentiment/review-insights";
import { cn } from "@/lib/utils";

export function ReviewsMonthStrip({
  items,
  selectedMonthKey,
}: {
  items: MonthReviewStats[];
  selectedMonthKey?: string;
}) {
  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 xl:grid-cols-12">
      {items.map(({ key, count, average }) => {
        const selected = key === selectedMonthKey;
        const ratingLabel = average != null ? average.toFixed(1) : "—";
        return (
          <ScopedLink
            key={key}
            href={`/sentiment/calendar?month=${key}`}
            aria-current={selected ? "page" : undefined}
            aria-label={`${formatMonthKeyLabel(key)}, ${
              average != null ? `${average.toFixed(1)} stars, ` : ""
            }${count} review${count === 1 ? "" : "s"}`}
            className={cn(
              "flex min-w-0 flex-col items-center gap-0.5 rounded-xl border border-black/10 bg-white/70 px-1.5 py-2 text-center transition hover:bg-[var(--venue-secondary)]/35",
              selected &&
                "relative z-[1] bg-[var(--venue-primary)]/12 ring-2 ring-inset ring-[var(--venue-primary,#818a40)]",
            )}
          >
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[#3D421F]">
              {formatMonthKeyShort(key)}
            </span>
            <span className="text-[10px] tabular-nums text-black/45">
              {key.slice(0, 4)}
            </span>
            <span className="inline-flex items-center gap-0.5 text-sm font-semibold tabular-nums text-[#3D421F]">
              <Star
                className="h-3.5 w-3.5 fill-[#FABB05] text-[#FABB05]"
                aria-hidden
              />
              {ratingLabel}
            </span>
            <span className="text-[10px] tabular-nums text-black/50">
              {count} review{count === 1 ? "" : "s"}
            </span>
          </ScopedLink>
        );
      })}
    </div>
  );
}
