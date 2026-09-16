import { MobileAccessDenied } from "@/components/mobile/mobile-access-denied";
import { MobileSentimentScreen } from "@/components/mobile/mobile-sentiment-screen";
import { getMobileAppContext } from "@/lib/mobile/page-context";
import { canAccessMobileApp } from "@/lib/mobile/permissions";
import { canAccessActions } from "@/lib/sentiment/permissions";
import {
  loadSentimentWorkspace,
  loadStaffMentionRows,
  sentimentEditFlags,
} from "@/lib/sentiment/workspace";

type PageProps = {
  params: Promise<{ venueSlug: string }>;
};

export default async function MobileSentimentActionsPage({
  params,
}: PageProps) {
  const { venueSlug } = await params;
  const { venue, permissions, supabase } = await getMobileAppContext(venueSlug);

  if (
    !canAccessMobileApp(permissions, venue.id) ||
    !canAccessActions(permissions, venue.id)
  ) {
    return <MobileAccessDenied />;
  }

  const [workspace, staffRows] = await Promise.all([
    loadSentimentWorkspace(supabase, venue.id),
    loadStaffMentionRows(venue),
  ]);
  const flags = sentimentEditFlags(permissions, venue.id);

  return (
    <div className="h-full min-h-0 overflow-hidden mobile-app-canvas">
      <MobileSentimentScreen
        tab="actions"
        venue={venue}
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
