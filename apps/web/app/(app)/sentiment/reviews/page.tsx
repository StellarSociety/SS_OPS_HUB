import { ReviewsList } from "@/components/sentiment/reviews-list";
import { getSentimentReviewsPage } from "@/lib/sentiment/page-context";
import type { ReviewPeriodSearchParams } from "@/lib/sentiment/review-period";

type PageProps = {
  searchParams: Promise<ReviewPeriodSearchParams>;
};

export default async function AllReviewsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const {
    reviews,
    period,
    canEdit,
    canEditActions,
    googleCanPost,
    venueName,
    templates,
    actionsByReviewId,
  } = await getSentimentReviewsPage(undefined, params);
  return (
    <ReviewsList
      reviews={reviews}
      period={period}
      canEdit={canEdit}
      canEditActions={canEditActions}
      googleCanPost={googleCanPost}
      venueName={venueName}
      templates={templates}
      actionsByReviewId={actionsByReviewId}
    />
  );
}
