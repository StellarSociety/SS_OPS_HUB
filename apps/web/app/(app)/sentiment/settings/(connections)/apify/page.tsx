import { ApifyConnectionCard } from "@/components/sentiment/apify-connection-card";
import { apifyConfigured } from "@/lib/sentiment/apify/sync";
import { canAdminSettings } from "@/lib/sentiment/permissions";
import { getSentimentPageContext } from "@/lib/sentiment/page-context";
import { getReviewSource } from "@/lib/sentiment/store";

export default async function SentimentApifySettingsPage() {
  const { supabase, venue, permissions } = await getSentimentPageContext();
  const canEdit = canAdminSettings(permissions, venue.id);
  const googleSource = await getReviewSource(supabase, venue.id, "google").catch(
    () => null,
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-black/55">
        Use Apify to keep Google and TripAdvisor reviews current. Save a Google
        Place ID or TripAdvisor listing URL on those tabs first.
        {!canEdit
          ? " You can view this connection; admin access is required to refresh."
          : null}
      </p>
      <ApifyConnectionCard
        source={googleSource}
        apifyConfigured={apifyConfigured()}
        canEdit={canEdit}
      />
    </div>
  );
}
