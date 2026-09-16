"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Image as ImageIcon, Star } from "lucide-react";
import { ReviewCard } from "@/components/sentiment/review-card";
import { ReviewsMonthStrip } from "@/components/sentiment/reviews-month-strip";
import { GoogleMark, GuestMark, TripAdvisorMark } from "@/components/sentiment/channel-marks";
import { Card } from "@/components/ui/card";
import { dubaiCalendarDateIso } from "@/lib/hr/payroll/period";
import { monthReviewStats, monthStripStats } from "@/lib/sentiment/review-insights";
import {
  currentMonthKeyInDubai,
  formatMonthKeyLabel,
  shiftMonthKey,
  todayIsoInDubai,
} from "@/lib/sentiment/review-period";
import type {
  SentimentReplyTemplate,
  SentimentReview,
  SentimentReviewAction,
} from "@/lib/sentiment/types";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

type MonthCell = {
  key: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
};

function buildMonthCells(monthKey: string, todayIso: string): MonthCell[] {
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));
  const first = new Date(Date.UTC(year, month - 1, 1));
  const startOffset = (first.getUTCDay() + 6) % 7;
  const last = new Date(Date.UTC(year, month, 0));
  const lastDate = last.getUTCDate();
  const endPad = 6 - ((last.getUTCDay() + 6) % 7);
  const total = startOffset + lastDate + endPad;
  const cells: MonthCell[] = [];

  for (let index = 0; index < total; index += 1) {
    const date = new Date(Date.UTC(year, month - 1, 1 - startOffset + index));
    const key = date.toISOString().slice(0, 10);
    cells.push({
      key,
      day: date.getUTCDate(),
      inMonth: date.getUTCMonth() === month - 1,
      isToday: key === todayIso,
    });
  }

  return cells;
}

function groupReviewsByDay(reviews: SentimentReview[]) {
  const map = new Map<string, SentimentReview[]>();
  for (const review of reviews) {
    const key = review.reviewed_at
      ? dubaiCalendarDateIso(review.reviewed_at)
      : null;
    if (!key) continue;
    const list = map.get(key) ?? [];
    list.push(review);
    map.set(key, list);
  }
  return map;
}

function defaultSelectedDay(
  monthKey: string,
  todayIso: string,
  reviews: SentimentReview[],
) {
  if (todayIso.startsWith(monthKey)) return todayIso;
  const postedDays = reviews
    .map((review) =>
      review.reviewed_at ? dubaiCalendarDateIso(review.reviewed_at) : null,
    )
    .filter((key): key is string => Boolean(key?.startsWith(monthKey)))
    .sort();
  return postedDays[0] ?? `${monthKey}-01`;
}

function formatDayHeading(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function ChannelMark({
  channel,
  className,
}: {
  channel: SentimentReview["channel"];
  className?: string;
}) {
  if (channel === "tripadvisor") {
    return <TripAdvisorMark className={className} />;
  }
  if (channel === "guest") {
    return <GuestMark className={className} />;
  }
  return <GoogleMark className={className} />;
}

function CalendarReviewRow({ review }: { review: SentimentReview }) {
  const name = review.author_name?.trim() || "Guest";
  const hasPhotos = (review.photo_urls?.length ?? 0) > 0;
  const rating =
    typeof review.rating === "number" ? review.rating.toFixed(1) : null;

  return (
    <div className="flex min-w-0 items-center gap-1 text-[10px] leading-tight text-[#3D421F]">
      <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
      {rating ? (
        <span className="inline-flex shrink-0 items-center gap-px tabular-nums text-black/70">
          <Star className="h-2.5 w-2.5 fill-[#FABB05] text-[#FABB05]" aria-hidden />
          {rating}
        </span>
      ) : null}
      {hasPhotos ? (
        <ImageIcon
          className="h-2.5 w-2.5 shrink-0 text-black/45"
          aria-hidden
        />
      ) : null}
      <ChannelMark channel={review.channel} className="h-2.5 w-2.5 shrink-0" />
    </div>
  );
}

export function ReviewsCalendar({
  monthKey,
  stripMonthKeys,
  reviews,
  canEdit,
  canEditActions,
  googleCanPost,
  venueName,
  templates,
  actionsByReviewId,
  compact = false,
  onMonthChange,
}: {
  monthKey: string;
  stripMonthKeys: string[];
  reviews: SentimentReview[];
  canEdit: boolean;
  canEditActions: boolean;
  googleCanPost: boolean;
  venueName: string;
  templates: SentimentReplyTemplate[];
  actionsByReviewId: Record<string, SentimentReviewAction>;
  compact?: boolean;
  onMonthChange?: (monthKey: string) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const todayIso = todayIsoInDubai();
  const currentMonthKey = currentMonthKeyInDubai();
  const cells = useMemo(
    () => buildMonthCells(monthKey, todayIso),
    [monthKey, todayIso],
  );
  const byDay = useMemo(() => groupReviewsByDay(reviews), [reviews]);
  const monthReviewCount = useMemo(
    () => monthReviewStats(reviews, monthKey).count,
    [reviews, monthKey],
  );
  const stripStats = useMemo(
    () => monthStripStats(reviews, stripMonthKeys),
    [reviews, stripMonthKeys],
  );
  const [selectedDay, setSelectedDay] = useState(() =>
    defaultSelectedDay(monthKey, todayIso, reviews),
  );
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    setSelectedDay(defaultSelectedDay(monthKey, todayIsoInDubai(), reviews));
  }, [monthKey]);

  useEffect(() => {
    setPickerOpen(false);
  }, [monthKey]);

  const selectedReviews = byDay.get(selectedDay) ?? [];

  function goToMonth(next: string) {
    if (onMonthChange) {
      onMonthChange(next);
      return;
    }
    router.push(`${pathname}?month=${next}`);
  }

  function goMonth(delta: number) {
    goToMonth(shiftMonthKey(monthKey, delta));
  }

  return (
    <div className="space-y-4">
      <ReviewsMonthStrip
        items={stripStats}
        selectedMonthKey={monthKey}
        onSelectMonth={onMonthChange ? goToMonth : undefined}
      />

      <div
        className={cn(
          "grid items-start gap-4",
          !compact && "xl:grid-cols-[minmax(0,1fr)_26rem]",
        )}
      >
        <div className="min-w-0 space-y-3">
          {compact ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-1 rounded-xl bg-[var(--venue-primary,#818a40)] px-1 py-1 text-white">
                <button
                  type="button"
                  onClick={() => goMonth(-1)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-white transition hover:bg-white/15"
                  aria-label="Previous month"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-expanded={pickerOpen}
                  aria-haspopup="dialog"
                  onClick={() => setPickerOpen((open) => !open)}
                  className="min-w-0 flex-1 rounded-md px-2 py-1 text-center font-serif text-lg text-white hover:bg-white/10"
                >
                  {formatMonthKeyLabel(monthKey)}
                </button>
                <button
                  type="button"
                  onClick={() => goMonth(1)}
                  disabled={shiftMonthKey(monthKey, 1) > currentMonthKey}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-white transition hover:bg-white/15 disabled:pointer-events-none disabled:opacity-40"
                  aria-label="Next month"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              {pickerOpen ? (
                <CalendarMonthPicker
                  monthKey={monthKey}
                  currentMonthKey={currentMonthKey}
                  onSelect={(next) => {
                    goToMonth(next > currentMonthKey ? currentMonthKey : next);
                    setPickerOpen(false);
                  }}
                  onClose={() => setPickerOpen(false)}
                />
              ) : null}
              <p className="text-sm text-black/50">
                {monthReviewCount} review{monthReviewCount === 1 ? "" : "s"} this
                month
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => goMonth(-1)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-black/10 bg-white text-[#3D421F] transition hover:bg-black/[0.03]"
                  aria-label="Previous month"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <h2 className="min-w-[11rem] text-center font-serif text-xl text-[#3D421F]">
                  {formatMonthKeyLabel(monthKey)}
                </h2>
                <button
                  type="button"
                  onClick={() => goMonth(1)}
                  disabled={shiftMonthKey(monthKey, 1) > currentMonthKey}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-black/10 bg-white text-[#3D421F] transition hover:bg-black/[0.03] disabled:pointer-events-none disabled:opacity-40"
                  aria-label="Next month"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => goToMonth(currentMonthKey)}
                  className="ml-1 h-9 rounded-md border border-black/10 bg-white px-3 text-sm font-medium text-[#3D421F] transition hover:bg-black/[0.03]"
                >
                  Today
                </button>
              </div>
              <p className="text-sm text-black/50">
                {monthReviewCount} review{monthReviewCount === 1 ? "" : "s"} this
                month
              </p>
            </div>
          )}

          <div
            className={cn(
              "rounded-xl border border-black/10 bg-white/70",
              compact ? "overflow-hidden" : "overflow-x-auto",
            )}
          >
            <div
              className={cn(
                "grid grid-cols-7",
                compact
                  ? "bg-black/[0.08]"
                  : "min-w-[52rem] border-b border-black/10",
              )}
            >
              {WEEKDAYS.map((label) => (
                <div
                  key={label}
                  className={cn(
                    "text-center font-semibold uppercase tracking-wide",
                    compact
                      ? "px-0.5 py-1.5 text-[9px] text-[#3D421F]/70"
                      : "px-2 py-2 text-[11px] text-black/45",
                  )}
                >
                  {compact ? label.slice(0, 1) : label}
                </div>
              ))}
            </div>
            <div
              className={cn("grid grid-cols-7", !compact && "min-w-[52rem]")}
            >
              {cells.map((cell) => {
                const dayReviews = cell.inMonth
                  ? (byDay.get(cell.key) ?? [])
                  : [];
                const selected = cell.key === selectedDay && cell.inMonth;
                return (
                  <button
                    key={cell.key}
                    type="button"
                    disabled={!cell.inMonth}
                    aria-pressed={selected}
                    aria-label={`${cell.day} ${formatMonthKeyLabel(monthKey)}${
                      dayReviews.length
                        ? `, ${dayReviews.length} review${dayReviews.length === 1 ? "" : "s"}`
                        : ""
                    }`}
                    onClick={() => setSelectedDay(cell.key)}
                    className={cn(
                      "flex flex-col text-left [&:nth-child(7n)]:border-r-0",
                      compact
                        ? "min-h-[2.75rem] items-center gap-0 border-b border-r border-black/5 p-1"
                        : "min-h-[8.5rem] gap-1 border-b border-r border-black/5 p-1.5",
                      !cell.inMonth &&
                        "bg-[var(--venue-secondary,#F0F3DD)]/30 text-black/30",
                      cell.inMonth && "hover:bg-[var(--venue-secondary)]/35",
                      selected && "bg-[var(--venue-primary)]/12",
                      cell.isToday &&
                        cell.inMonth &&
                        "relative z-[1] rounded-lg ring-2 ring-inset ring-[var(--venue-primary,#818a40)]",
                      selected &&
                        !cell.isToday &&
                        "ring-1 ring-inset ring-[var(--venue-primary)]/40",
                    )}
                  >
                    <span
                      className={cn(
                        "inline-flex items-center justify-center rounded-full font-semibold tabular-nums",
                        compact ? "h-6 w-6 text-[11px]" : "h-6 w-6 text-xs",
                        selected
                          ? "bg-[var(--venue-primary)] text-white"
                          : cell.isToday && cell.inMonth
                            ? "text-[var(--venue-primary,#818a40)]"
                            : "text-[#3D421F]",
                        !cell.inMonth && "text-black/30",
                      )}
                    >
                      {cell.day}
                    </span>
                    {compact ? (
                      dayReviews.length > 0 ? (
                        <span className="text-[9px] font-medium tabular-nums text-[#3D421F]/70">
                          {dayReviews.length}
                        </span>
                      ) : null
                    ) : dayReviews.length > 0 ? (
                      <div className="flex flex-col gap-0.5">
                        {dayReviews.map((review) => (
                          <CalendarReviewRow key={review.id} review={review} />
                        ))}
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <aside
          className={cn(
            "min-w-0 space-y-3",
            !compact && "xl:sticky xl:top-3 xl:max-h-[calc(100vh-5.5rem)] xl:overflow-y-auto",
          )}
        >
          <div>
            <h2 className="font-serif text-xl text-[#3D421F]">
              {formatDayHeading(selectedDay)}
            </h2>
            <p className="mt-0.5 text-sm text-black/50">
              {selectedReviews.length} review
              {selectedReviews.length === 1 ? "" : "s"}
            </p>
          </div>
          {selectedReviews.length === 0 ? (
            <Card className="p-6 text-center">
              <p className="text-sm text-black/55">No reviews on this day.</p>
            </Card>
          ) : (
            selectedReviews.map((review) => (
              <ReviewCard
                key={review.id}
                review={review}
                canEdit={canEdit}
                googleCanPost={googleCanPost}
                venueName={venueName}
                templates={templates}
                action={actionsByReviewId[review.id] ?? null}
                canEditActions={canEditActions}
                compactAction
                compact={compact}
              />
            ))
          )}
        </aside>
      </div>
    </div>
  );
}

function CalendarMonthPicker({
  monthKey,
  currentMonthKey,
  onSelect,
  onClose,
}: {
  monthKey: string;
  currentMonthKey: string;
  onSelect: (monthKey: string) => void;
  onClose: () => void;
}) {
  const selectedYear = Number(monthKey.slice(0, 4));
  const selectedMonth = Number(monthKey.slice(5, 7));
  const [year, setYear] = useState(selectedYear);

  return (
    <div
      role="dialog"
      aria-label="Select month"
      className="rounded-xl border border-black/10 bg-white p-2 shadow-sm"
    >
      <div className="mb-1 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setYear((current) => current - 1)}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#3D421F] hover:bg-black/[0.04]"
          aria-label="Previous year"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="font-serif text-sm text-[#3D421F]">{year}</p>
        <button
          type="button"
          onClick={() => setYear((current) => current + 1)}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#3D421F] hover:bg-black/[0.04]"
          aria-label="Next year"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-4 gap-1">
        {MONTH_SHORT.map((label, index) => {
          const key = `${year}-${String(index + 1).padStart(2, "0")}`;
          const selected = year === selectedYear && index + 1 === selectedMonth;
          const current = key === currentMonthKey;
          const future = key > currentMonthKey;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              disabled={future}
              aria-current={current ? "date" : undefined}
              aria-pressed={selected}
              className={cn(
                "h-8 rounded-md px-1 text-xs font-medium",
                selected
                  ? "bg-[var(--venue-primary,#818a40)] text-white"
                  : "text-[#3D421F] hover:bg-black/[0.04]",
                current &&
                  !selected &&
                  "bg-[var(--venue-primary,#818a40)]/15 font-semibold text-[var(--venue-primary,#818a40)] ring-1 ring-inset ring-[var(--venue-primary,#818a40)]",
                future && "pointer-events-none opacity-40",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="mt-1 w-full rounded-md py-1 text-[11px] text-black/45"
      >
        Close
      </button>
    </div>
  );
}
