import { Suspense } from "react";
import { MobileAccessDenied } from "@/components/mobile/mobile-access-denied";
import { MobileSentimentScreen } from "@/components/mobile/mobile-sentiment-screen";
import { getMobileAppContext } from "@/lib/mobile/page-context";
import { canAccessMobileApp } from "@/lib/mobile/permissions";
import { canAccessReviews } from "@/lib/sentiment/permissions";
import {
  resolveReviewPeriod,
  type ReviewPeriodSearchParams,
} from "@/lib/sentiment/review-period";
import {
  loadSentimentWorkspace,
  loadStaffMentionRows,
  sentimentEditFlags,
} from "@/lib/sentiment/workspace";

type PageProps = {
  params: Promise<{ venueSlug: string }>;
  searchParams: Promise<ReviewPeriodSearchParams>;
};

export default async function MobileSentimentReviewsPage({
  params,
  searchParams,
}: PageProps) {
  const { venueSlug } = await params;
  const periodParams = await searchParams;
  const { venue, permissions, supabase } = await getMobileAppContext(venueSlug);

  if (
    !canAccessMobileApp(permissions, venue.id) ||
    !canAccessReviews(permissions, venue.id)
  ) {
    return <MobileAccessDenied />;
  }

  const period = resolveReviewPeriod(periodParams);
  const range =
    period.fromDate && period.toDate
      ? { fromDate: period.fromDate, toDate: period.toDate }
      : null;
  const [workspace, staffRows] = await Promise.all([
    loadSentimentWorkspace(supabase, venue.id, { range }),
    loadStaffMentionRows(venue),
  ]);
  const flags = sentimentEditFlags(permissions, venue.id);

  return (
    <div className="h-full min-h-0 overflow-hidden mobile-app-canvas">
      <Suspense fallback={null}>
        <MobileSentimentScreen
          tab="reviews"
          venue={venue}
          period={period}
          bundle={{
            reviews: workspace.reviews,
            actionsByReviewId: workspace.actionsByReviewId,
            templates: workspace.templates,
            staffRows,
            googleCanPost: workspace.googleCanPost,
            ...flags,
          }}
        />
      </Suspense>
    </div>
  );
}
