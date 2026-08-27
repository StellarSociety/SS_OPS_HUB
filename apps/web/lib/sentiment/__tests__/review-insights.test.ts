import { describe, expect, it } from "vitest";
import {
  countMenuItemMentions,
  countReviewTopics,
  countStaffMentions,
  monthReviewStats,
  staffSearchNames,
  summarizeReviewPeriod,
} from "../review-insights";
import type { SentimentReview } from "../types";

function review(
  overrides: Partial<SentimentReview> &
    Pick<SentimentReview, "rating" | "sentiment_label" | "sentiment_score">,
): SentimentReview {
  return {
    id: "r",
    venue_id: "v",
    source_id: "s",
    channel: "google",
    external_id: "e",
    author_name: null,
    author_photo_url: null,
    comment: null,
    reviewed_at: null,
    language: null,
    reply_text: null,
    reply_at: null,
    review_url: null,
    status: "new",
    is_practice: false,
    reply_sync_status: null,
    reply_sync_error: null,
    author_profile_url: null,
    author_is_local_guide: false,
    author_review_count: null,
    photo_urls: [],
    sentiment_topics: [],
    sentiment_analyzed_at: null,
    imported_at: "",
    updated_at: "",
    ...overrides,
  };
}

describe("summarizeReviewPeriod", () => {
  it("returns empty insights when there are no reviews", () => {
    expect(summarizeReviewPeriod([])).toEqual({
      total: 0,
      averageRating: null,
      starCounts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      overallLabel: null,
      overallScore: null,
    });
  });

  it("averages stars and scores, and uses the majority sentiment", () => {
    const insights = summarizeReviewPeriod([
      review({ rating: 5, sentiment_label: "positive", sentiment_score: 90 }),
      review({ rating: 4, sentiment_label: "positive", sentiment_score: 80 }),
      review({ rating: 2, sentiment_label: "negative", sentiment_score: 20 }),
    ]);
    expect(insights.total).toBe(3);
    expect(insights.averageRating).toBe(3.7);
    expect(insights.starCounts).toEqual({ 1: 0, 2: 1, 3: 0, 4: 1, 5: 1 });
    expect(insights.overallScore).toBe(63);
    expect(insights.overallLabel).toBe("positive");
  });
});

describe("monthReviewStats", () => {
  it("counts ratings for the Dubai calendar month", () => {
    const stats = monthReviewStats(
      [
        review({
          rating: 5,
          sentiment_label: "positive",
          sentiment_score: 90,
          reviewed_at: "2026-02-02T10:00:00+04:00",
        }),
        review({
          rating: 4,
          sentiment_label: "positive",
          sentiment_score: 80,
          reviewed_at: "2026-02-20T10:00:00+04:00",
        }),
        review({
          rating: 3,
          sentiment_label: "neutral",
          sentiment_score: 50,
          reviewed_at: "2026-03-01T10:00:00+04:00",
        }),
      ],
      "2026-02",
    );
    expect(stats).toEqual({ key: "2026-02", count: 2, average: 4.5 });
  });
});

describe("review mentions", () => {
  it("ranks topic tags by how often they appear", () => {
    expect(
      countReviewTopics([
        review({
          rating: 5,
          sentiment_label: "positive",
          sentiment_score: 90,
          sentiment_topics: ["food", "service"],
        }),
        review({
          rating: 4,
          sentiment_label: "positive",
          sentiment_score: 80,
          sentiment_topics: ["food"],
        }),
      ]),
    ).toEqual([
      { key: "food", label: "Food", count: 2 },
      { key: "service", label: "Service", count: 1 },
    ]);
  });

  it("counts staff names mentioned in comments", () => {
    const names = staffSearchNames([
      { first_name: "Layla", last_name: "Hassan", full_name: "Layla Hassan" },
    ]);
    const ranked = countStaffMentions(
      [
        review({
          rating: 5,
          sentiment_label: "positive",
          sentiment_score: 90,
          comment: "Layla was wonderful at the table.",
        }),
        review({
          rating: 5,
          sentiment_label: "positive",
          sentiment_score: 90,
          comment: "Ask for Layla Hassan next time.",
        }),
        review({
          rating: 4,
          sentiment_label: "positive",
          sentiment_score: 80,
          comment: "Great food.",
        }),
      ],
      names,
    );
    expect(ranked.map((row) => row.label)).toEqual(
      expect.arrayContaining(["Layla", "Layla Hassan"]),
    );
    expect(ranked.find((row) => row.label === "Layla")?.count).toBe(2);
  });

  it("ranks menu items mentioned in comments", () => {
    expect(
      countMenuItemMentions([
        review({
          rating: 5,
          sentiment_label: "positive",
          sentiment_score: 90,
          comment: "The 100 layer lasagna and lamb shoulder were perfect.",
        }),
        review({
          rating: 4,
          sentiment_label: "positive",
          sentiment_score: 80,
          comment: "Lasagne was dry. Tuna tartare was the highlight.",
        }),
        review({
          rating: 5,
          sentiment_label: "positive",
          sentiment_score: 90,
          comment: "Great atmosphere.",
        }),
      ]),
    ).toEqual([
      { key: "lasagna", label: "Lasagna", count: 2 },
      { key: "lamb-shoulder", label: "Lamb shoulder", count: 1 },
      { key: "tuna-tartare", label: "Tuna tartare", count: 1 },
    ]);
  });
});
