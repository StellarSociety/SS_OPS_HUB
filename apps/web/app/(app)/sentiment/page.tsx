import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import { ModuleShortcuts } from "@/components/layout/module-shortcuts";
import { SentimentDashboardMetrics } from "@/components/sentiment/dashboard-metrics";
import { SentimentWelcome } from "@/components/sentiment/sentiment-welcome";
import {
  canAccessOverview,
  firstAccessibleSentimentPath,
} from "@/lib/sentiment/permissions";
import { getSentimentPageContext } from "@/lib/sentiment/page-context";
import { listReviewActions, listReviews } from "@/lib/sentiment/store";
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

  const [{ data: profile }, reviews, actions] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user.id).single(),
    listReviews(supabase, venue.id).catch(() => []),
    listReviewActions(supabase, venue.id).catch(() => []),
  ]);

  const userName = (profile?.full_name as string | null)?.trim() || null;

  function ratingSummary(channel?: "google" | "tripadvisor") {
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
  const thisMonth = reviews.filter((review) => {
    if (!review.reviewed_at) return false;
    const date = new Date(review.reviewed_at);
    const now = new Date();
    return (
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth()
    );
  }).length;
  const unreplied = reviews.filter(
    (review) => review.comment && !review.reply_text,
  ).length;
  const actionByReview = new Map(actions.map((action) => [action.review_id, action]));
  const openActions = reviews.filter((review) => {
    const action = actionByReview.get(review.id);
    if (action) {
      return action.status === "open" || action.status === "in_progress";
    }
    return typeof review.rating === "number" && review.rating <= 3;
  }).length;

  return (
    <div className="mx-auto w-full max-w-none space-y-6">
      <SentimentWelcome venue={venue} userName={userName} />

      <div>
        <ModuleShortcuts basePath="/sentiment" ariaLabel="Sentiment apps" />
        <hr className="mt-4 border-black/10" />
      </div>

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
            label: "Venue Rate",
            rating: venueRate.rating,
            hint:
              venueRate.rating != null
                ? `across ${venueRate.count} imported reviews`
                : "Import reviews to populate this",
          },
          {
            label: "Google",
            channel: "google",
            rating: googleRate.rating,
            hint:
              googleRate.rating != null
                ? `across ${googleRate.count} Google reviews`
                : "No Google reviews yet",
          },
          {
            label: "TripAdvisor",
            channel: "tripadvisor",
            rating: tripadvisorRate.rating,
            hint:
              tripadvisorRate.rating != null
                ? `across ${tripadvisorRate.count} TripAdvisor reviews`
                : "No TripAdvisor reviews yet",
          },
        ]}
        metrics={[
          {
            label: "This month",
            value: String(thisMonth),
            hint: "Reviews dated in the current month",
          },
          {
            label: "Awaiting reply",
            value: String(unreplied),
            hint: "Written reviews without an owner reply yet",
          },
          {
            label: "Open actions",
            value: String(openActions),
            hint: "1–3 star reviews or follow-ups still in progress",
          },
        ]}
      />
    </div>
  );
}
