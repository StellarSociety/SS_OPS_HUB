import type { SentimentReview, SentimentReviewAction } from "./types";

export type SentimentActionRow = {
  review: SentimentReview;
  action: SentimentReviewAction | null;
};

export function followUpActionRows(
  reviews: SentimentReview[],
  actionsByReviewId: Record<string, SentimentReviewAction>,
): SentimentActionRow[] {
  return reviews
    .filter((review) => {
      const action = actionsByReviewId[review.id];
      const lowRating =
        typeof review.rating === "number" && review.rating <= 3;
      return Boolean(action) || lowRating;
    })
    .sort((left, right) => {
      const leftReplied = Boolean(left.reply_text?.trim());
      const rightReplied = Boolean(right.reply_text?.trim());
      if (leftReplied !== rightReplied) return leftReplied ? 1 : -1;
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
}
