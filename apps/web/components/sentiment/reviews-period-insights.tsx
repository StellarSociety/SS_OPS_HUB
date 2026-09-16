import { GoogleStars } from "@/components/sentiment/google-stars";
import { SentimentBadge } from "@/components/sentiment/sentiment-badge";
import { summarizeReviewPeriod } from "@/lib/sentiment/review-insights";
import { pillSubNavShellClass } from "@/lib/sub-nav-ui";
import { cn } from "@/lib/utils";
import type { SentimentReview } from "@/lib/sentiment/types";

function InsightDivider() {
  return <span className="hidden h-7 w-px bg-black/10 sm:block" aria-hidden />;
}

const insightCaptionClass =
  "text-[11px] font-semibold uppercase tracking-wide leading-none text-black/45";

export function ReviewsPeriodInsights({
  reviews,
  compact = false,
}: {
  reviews: SentimentReview[];
  compact?: boolean;
}) {
  const insights = summarizeReviewPeriod(reviews);

  return (
    <div
      className={cn(
        pillSubNavShellClass,
        "items-center bg-black/[0.07] p-2.5 sm:flex-nowrap",
      )}
      aria-label="Selected period insights"
    >
      <div
        className={cn(
          "inline-flex min-w-0 flex-1 items-center justify-center px-3 py-2",
          compact ? "flex-col gap-1" : "flex-row gap-2",
        )}
      >
        <div
          className={cn(
            "flex items-center justify-center",
            compact && "min-h-7",
          )}
        >
          <GoogleStars rating={insights.averageRating} size="sm" />
        </div>
        <span className="tabular-nums text-sm font-semibold leading-none text-[#3D421F]">
          {insights.averageRating != null
            ? insights.averageRating.toFixed(1)
            : "—"}
        </span>
      </div>
      <InsightDivider />
      <div
        className={cn(
          "inline-flex min-w-0 flex-1 items-center justify-center px-3 py-2 text-[#3D421F]",
          compact ? "flex-col gap-1" : "flex-row gap-1.5 text-sm",
        )}
      >
        <div
          className={cn(
            "flex items-center justify-center",
            compact && "min-h-7",
          )}
        >
          <span className="tabular-nums text-sm font-semibold">
            {insights.total}
          </span>
        </div>
        <span className={compact ? insightCaptionClass : "text-black/50"}>
          {insights.total === 1 ? "review" : "reviews"}
        </span>
      </div>
      <InsightDivider />
      <div
        className={cn(
          "inline-flex min-w-0 flex-1 items-center justify-center px-3 py-2",
          compact ? "flex-col gap-1" : "flex-row gap-2",
        )}
      >
        {insights.overallLabel ? (
          <>
            <div
              className={cn(
                "flex items-center justify-center",
                compact && "min-h-7",
              )}
            >
              <SentimentBadge
                label={insights.overallLabel}
                score={insights.overallScore}
              />
            </div>
            <span className={insightCaptionClass}>Overall</span>
          </>
        ) : (
          <span className="text-sm text-black/40">No overall yet</span>
        )}
      </div>
    </div>
  );
}
