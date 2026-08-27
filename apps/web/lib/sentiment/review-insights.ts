import { dubaiCalendarDateIso } from "@/lib/hr/payroll/period";
import { MENU_ITEMS } from "./menu-items";
import {
  scoreReview,
  SENTIMENT_TOPIC_LABELS,
  type SentimentLabel,
} from "./score-review";
import type { SentimentReview, SentimentReviewAction } from "./types";

export const STAR_LEVELS = [5, 4, 3, 2, 1] as const;

export type StarLevel = (typeof STAR_LEVELS)[number];

export type StarCounts = Record<StarLevel, number>;

export const EMPTY_STAR_COUNTS: StarCounts = {
  1: 0,
  2: 0,
  3: 0,
  4: 0,
  5: 0,
};

export type ReviewPeriodInsights = {
  total: number;
  averageRating: number | null;
  starCounts: StarCounts;
  overallLabel: SentimentLabel | null;
  overallScore: number | null;
};

function labelFromScore(score: number): SentimentLabel {
  if (score <= 38) return "negative";
  if (score >= 68) return "positive";
  return "neutral";
}

function starBucket(rating: number): StarLevel {
  const rounded = Math.round(rating);
  return Math.max(1, Math.min(5, rounded)) as StarLevel;
}

export function reviewsAtStarLevel(
  reviews: SentimentReview[],
  stars: StarLevel,
): SentimentReview[] {
  return reviews.filter((review) => {
    if (typeof review.rating !== "number") return false;
    return starBucket(review.rating) === stars;
  });
}

export type MonthReviewStats = {
  key: string;
  count: number;
  average: number | null;
};

export function monthReviewStats(
  reviews: SentimentReview[],
  monthKey: string,
): MonthReviewStats {
  let count = 0;
  let ratingSum = 0;
  let rated = 0;
  for (const review of reviews) {
    const day = review.reviewed_at
      ? dubaiCalendarDateIso(review.reviewed_at)
      : null;
    if (!day?.startsWith(monthKey)) continue;
    count += 1;
    if (typeof review.rating === "number") {
      ratingSum += review.rating;
      rated += 1;
    }
  }
  return {
    key: monthKey,
    count,
    average: rated > 0 ? ratingSum / rated : null,
  };
}

export function reviewsInMonth(
  reviews: SentimentReview[],
  monthKey: string,
): SentimentReview[] {
  return reviews.filter((review) => {
    const day = review.reviewed_at
      ? dubaiCalendarDateIso(review.reviewed_at)
      : null;
    return Boolean(day?.startsWith(monthKey));
  });
}

export function monthStripStats(
  reviews: SentimentReview[],
  monthKeys: string[],
): MonthReviewStats[] {
  return monthKeys.map((key) => monthReviewStats(reviews, key));
}

export function summarizeReviewPeriod(
  reviews: SentimentReview[],
): ReviewPeriodInsights {
  const total = reviews.length;
  const rated = reviews.filter((review) => typeof review.rating === "number");
  const starCounts: StarCounts = { ...EMPTY_STAR_COUNTS };
  for (const review of rated) {
    starCounts[starBucket(review.rating ?? 0)] += 1;
  }
  const averageRating =
    rated.length > 0
      ? Number(
          (
            rated.reduce((sum, review) => sum + (review.rating ?? 0), 0) /
            rated.length
          ).toFixed(1),
        )
      : null;

  const scored = reviews.filter(
    (review) => typeof review.sentiment_score === "number",
  );
  const overallScore =
    scored.length > 0
      ? Math.round(
          scored.reduce(
            (sum, review) => sum + (review.sentiment_score ?? 0),
            0,
          ) / scored.length,
        )
      : null;

  const counts: Partial<Record<SentimentLabel, number>> = {};
  for (const review of reviews) {
    if (!review.sentiment_label) continue;
    counts[review.sentiment_label] = (counts[review.sentiment_label] ?? 0) + 1;
  }

  let overallLabel: SentimentLabel | null = null;
  let best = 0;
  let tied = false;
  for (const [label, count] of Object.entries(counts) as Array<
    [SentimentLabel, number]
  >) {
    if (count > best) {
      overallLabel = label;
      best = count;
      tied = false;
    } else if (count === best && count > 0) {
      tied = true;
    }
  }

  if (tied || overallLabel == null) {
    overallLabel = overallScore != null ? labelFromScore(overallScore) : null;
  }

  return { total, averageRating, starCounts, overallLabel, overallScore };
}

export function isUnrepliedReview(review: SentimentReview) {
  return Boolean(review.comment && !review.reply_text);
}

export function isOpenActionReview(
  review: SentimentReview,
  action: SentimentReviewAction | undefined,
) {
  if (action) {
    return action.status === "open" || action.status === "in_progress";
  }
  return typeof review.rating === "number" && review.rating <= 3;
}

export type NamedCount = {
  key: string;
  label: string;
  count: number;
};

function reviewTopics(review: SentimentReview): string[] {
  if (review.sentiment_topics?.length) return review.sentiment_topics;
  if (!review.comment?.trim()) return [];
  return scoreReview({ rating: review.rating, comment: review.comment }).topics;
}

export function countReviewTopics(reviews: SentimentReview[]): NamedCount[] {
  const counts = new Map<string, number>();
  for (const review of reviews) {
    for (const topic of reviewTopics(review)) {
      counts.set(topic, (counts.get(topic) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([key, count]) => ({
      key,
      label: SENTIMENT_TOPIC_LABELS[key] ?? key,
      count,
    }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

export function reviewsWithTopic(
  reviews: SentimentReview[],
  topic: string,
): SentimentReview[] {
  return reviews.filter((review) => reviewTopics(review).includes(topic));
}

const NAME_STOPWORDS = new Set([
  "the",
  "and",
  "our",
  "was",
  "were",
  "with",
  "from",
  "very",
  "this",
  "that",
  "they",
  "have",
  "been",
  "also",
  "just",
  "great",
  "good",
  "nice",
  "team",
  "staff",
  "guest",
  "manager",
  "waiter",
  "server",
  "host",
  "chef",
  "may",
  "june",
  "april",
  "august",
]);

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function staffSearchNames(staff: Array<{
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
}>): NamedCount[] {
  const names = new Map<string, string>();
  for (const row of staff) {
    const full = row.full_name?.trim();
    const first = row.first_name?.trim();
    const last = row.last_name?.trim();
    const combined = [first, last].filter(Boolean).join(" ").trim();
    for (const raw of [full, combined, first]) {
      if (!raw || raw.length < 3) continue;
      const key = raw.toLowerCase();
      if (NAME_STOPWORDS.has(key)) continue;
      if (!names.has(key)) names.set(key, raw);
    }
  }
  return [...names.entries()].map(([key, label]) => ({ key, label, count: 0 }));
}

export function countStaffMentions(
  reviews: SentimentReview[],
  names: NamedCount[],
): NamedCount[] {
  const comments = reviews
    .map((review) => review.comment?.trim() ?? "")
    .filter(Boolean);
  const ranked: NamedCount[] = [];
  for (const name of names) {
    const pattern = new RegExp(`\\b${escapeRegExp(name.label)}\\b`, "i");
    let count = 0;
    for (const comment of comments) {
      if (pattern.test(comment)) count += 1;
    }
    if (count > 0) ranked.push({ ...name, count });
  }
  return ranked.sort(
    (left, right) => right.count - left.count || left.label.localeCompare(right.label),
  );
}

export function reviewsMentioningName(
  reviews: SentimentReview[],
  name: string,
): SentimentReview[] {
  const pattern = new RegExp(`\\b${escapeRegExp(name)}\\b`, "i");
  return reviews.filter((review) =>
    Boolean(review.comment && pattern.test(review.comment)),
  );
}

export function countMenuItemMentions(
  reviews: SentimentReview[],
): NamedCount[] {
  const comments = reviews
    .map((review) => review.comment?.trim() ?? "")
    .filter(Boolean);
  const ranked: NamedCount[] = [];
  for (const item of MENU_ITEMS) {
    let count = 0;
    for (const comment of comments) {
      if (item.pattern.test(comment)) count += 1;
    }
    if (count > 0) ranked.push({ key: item.key, label: item.label, count });
  }
  return ranked.sort(
    (left, right) =>
      right.count - left.count || left.label.localeCompare(right.label),
  );
}

export function reviewsMentioningMenuItem(
  reviews: SentimentReview[],
  key: string,
): SentimentReview[] {
  const item = MENU_ITEMS.find((entry) => entry.key === key);
  if (!item) return [];
  return reviews.filter((review) =>
    Boolean(review.comment && item.pattern.test(review.comment)),
  );
}
