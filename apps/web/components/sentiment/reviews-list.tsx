import { ReviewActionsPanel } from "@/components/sentiment/review-actions-panel";
import { ReviewCard } from "@/components/sentiment/review-card";
import { ReviewsPeriodInsights } from "@/components/sentiment/reviews-period-insights";
import { Card } from "@/components/ui/card";
import { ScopedLink } from "@/components/layout/scoped-link";
import type { ResolvedReviewPeriod } from "@/lib/sentiment/review-period";
import type {
  SentimentChannel,
  SentimentReplyTemplate,
  SentimentReview,
  SentimentReviewAction,
} from "@/lib/sentiment/types";

export function ReviewsList({
  reviews,
  period,
  channel,
  canEdit,
  canEditActions,
  googleCanPost,
  venueName,
  templates,
  actionsByReviewId,
}: {
  reviews: SentimentReview[];
  period: ResolvedReviewPeriod;
  channel?: SentimentChannel;
  canEdit: boolean;
  canEditActions: boolean;
  googleCanPost: boolean;
  venueName: string;
  templates: SentimentReplyTemplate[];
  actionsByReviewId: Record<string, SentimentReviewAction>;
}) {
  const filtered = period.period !== "all";
  const channelLabel =
    channel === "google"
      ? "Google reviews"
      : channel === "tripadvisor"
        ? "TripAdvisor reviews"
        : channel === "guest"
          ? "Guest reviews"
          : "reviews";

  if (reviews.length === 0) {
    const settingsHref =
      channel === "tripadvisor"
        ? "/sentiment/settings/tripadvisor"
        : channel === "google"
          ? "/sentiment/settings/google"
          : channel === "guest"
            ? "/sentiment/guest-feedback"
            : "/sentiment/settings";
    return (
      <div className="space-y-3">
        <ReviewsPeriodInsights reviews={reviews} />
        <Card className="p-8 text-center">
          <h2 className="font-serif text-xl text-[#3D421F]">
            {filtered
              ? `No ${channelLabel} in ${period.label}`
              : channel
                ? channel === "guest"
                  ? "No guest reviews yet"
                  : "No reviews imported yet"
                : "No reviews yet"}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-black/55">
            {filtered
              ? "Try another week, month, or day range — or choose All."
              : channel === "tripadvisor"
                ? "Save the TripAdvisor listing URL in Settings and refresh via Apify to see reviews here."
                : channel === "guest"
                  ? "Share the Guest Feedback link with diners. Their answers will appear here."
                  : "Connect Google in Settings and import reviews to see them here. A Places API key only works if Google returns review text; otherwise connect Google Business Profile."}
          </p>
          {!filtered ? (
            <ScopedLink
              href={settingsHref}
              className="mt-4 inline-flex h-10 items-center rounded-md bg-[var(--venue-primary,#818a40)] px-4 text-sm font-medium text-white hover:opacity-90"
            >
              {channel === "guest" ? "Open Guest Feedback" : "Open Settings"}
            </ScopedLink>
          ) : null}
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ReviewsPeriodInsights reviews={reviews} />
      {reviews.map((review) => (
        <div
          key={review.id}
          className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_19rem]"
        >
          <ReviewCard
            review={review}
            canEdit={canEdit}
            googleCanPost={googleCanPost}
            venueName={venueName}
            templates={templates}
          />
          <ReviewActionsPanel
            review={review}
            action={actionsByReviewId[review.id] ?? null}
            canEdit={canEditActions}
            mode="trigger"
          />
        </div>
      ))}
    </div>
  );
}
