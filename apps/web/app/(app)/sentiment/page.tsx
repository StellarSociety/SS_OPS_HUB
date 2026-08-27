import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import { SentimentDashboardMetrics } from "@/components/sentiment/dashboard-metrics";
import { SentimentWelcome } from "@/components/sentiment/sentiment-welcome";
import {
  canAccessOverview,
  canEditActions,
  canEditReviews,
  firstAccessibleSentimentPath,
} from "@/lib/sentiment/permissions";
import { getSentimentPageContext } from "@/lib/sentiment/page-context";
import {
  getReviewSource,
  listReplyTemplates,
  listReviewActions,
  listReviews,
} from "@/lib/sentiment/store";
import {
  currentMonthKeyInDubai,
  currentWeekMondayInDubai,
  lastTwelveMonthKeys,
  reviewPeriodQuery,
} from "@/lib/sentiment/review-period";
import { createServiceClient } from "@/lib/supabase/service";
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
} from "@/lib/sentiment/review-insights";
import { scopedPath } from "@/lib/venue/active-venue";
import { redirect } from "next/navigation";

export default async function SentimentDashboardPage() {
  const { supabase, venue, permissions, user } =
    await getSentimentPageContext();

  if (!canAccessOverview(permissions, venue.id)) {
    const fallback = firstAccessibleSentimentPath(permissions, venue.id);
    if (fallback && fallback !== "/sentiment") {
      redirect(await scopedPath(fallback));
    }
    return <AccessDeniedBounce />;
  }

  const [{ data: profile }, reviews, actions, templates, source, staffRows] =
    await Promise.all([
      supabase.from("profiles").select("full_name").eq("id", user.id).single(),
      listReviews(supabase, venue.id).catch(() => []),
      listReviewActions(supabase, venue.id).catch(() => []),
      listReplyTemplates(supabase, venue.id).catch(() => []),
      getReviewSource(supabase, venue.id, "google").catch(() => null),
      venue.is_global
        ? Promise.resolve(
            [] as Array<{
              first_name: string | null;
              last_name: string | null;
              full_name: string | null;
            }>,
          )
        : (async () => {
            try {
              const { data } = await createServiceClient()
                .from("staff")
                .select("first_name, last_name, full_name")
                .eq("home_venue_id", venue.id);
              return data ?? [];
            } catch {
              return [];
            }
          })(),
    ]);

  const userName = (profile?.full_name as string | null)?.trim() || null;

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

  const venueRate = ratingSummary();
  const googleRate = ratingSummary("google");
  const tripadvisorRate = ratingSummary("tripadvisor");
  const guestRate = ratingSummary("guest");
  const monthKey = currentMonthKeyInDubai();
  const weekQuery = reviewPeriodQuery({
    period: "week",
    weekKey: currentWeekMondayInDubai(),
  });
  const overall = summarizeReviewPeriod(reviews);
  const thisMonth = summarizeReviewPeriod(reviewsInMonth(reviews, monthKey));
  const actionsByReviewId = Object.fromEntries(
    actions.map((action) => [action.review_id, action]),
  );
  const unreplied = reviews.filter(isUnrepliedReview);
  const openActions = reviews.filter((review) =>
    isOpenActionReview(review, actionsByReviewId[review.id]),
  );

  return (
    <div className="mx-auto w-full max-w-none space-y-6">
      <SentimentWelcome venue={venue} userName={userName} />

      <SentimentDashboardMetrics
        venue={{
          slug: venue.slug,
          name: venue.name,
          isGlobal: venue.is_global,
          primaryColor: venue.primary_color,
          logoUrl: venue.logo_url,
          iconUrl: venue.icon_url,
          faviconUrl: venue.favicon_url,
        }}
        ratings={[
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
            channel: "google",
            rating: googleRate.rating,
            count: googleRate.count,
            href: `/sentiment/reviews/google?${weekQuery}`,
            hintAfter: "Google reviews",
            emptyHint: "No Google reviews yet",
          },
          {
            label: "TripAdvisor",
            channel: "tripadvisor",
            rating: tripadvisorRate.rating,
            count: tripadvisorRate.count,
            href: `/sentiment/reviews/tripadvisor?${weekQuery}`,
            hintAfter: "TripAdvisor reviews",
            emptyHint: "No TripAdvisor reviews yet",
          },
          {
            label: "Feedback Form",
            channel: "guest",
            rating: guestRate.rating,
            count: guestRate.count,
            href: `/sentiment/reviews/guest?${weekQuery}`,
            hintAfter: "feedback form reviews",
            emptyHint: "No feedback form reviews yet",
          },
        ]}
        followUp={{
          unreplied,
          openActions,
          actionsByReviewId,
          canEdit: canEditReviews(permissions, venue.id),
          canEditActions:
            canEditActions(permissions, venue.id) ||
            canEditReviews(permissions, venue.id),
          googleCanPost: Boolean(
            source?.connected_via_oauth &&
              source.external_account_id &&
              source.external_location_id,
          ),
          venueName: venue.name,
          templates,
        }}
        thisMonth={thisMonth}
        thisMonthReviews={reviewsInMonth(reviews, monthKey)}
        topicCounts={countReviewTopics(reviews)}
        menuItemMentions={countMenuItemMentions(reviews)}
        staffMentions={countStaffMentions(reviews, staffSearchNames(staffRows))}
        overall={overall}
        overallReviews={reviews}
        monthStrip={monthStripStats(reviews, lastTwelveMonthKeys())}
        selectedMonthKey={monthKey}
      />
    </div>
  );
}
