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
  const withRating = reviews.filter((review) => typeof review.rating === "number");
  const average =
    withRating.length > 0
      ? (
          withRating.reduce((sum, review) => sum + (review.rating ?? 0), 0) /
          withRating.length
        ).toFixed(1)
      : "—";
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
        metrics={[
          {
            label: "Average rating",
            value: average,
            hint:
              withRating.length > 0
                ? `Across ${withRating.length} imported reviews`
                : "Import reviews to populate this",
          },
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
