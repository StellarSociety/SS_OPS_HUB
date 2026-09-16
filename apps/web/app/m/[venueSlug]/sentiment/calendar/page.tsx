import { MobileAccessDenied } from "@/components/mobile/mobile-access-denied";
import { MobileSentimentScreen } from "@/components/mobile/mobile-sentiment-screen";
import { getMobileAppContext } from "@/lib/mobile/page-context";
import { canAccessMobileApp } from "@/lib/mobile/permissions";
import { canAccessReviews } from "@/lib/sentiment/permissions";
import {
  currentMonthKeyInDubai,
  firstDayOfMonth,
  isIsoMonth,
  lastDayOfMonth,
  lastTwelveMonthKeys,
} from "@/lib/sentiment/review-period";
import {
  loadSentimentWorkspace,
  loadStaffMentionRows,
  sentimentEditFlags,
} from "@/lib/sentiment/workspace";

type PageProps = {
  params: Promise<{ venueSlug: string }>;
  searchParams: Promise<{ month?: string }>;
};

export default async function MobileSentimentCalendarPage({
  params,
  searchParams,
}: PageProps) {
  const { venueSlug } = await params;
  const query = await searchParams;
  const { venue, permissions, supabase } = await getMobileAppContext(venueSlug);

  if (
    !canAccessMobileApp(permissions, venue.id) ||
    !canAccessReviews(permissions, venue.id)
  ) {
    return <MobileAccessDenied />;
  }

  const monthKey = isIsoMonth(query.month)
    ? query.month
    : currentMonthKeyInDubai();
  const stripMonthKeys = lastTwelveMonthKeys();
  const fromDate =
    monthKey < stripMonthKeys[0]!
      ? firstDayOfMonth(monthKey)
      : firstDayOfMonth(stripMonthKeys[0]!);
  const toDate =
    monthKey > stripMonthKeys[stripMonthKeys.length - 1]!
      ? lastDayOfMonth(monthKey)
      : lastDayOfMonth(stripMonthKeys[stripMonthKeys.length - 1]!);

  const [workspace, staffRows] = await Promise.all([
    loadSentimentWorkspace(supabase, venue.id, {
      range: { fromDate, toDate },
    }),
    loadStaffMentionRows(venue),
  ]);
  const flags = sentimentEditFlags(permissions, venue.id);

  return (
    <div className="h-full min-h-0 overflow-hidden mobile-app-canvas">
      <MobileSentimentScreen
        tab="calendar"
        venue={venue}
        monthKey={monthKey}
        bundle={{
          reviews: workspace.reviews,
          actionsByReviewId: workspace.actionsByReviewId,
          templates: workspace.templates,
          staffRows,
          googleCanPost: workspace.googleCanPost,
          ...flags,
        }}
      />
    </div>
  );
}
