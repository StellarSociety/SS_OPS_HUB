import { ReviewActionsPanel } from "@/components/sentiment/review-actions-panel";
import { ReviewCard } from "@/components/sentiment/review-card";
import { Card } from "@/components/ui/card";
import { ScopedLink } from "@/components/layout/scoped-link";
import type {
  SentimentChannel,
  SentimentReplyTemplate,
  SentimentReview,
  SentimentReviewAction,
} from "@/lib/sentiment/types";

export function ReviewsList({
  reviews,
  channel,
  canEdit,
  canEditActions,
  googleCanPost,
  venueName,
  templates,
  actionsByReviewId,
}: {
  reviews: SentimentReview[];
  channel?: SentimentChannel;
  canEdit: boolean;
  canEditActions: boolean;
  googleCanPost: boolean;
  venueName: string;
  templates: SentimentReplyTemplate[];
  actionsByReviewId: Record<string, SentimentReviewAction>;
}) {
  if (reviews.length === 0) {
    const settingsHref = "/sentiment/settings";
    return (
      <Card className="p-8 text-center">
        <h2 className="font-serif text-xl text-[#3D421F]">
          {channel ? "No reviews imported yet" : "No reviews yet"}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-black/55">
          {channel === "tripadvisor"
            ? "TripAdvisor will connect from Settings in a later step."
            : "Connect Google in Settings and import reviews to see them here."}
        </p>
        {channel !== "tripadvisor" ? (
          <ScopedLink
            href={settingsHref}
            className="mt-4 inline-flex h-10 items-center rounded-md bg-[var(--venue-primary,#818a40)] px-4 text-sm font-medium text-white hover:opacity-90"
          >
            Open Settings
          </ScopedLink>
        ) : null}
      </Card>
    );
  }

  return (
    <div className="space-y-3">
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
