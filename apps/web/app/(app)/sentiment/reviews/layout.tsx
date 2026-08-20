import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import { ModulePageTitle } from "@/components/layout/module-page-title";
import { ReviewsSubNav } from "@/components/sentiment/reviews-sub-nav";
import { canAccessReviews } from "@/lib/sentiment/permissions";
import { getSentimentPageContext } from "@/lib/sentiment/page-context";

export default async function SentimentReviewsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { venue, permissions } = await getSentimentPageContext();

  if (!canAccessReviews(permissions, venue.id)) {
    return <AccessDeniedBounce />;
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div>
        <ModulePageTitle>Reviews</ModulePageTitle>
        <p className="mt-1 text-sm text-black/60">
          Guest reviews for {venue.name}. Use the practice review to try replies
          before connecting Google.
        </p>
        <hr className="mt-4 border-black/10" />
      </div>

      <ReviewsSubNav />
      {children}
    </div>
  );
}
