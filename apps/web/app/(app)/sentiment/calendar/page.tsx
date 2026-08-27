import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import { ModulePageTitle } from "@/components/layout/module-page-title";
import { ReviewsCalendar } from "@/components/sentiment/reviews-calendar";
import { canAccessReviews } from "@/lib/sentiment/permissions";
import { getSentimentReviewsPage } from "@/lib/sentiment/page-context";
import {
  currentMonthKeyInDubai,
  firstDayOfMonth,
  isIsoMonth,
  lastDayOfMonth,
  lastTwelveMonthKeys,
} from "@/lib/sentiment/review-period";

type PageProps = {
  searchParams: Promise<{ month?: string }>;
};

export default async function SentimentReviewsCalendarPage({
  searchParams,
}: PageProps) {
  const params = await searchParams;
  const monthKey = isIsoMonth(params.month)
    ? params.month
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

  const {
    reviews,
    canEdit,
    canEditActions,
    googleCanPost,
    venueName,
    venueId,
    permissions,
    templates,
    actionsByReviewId,
  } = await getSentimentReviewsPage(undefined, {
    period: "days",
    from: fromDate,
    to: toDate,
  });

  if (!canAccessReviews(permissions, venueId)) {
    return <AccessDeniedBounce />;
  }

  return (
    <div className="mx-auto w-full max-w-none space-y-6">
      <div>
        <ModulePageTitle>Calendar</ModulePageTitle>
        <p className="mt-1 text-sm text-black/60">
          Guest reviews for {venueName} by posted date.
        </p>
        <hr className="mt-4 border-black/10" />
      </div>

      <ReviewsCalendar
        monthKey={monthKey}
        stripMonthKeys={stripMonthKeys}
        reviews={reviews}
        canEdit={canEdit}
        canEditActions={canEditActions}
        googleCanPost={googleCanPost}
        venueName={venueName}
        templates={templates}
        actionsByReviewId={actionsByReviewId}
      />
    </div>
  );
}
