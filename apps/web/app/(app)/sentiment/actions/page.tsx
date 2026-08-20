import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import { ModulePageTitle } from "@/components/layout/module-page-title";
import { ReviewActionsTable } from "@/components/sentiment/review-actions-table";
import { Card } from "@/components/ui/card";
import { ScopedLink } from "@/components/layout/scoped-link";
import {
  canAccessActions,
  canEditActions,
  canEditReviews,
} from "@/lib/sentiment/permissions";
import { getSentimentPageContext } from "@/lib/sentiment/page-context";
import { listReviewActions, listReviews } from "@/lib/sentiment/store";
import type { SentimentReview, SentimentReviewAction } from "@/lib/sentiment/types";

export default async function SentimentActionsPage() {
  const { supabase, venue, permissions, user } = await getSentimentPageContext();

  if (!canAccessActions(permissions, venue.id)) {
    return <AccessDeniedBounce />;
  }

  const [reviews, actions] = await Promise.all([
    listReviews(supabase, venue.id).catch(() => [] as SentimentReview[]),
    listReviewActions(supabase, venue.id).catch(
      () => [] as SentimentReviewAction[],
    ),
  ]);

  const actionsByReviewId: Record<string, SentimentReviewAction> = {};
  for (const action of actions) {
    actionsByReviewId[action.review_id] = action;
  }

  const rows = reviews
    .filter((review) => {
      const action = actionsByReviewId[review.id];
      const lowRating =
        typeof review.rating === "number" && review.rating <= 3;
      return Boolean(action) || lowRating;
    })
    .sort((left, right) => {
      const leftAction = actionsByReviewId[left.id];
      const rightAction = actionsByReviewId[right.id];
      const leftOpen =
        !leftAction ||
        leftAction.status === "open" ||
        leftAction.status === "in_progress";
      const rightOpen =
        !rightAction ||
        rightAction.status === "open" ||
        rightAction.status === "in_progress";
      if (leftOpen !== rightOpen) return leftOpen ? -1 : 1;
      return (right.reviewed_at ?? "").localeCompare(left.reviewed_at ?? "");
    })
    .map((review) => ({
      review,
      action: actionsByReviewId[review.id] ?? null,
    }));

  const canEdit =
    canEditActions(permissions, venue.id) ||
    canEditReviews(permissions, venue.id);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <div>
        <ModulePageTitle>Actions</ModulePageTitle>
        <p className="mt-1 text-sm text-black/60">
          Follow-up on weak reviews: what happened, then how you recovered the
          guest.
        </p>
        <hr className="mt-4 border-black/10" />
      </div>

      {rows.length === 0 ? (
        <Card className="p-8 text-center">
          <h2 className="font-serif text-xl text-[#3D421F]">No follow-ups yet</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-black/55">
            1–3 star reviews appear here automatically. You can also start a
            follow-up from any review card.
          </p>
          <ScopedLink
            href="/sentiment/reviews"
            className="mt-4 inline-flex h-10 items-center rounded-md bg-[var(--venue-primary,#818a40)] px-4 text-sm font-medium text-white hover:opacity-90"
          >
            Open Reviews
          </ScopedLink>
        </Card>
      ) : (
        <ReviewActionsTable
          rows={rows}
          canEdit={canEdit}
          currentUserId={user.id}
        />
      )}
    </div>
  );
}
