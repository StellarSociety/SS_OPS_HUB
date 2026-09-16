import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import { SentimentDashboardMetrics } from "@/components/sentiment/dashboard-metrics";
import { SentimentWelcome } from "@/components/sentiment/sentiment-welcome";
import { buildSentimentDashboardModel } from "@/lib/sentiment/dashboard-data";
import {
  canAccessOverview,
  firstAccessibleSentimentPath,
} from "@/lib/sentiment/permissions";
import { getSentimentPageContext } from "@/lib/sentiment/page-context";
import {
  loadSentimentWorkspace,
  loadStaffMentionRows,
  sentimentEditFlags,
} from "@/lib/sentiment/workspace";
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

  const [{ data: profile }, workspace, staffRows] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user.id).single(),
    loadSentimentWorkspace(supabase, venue.id),
    loadStaffMentionRows(venue),
  ]);

  const userName = (profile?.full_name as string | null)?.trim() || null;
  const flags = sentimentEditFlags(permissions, venue.id);
  const dashboard = buildSentimentDashboardModel({
    venue: {
      slug: venue.slug,
      name: venue.name,
      isGlobal: venue.is_global,
      primaryColor: venue.primary_color,
      logoUrl: venue.logo_url,
      iconUrl: venue.icon_url,
      faviconUrl: venue.favicon_url,
    },
    reviews: workspace.reviews,
    actionsByReviewId: workspace.actionsByReviewId,
    templates: workspace.templates,
    staffRows,
    googleCanPost: workspace.googleCanPost,
    ...flags,
  });

  return (
    <div className="mx-auto w-full max-w-none space-y-6">
      <SentimentWelcome venue={venue} userName={userName} />
      <SentimentDashboardMetrics {...dashboard} />
    </div>
  );
}
