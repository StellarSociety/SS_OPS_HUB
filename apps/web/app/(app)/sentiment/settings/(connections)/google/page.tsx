import { GoogleConnectionCard } from "@/components/sentiment/google-connection-card";
import {
  googleOAuthConfigured,
  googlePlacesConfigured,
} from "@/lib/sentiment/google/oauth";
import { canAdminSettings } from "@/lib/sentiment/permissions";
import { getSentimentPageContext } from "@/lib/sentiment/page-context";
import { getReviewSource } from "@/lib/sentiment/store";

export default async function SentimentGoogleSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string }>;
}) {
  const { supabase, venue, permissions } = await getSentimentPageContext();
  const canEdit = canAdminSettings(permissions, venue.id);
  const googleSource = await getReviewSource(supabase, venue.id, "google").catch(
    () => null,
  );
  const params = await searchParams;
  const flash = flashMessage(params.google);

  return (
    <div className="space-y-6">
      <p className="text-sm text-black/55">
        Place ID, Places API key, and Google Business Profile for this venue.
        {!canEdit
          ? " You can view these settings; admin access is required to connect accounts."
          : null}
      </p>

      {flash ? (
        <p
          className={
            flash.kind === "error"
              ? "rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800"
              : "rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
          }
        >
          {flash.message}
        </p>
      ) : null}

      <GoogleConnectionCard
        source={googleSource}
        oauthConfigured={googleOAuthConfigured()}
        placesConfigured={
          googlePlacesConfigured() || Boolean(googleSource?.has_places_api_key)
        }
        canEdit={canEdit}
      />
    </div>
  );
}

function flashMessage(
  code: string | undefined,
): { kind: "ok" | "error"; message: string } | null {
  switch (code) {
    case "connected":
      return {
        kind: "ok",
        message:
          "Google account connected. Import reviews when a location is selected.",
      };
    case "denied":
      return { kind: "error", message: "Google access was not granted." };
    case "invalid":
      return {
        kind: "error",
        message: "The Google connection expired. Try Connect again.",
      };
    case "norefresh":
      return {
        kind: "error",
        message:
          "Google did not return a refresh token. Disconnect, then connect again and allow offline access.",
      };
    case "error":
      return { kind: "error", message: "Google connection failed. Try again." };
    default:
      return null;
  }
}
