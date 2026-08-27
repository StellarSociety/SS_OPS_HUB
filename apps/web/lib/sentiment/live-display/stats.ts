import {
  countReviewTopics,
  monthReviewStats,
  summarizeReviewPeriod,
} from "@/lib/sentiment/review-insights";
import { currentMonthKeyInDubai } from "@/lib/sentiment/review-period";
import type { SentimentReview, SentimentReviewSource } from "@/lib/sentiment/types";
import type { LiveDisplayListingStats } from "./types";

const DEFAULT_LOVED = ["Food", "Service", "Atmosphere"];

export function listingStatsFromSource(
  source: SentimentReviewSource | null | undefined,
  reviews: SentimentReview[],
): LiveDisplayListingStats {
  const average = source ? Number(source.rating_average) : NaN;
  const count = source ? Number(source.review_count) : NaN;
  if (Number.isFinite(average) && Number.isFinite(count) && count > 0) {
    return {
      rating: Number(average.toFixed(1)),
      reviewCount: count,
    };
  }
  return statsFromReviews(reviews);
}

export function statsFromReviews(
  reviews: SentimentReview[],
): LiveDisplayListingStats {
  const summary = summarizeReviewPeriod(reviews);
  return {
    rating: summary.averageRating,
    reviewCount: summary.total,
  };
}

export function combineListingStats(
  parts: LiveDisplayListingStats[],
): LiveDisplayListingStats {
  let weighted = 0;
  let count = 0;
  for (const part of parts) {
    if (part.rating == null || part.reviewCount <= 0) continue;
    weighted += part.rating * part.reviewCount;
    count += part.reviewCount;
  }
  if (count === 0) return { rating: null, reviewCount: 0 };
  return { rating: Number((weighted / count).toFixed(1)), reviewCount: count };
}

export function thisMonthStats(
  reviews: SentimentReview[],
  asOf = new Date(),
): LiveDisplayListingStats {
  const month = monthReviewStats(reviews, currentMonthKeyInDubai(asOf));
  return {
    rating: month.average != null ? Number(month.average.toFixed(1)) : null,
    reviewCount: month.count,
  };
}

export function guestsLoveTopics(reviews: SentimentReview[]): string[] {
  const loved = reviews.filter(
    (review) =>
      review.sentiment_label === "positive" ||
      (typeof review.rating === "number" && review.rating >= 4),
  );
  const ranked = countReviewTopics(loved)
    .filter((topic) => topic.count > 0)
    .slice(0, 3)
    .map((topic) => topic.label);
  if (ranked.length >= 3) return ranked;
  const seen = new Set(ranked.map((label) => label.toLowerCase()));
  for (const fallback of DEFAULT_LOVED) {
    if (ranked.length >= 3) break;
    if (!seen.has(fallback.toLowerCase())) ranked.push(fallback);
  }
  return ranked;
}

export function formatLiveUpdatedLabel(
  iso: string | null,
  now = new Date(),
): string {
  if (!iso) return "UPDATED JUST NOW";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "UPDATED JUST NOW";
  const minutes = Math.max(0, Math.floor((now.getTime() - then) / 60_000));
  if (minutes < 3) return "UPDATED JUST NOW";
  if (minutes < 60) return `UPDATED ${minutes} MIN AGO`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `UPDATED ${hours} HR${hours === 1 ? "" : "S"} AGO`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "UPDATED YESTERDAY";
  return `UPDATED ${days} DAYS AGO`;
}
