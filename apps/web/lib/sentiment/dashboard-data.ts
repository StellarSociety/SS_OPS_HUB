import {
  countMenuItemMentions,
  countReviewTopics,
  countStaffMentions,
  isOpenActionReview,
  isUnrepliedReview,
  monthStripStats,
  reviewsInMonth,
  staffSearchNames,
  summarizeReviewPeriod,
} from "./review-insights";
import {
  currentMonthKeyInDubai,
  currentWeekMondayInDubai,
  lastTwelveMonthKeys,
  reviewPeriodQuery,
} from "./review-period";
import type { StaffMentionRow } from "./workspace";
import type {
  SentimentReplyTemplate,
  SentimentReview,
  SentimentReviewAction,
} from "./types";

export type SentimentDashboardVenue = {
  slug: string;
  name: string;
  isGlobal: boolean;
  primaryColor: string;
  logoUrl: string | null;
  iconUrl: string | null;
  faviconUrl: string | null;
};

export function buildSentimentDashboardModel({
  venue,
  reviews,
  actionsByReviewId,
  templates,
  staffRows,
  canEdit,
  canEditActions,
  googleCanPost,
}: {
  venue: SentimentDashboardVenue;
  reviews: SentimentReview[];
  actionsByReviewId: Record<string, SentimentReviewAction>;
  templates: SentimentReplyTemplate[];
  staffRows: StaffMentionRow[];
  canEdit: boolean;
  canEditActions: boolean;
  googleCanPost: boolean;
}) {
  function ratingSummary(channel?: "google" | "tripadvisor" | "guest") {
    const rated = reviews.filter(
      (review) =>
        typeof review.rating === "number" &&
        (!channel || review.channel === channel),
    );
    if (rated.length === 0) {
      return { rating: null as number | null, count: 0 };
    }
    const average =
      rated.reduce((sum, review) => sum + (review.rating ?? 0), 0) /
      rated.length;
    return { rating: Number(average.toFixed(1)), count: rated.length };
  }

  const monthKey = currentMonthKeyInDubai();
  const weekQuery = reviewPeriodQuery({
    period: "week",
    weekKey: currentWeekMondayInDubai(),
  });
  const venueRate = ratingSummary();
  const googleRate = ratingSummary("google");
  const tripadvisorRate = ratingSummary("tripadvisor");
  const guestRate = ratingSummary("guest");

  return {
    venue,
    ratings: [
      {
        label: "Venue Overall Rate",
        rating: venueRate.rating,
        count: venueRate.count,
        href: `/sentiment/reviews?${weekQuery}`,
        hintAfter: "imported reviews",
        emptyHint: "Import reviews to populate this",
      },
      {
        label: "Google",
        channel: "google" as const,
        rating: googleRate.rating,
        count: googleRate.count,
        href: `/sentiment/reviews/google?${weekQuery}`,
        hintAfter: "Google reviews",
        emptyHint: "No Google reviews yet",
      },
      {
        label: "TripAdvisor",
        channel: "tripadvisor" as const,
        rating: tripadvisorRate.rating,
        count: tripadvisorRate.count,
        href: `/sentiment/reviews/tripadvisor?${weekQuery}`,
        hintAfter: "TripAdvisor reviews",
        emptyHint: "No TripAdvisor reviews yet",
      },
      {
        label: "Feedback Form",
        channel: "guest" as const,
        rating: guestRate.rating,
        count: guestRate.count,
        href: `/sentiment/reviews/guest?${weekQuery}`,
        hintAfter: "feedback form reviews",
        emptyHint: "No feedback form reviews yet",
      },
    ],
    followUp: {
      unreplied: reviews.filter(isUnrepliedReview),
      openActions: reviews.filter((review) =>
        isOpenActionReview(review, actionsByReviewId[review.id]),
      ),
      actionsByReviewId,
      canEdit,
      canEditActions,
      googleCanPost,
      venueName: venue.name,
      templates,
    },
    thisMonth: summarizeReviewPeriod(reviewsInMonth(reviews, monthKey)),
    thisMonthReviews: reviewsInMonth(reviews, monthKey),
    topicCounts: countReviewTopics(reviews),
    menuItemMentions: countMenuItemMentions(reviews),
    staffMentions: countStaffMentions(reviews, staffSearchNames(staffRows)),
    overall: summarizeReviewPeriod(reviews),
    overallReviews: reviews,
    monthStrip: monthStripStats(reviews, lastTwelveMonthKeys()),
    selectedMonthKey: monthKey,
  };
}
