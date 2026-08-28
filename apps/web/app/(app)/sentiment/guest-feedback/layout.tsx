import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import { ModulePageTitle } from "@/components/layout/module-page-title";
import { GuestFeedbackSubNav } from "@/components/sentiment/guest-feedback-sub-nav";
import { canAccessGuestFeedback } from "@/lib/sentiment/permissions";
import { getSentimentPageContext } from "@/lib/sentiment/page-context";

export default async function GuestFeedbackLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { venue, permissions } = await getSentimentPageContext();

  if (!canAccessGuestFeedback(permissions, venue.id)) {
    return <AccessDeniedBounce />;
  }

  return (
    <div className="mx-auto flex h-full min-h-0 w-full flex-col gap-6">
      <div className="shrink-0 space-y-6">
        <div>
          <ModulePageTitle>Feedback Form</ModulePageTitle>
          <p className="mt-1 text-sm text-black/60">
            Configure the page guests open after a visit, then collect reviews for{" "}
            {venue.name}.
          </p>
          <hr className="mt-4 border-black/10" />
        </div>
        <GuestFeedbackSubNav />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
