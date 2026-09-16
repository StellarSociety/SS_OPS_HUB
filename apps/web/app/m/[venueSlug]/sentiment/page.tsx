import { MobileAccessDenied } from "@/components/mobile/mobile-access-denied";
import { MobileSentimentScreen } from "@/components/mobile/mobile-sentiment-screen";
import { getMobileAppContext } from "@/lib/mobile/page-context";
import { canAccessMobileApp } from "@/lib/mobile/permissions";
import { MOBILE_APP_BASE } from "@/lib/mobile/app-path";
import {
  canAccessOverview,
  firstAccessibleMobileSentimentPath,
} from "@/lib/sentiment/permissions";
import {
  loadSentimentWorkspace,
  loadStaffMentionRows,
  sentimentEditFlags,
} from "@/lib/sentiment/workspace";
import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ venueSlug: string }>;
};

export default async function MobileSentimentDashboardPage({
  params,
}: PageProps) {
  const { venueSlug } = await params;
  const { venue, permissions, supabase } = await getMobileAppContext(venueSlug);

  if (!canAccessMobileApp(permissions, venue.id)) {
    return <MobileAccessDenied />;
  }

  if (!canAccessOverview(permissions, venue.id)) {
    const fallback = firstAccessibleMobileSentimentPath(permissions, venue.id);
    if (fallback && fallback !== "/sentiment") {
      redirect(`${MOBILE_APP_BASE}/${venue.slug}${fallback}`);
    }
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
        tab="dashboard"
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
