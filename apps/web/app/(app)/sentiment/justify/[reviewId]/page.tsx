import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import { ReviewJustificationClient } from "@/components/sentiment/review-justification-client";
import { canEditActions, canEditReviews } from "@/lib/sentiment/permissions";
import { getSentimentPageContext } from "@/lib/sentiment/page-context";
import { getReviewAction, getReviewById } from "@/lib/sentiment/store";
import { createServiceClient } from "@/lib/supabase/service";

export default async function ReviewJustificationPage({
  params,
}: {
  params: Promise<{ reviewId: string }>;
}) {
  const { reviewId } = await params;
  const { venue, permissions, user } = await getSentimentPageContext();
  const service = createServiceClient();
  const [review, action] = await Promise.all([
    getReviewById(service, venue.id, reviewId),
    getReviewAction(service, venue.id, reviewId),
  ]);

  const canEdit =
    canEditActions(permissions, venue.id) ||
    canEditReviews(permissions, venue.id);
  const isAssignee = action?.justification_requested_user_id === user.id;

  if (!review || !action || (!canEdit && !isAssignee)) {
    return <AccessDeniedBounce />;
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 px-1 py-8 text-sm text-black/50">
      <p>Opening the requested report…</p>
      <ReviewJustificationClient
        review={review}
        action={action}
        canEdit={canEdit}
        currentUserId={user.id}
      />
    </div>
  );
}
