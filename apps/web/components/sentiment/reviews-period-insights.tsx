import { GoogleStars } from "@/components/sentiment/google-stars";
import { SentimentBadge } from "@/components/sentiment/sentiment-badge";
import { summarizeReviewPeriod } from "@/lib/sentiment/review-insights";
import { pillSubNavShellClass } from "@/lib/sub-nav-ui";
import { cn } from "@/lib/utils";
import type { SentimentReview } from "@/lib/sentiment/types";

function InsightDivider() {
  return <span className="hidden h-7 w-px bg-black/10 sm:block" aria-hidden />;
}

export function ReviewsPeriodInsights({
  reviews,
}: {
  reviews: SentimentReview[];
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
      <div className="inline-flex min-w-0 flex-1 items-center justify-center gap-2 px-3 py-2">
        <GoogleStars rating={insights.averageRating} size="sm" />
        <span className="tabular-nums text-sm font-semibold text-[#3D421F]">
          {insights.averageRating != null
            ? insights.averageRating.toFixed(1)
            : "—"}
        </span>
      </div>
      <InsightDivider />
      <div className="inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 px-3 py-2 text-sm text-[#3D421F]">
        <span className="tabular-nums font-semibold">{insights.total}</span>
        <span className="text-black/50">
          {insights.total === 1 ? "review" : "reviews"}
        </span>
      </div>
      <InsightDivider />
      <div className="inline-flex min-w-0 flex-1 items-center justify-center gap-2 px-3 py-2">
        {insights.overallLabel ? (
          <>
            <SentimentBadge
              label={insights.overallLabel}
              score={insights.overallScore}
            />
            <span className="text-[11px] font-semibold uppercase tracking-wide text-black/45">
              Overall
            </span>
          </>
        ) : (
          <span className="text-sm text-black/40">No overall yet</span>
        )}
      </div>
    </div>
  );
}
