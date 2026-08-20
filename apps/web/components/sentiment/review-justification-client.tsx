"use client";

import { useRouter } from "next/navigation";
import { ReviewActionDialog } from "@/components/sentiment/review-action-dialog";
import { useVenueScope } from "@/components/providers/venue-scope-provider";
import { toScopedHref } from "@/lib/venue/scope-routing";
import type {
  SentimentReview,
  SentimentReviewAction,
} from "@/lib/sentiment/types";

export function ReviewJustificationClient({
  review,
  action,
  canEdit,
  currentUserId,
}: {
  review: SentimentReview;
  action: SentimentReviewAction;
  canEdit: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const { scope, slug } = useVenueScope();

  function goBack() {
    const href = canEdit ? "/sentiment/actions" : "/modules";
    router.push(toScopedHref(href, scope, slug));
  }

  return (
    <ReviewActionDialog
      open
      review={review}
      action={action}
      canEdit={canEdit}
      currentUserId={currentUserId}
      onClose={goBack}
      onSaved={() => router.refresh()}
    />
  );
}
