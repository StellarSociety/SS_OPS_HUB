"use client";

import { useEffect, useRef } from "react";
import { Star } from "lucide-react";
import { SentimentLink } from "@/components/sentiment/sentiment-link";
import {
  formatMonthKeyLabel,
  formatMonthKeyShort,
} from "@/lib/sentiment/review-period";
import type { MonthReviewStats } from "@/lib/sentiment/review-insights";
import { cn } from "@/lib/utils";

export function ReviewsMonthStrip({
  items,
  selectedMonthKey,
  onSelectMonth,
}: {
  items: MonthReviewStats[];
  selectedMonthKey?: string;
  onSelectMonth?: (monthKey: string) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const target =
      scroller.querySelector<HTMLElement>("[data-month-selected='true']") ??
      (scroller.lastElementChild as HTMLElement | null);
    if (!target) return;
    const left = target.offsetLeft + target.offsetWidth - scroller.clientWidth;
    scroller.scrollTo({ left: Math.max(0, left), behavior: "auto" });
  }, [items, selectedMonthKey]);

  return (
    <div
      ref={scrollerRef}
      role="list"
      aria-label="Review months"
      className="relative flex w-full min-w-0 snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain pb-0.5 [touch-action:pan-x]"
    >
      {items.map(({ key, count, average }) => {
        const selected = key === selectedMonthKey;
        const ratingLabel = average != null ? average.toFixed(1) : "—";
        const className = cn(
          "flex w-[4.75rem] min-w-[4.75rem] shrink-0 grow-0 snap-start flex-col items-center gap-0.5 rounded-xl border border-black/10 bg-white/70 px-1.5 py-2 text-center transition hover:bg-[var(--venue-secondary)]/35",
          selected &&
            "relative z-[1] bg-[var(--venue-primary)]/12 ring-2 ring-inset ring-[var(--venue-primary,#818a40)]",
        );
        const ariaLabel = `${formatMonthKeyLabel(key)}, ${
          average != null ? `${average.toFixed(1)} stars, ` : ""
        }${count} review${count === 1 ? "" : "s"}`;
        const body = (
          <>
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
          </>
        );
        if (onSelectMonth) {
          return (
            <button
              key={key}
              type="button"
              role="listitem"
              data-month-selected={selected ? "true" : undefined}
              aria-current={selected ? "page" : undefined}
              aria-label={ariaLabel}
              className={className}
              onClick={() => onSelectMonth(key)}
            >
              {body}
            </button>
          );
        }
        return (
          <SentimentLink
            key={key}
            href={`/sentiment/calendar?month=${key}`}
            role="listitem"
            data-month-selected={selected ? "true" : undefined}
            aria-current={selected ? "page" : undefined}
            aria-label={ariaLabel}
            className={className}
          >
            {body}
          </SentimentLink>
        );
      })}
    </div>
  );
}
