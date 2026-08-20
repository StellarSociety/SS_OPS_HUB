import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret, encryptSecret } from "@/lib/email/secret";
import { listGoogleBusinessReviews } from "@/lib/sentiment/google/business-profile";
import { refreshGoogleAccessToken } from "@/lib/sentiment/google/oauth";
import {
  fetchPlaceDetails,
  resolvePlacesApiKey,
} from "@/lib/sentiment/google/places";
import {
  getReviewSource,
  getSourceSecrets,
  updateReviewSource,
  upsertReviews,
  type ReviewUpsertInput,
} from "@/lib/sentiment/store";

export type GoogleSyncResult = {
  imported: number;
  average: number | null;
  total: number | null;
};

function placesReviewsUnavailableMessage(
  rating: number | null,
  reviewCount: number | null,
): string {
  const listing =
    rating != null && reviewCount != null
      ? ` The listing rating loaded (${rating} from ${reviewCount} ratings), but Google did not return any review text.`
      : " Google did not return any review text.";
  return `${listing.trim()} This Places API key is not receiving the reviews field (photos are omitted too). Connect Google Business Profile to import the venue's reviews.`;
}

function toReviewRow(
  venueId: string,
  sourceId: string,
  review: {
    externalId: string;
    authorName: string | null;
    authorPhotoUrl: string | null;
    rating: number | null;
    comment: string | null;
    reviewedAt: string | null;
    language: string | null;
    replyText?: string | null;
    replyAt?: string | null;
    reviewUrl: string | null;
    raw: Record<string, unknown>;
    authorProfileUrl?: string | null;
    photoUrls?: string[];
  },
): ReviewUpsertInput {
  return {
    venue_id: venueId,
    source_id: sourceId,
    channel: "google",
    external_id: review.externalId,
    author_name: review.authorName,
    author_photo_url: review.authorPhotoUrl,
    rating: review.rating,
    comment: review.comment,
    reviewed_at: review.reviewedAt,
    language: review.language,
    ...(review.replyText !== undefined
      ? { reply_text: review.replyText ?? null, reply_at: review.replyAt ?? null }
      : {}),
    review_url: review.reviewUrl,
    raw: review.raw,
    ...(review.authorProfileUrl
      ? { author_profile_url: review.authorProfileUrl }
      : {}),
    ...(review.photoUrls && review.photoUrls.length > 0
      ? { photo_urls: review.photoUrls }
      : {}),
  };
}

export async function syncGoogleReviewsForVenue(
  service: SupabaseClient,
  venueId: string,
): Promise<GoogleSyncResult> {
  const source = await getReviewSource(service, venueId, "google");
  const secrets = await getSourceSecrets(service, venueId, "google");
  if (!source || !secrets) {
    throw new Error("Save a Google Place ID or connect a Google account first.");
  }

  let imported = 0;
  let average: number | null = source.rating_average;
  let total: number | null = source.review_count;

  if (
    secrets.refresh_token_encrypted &&
    secrets.external_account_id &&
    secrets.external_location_id
  ) {
    const access = await refreshGoogleAccessToken(
      decryptSecret(secrets.refresh_token_encrypted),
    );
    await updateReviewSource(service, source.id, {
      access_token_encrypted: encryptSecret(access.accessToken),
      access_token_expires_at: access.expiresAt,
    });
    const listed = await listGoogleBusinessReviews(
      access.accessToken,
      secrets.external_account_id,
      secrets.external_location_id,
    );
    imported = await upsertReviews(
      service,
      listed.reviews.map((review) => toReviewRow(venueId, source.id, review)),
    );
    average = listed.averageRating;
    total = listed.totalReviewCount;
  } else if (secrets.place_id) {
    const details = await fetchPlaceDetails(
      secrets.place_id,
      resolvePlacesApiKey(secrets.places_api_key_encrypted),
    );
    average = details.rating;
    total = details.userRatingCount;
    if (details.reviews.length === 0) {
      const message = placesReviewsUnavailableMessage(
        details.rating,
        details.userRatingCount,
      );
      await updateReviewSource(service, source.id, {
        status: "connected",
        last_error: message,
        rating_average: average,
        review_count: total,
        location_name: details.displayName ?? source.location_name,
        location_url: details.mapsUri ?? source.location_url,
      });
      throw new Error(message);
    }
    imported = await upsertReviews(
      service,
      details.reviews.map((review) => toReviewRow(venueId, source.id, review)),
    );
    if (details.displayName || details.mapsUri) {
      await updateReviewSource(service, source.id, {
        location_name: details.displayName ?? source.location_name,
        location_url: details.mapsUri ?? source.location_url,
      });
    }
  } else {
    throw new Error(
      "Connect Google Business Profile and pick a location, or save a Place ID to import public reviews.",
    );
  }

  await updateReviewSource(service, source.id, {
    status: "connected",
    last_error: null,
    last_synced_at: new Date().toISOString(),
    rating_average: average,
    review_count: total,
  });

  return { imported, average, total };
}

export async function listGoogleOauthVenueIds(
  service: SupabaseClient,
): Promise<string[]> {
  const { data, error } = await service
    .from("sentiment_review_sources")
    .select("venue_id")
    .eq("channel", "google")
    .eq("connected_via_oauth", true)
    .not("refresh_token_encrypted", "is", null)
    .not("external_account_id", "is", null)
    .not("external_location_id", "is", null);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row.venue_id as string);
}
