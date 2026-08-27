import { TripadvisorConnectionCard } from "@/components/sentiment/tripadvisor-connection-card";
import { apifyConfigured } from "@/lib/sentiment/apify/sync";
import { canAdminSettings } from "@/lib/sentiment/permissions";
import { getSentimentPageContext } from "@/lib/sentiment/page-context";
import { getReviewSource } from "@/lib/sentiment/store";

export default async function SentimentTripadvisorSettingsPage() {
  const { supabase, venue, permissions } = await getSentimentPageContext();
  const canEdit = canAdminSettings(permissions, venue.id);
  const source = await getReviewSource(supabase, venue.id, "tripadvisor").catch(
    () => null,
  );

  return (
    <div className="space-y-4">
      <p className="text-sm text-black/55">
        Save the venue TripAdvisor listing URL, then import recent reviews with
        Apify.
        {!canEdit
          ? " You can view this connection; admin access is required to save or refresh."
          : null}
      </p>
      <TripadvisorConnectionCard
        source={source}
        apifyConfigured={apifyConfigured()}
        canEdit={canEdit}
      />
    </div>
  );
}
