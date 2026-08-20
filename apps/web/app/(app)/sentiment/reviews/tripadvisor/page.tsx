import { ReviewsList } from "@/components/sentiment/reviews-list";
import { getSentimentReviewsPage } from "@/lib/sentiment/page-context";

export default async function TripadvisorReviewsPage() {
  const {
    reviews,
    canEdit,
    canEditActions,
    googleCanPost,
    venueName,
    templates,
    actionsByReviewId,
  } = await getSentimentReviewsPage("tripadvisor");
  return (
    <ReviewsList
      reviews={reviews}
      channel="tripadvisor"
      canEdit={canEdit}
      canEditActions={canEditActions}
      googleCanPost={googleCanPost}
      venueName={venueName}
      templates={templates}
      actionsByReviewId={actionsByReviewId}
    />
  );
}
