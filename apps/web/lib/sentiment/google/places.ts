import "server-only";

import { decryptSecret } from "@/lib/email/secret";

export type PlaceReview = {
  externalId: string;
  authorName: string | null;
  authorPhotoUrl: string | null;
  authorProfileUrl: string | null;
  rating: number | null;
  comment: string | null;
  reviewedAt: string | null;
  language: string | null;
  reviewUrl: string | null;
  photoUrls: string[];
  raw: Record<string, unknown>;
};

export type PlaceDetails = {
  placeId: string;
  displayName: string | null;
  mapsUri: string | null;
  rating: number | null;
  userRatingCount: number | null;
  reviews: PlaceReview[];
};

const PLACE_ID_RE = /\b(ChIJ[A-Za-z0-9_-]+)\b/;

export function extractGooglePlaceId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^ChIJ[A-Za-z0-9_-]+$/.test(trimmed)) return trimmed;
  const fromQuery = trimmed.match(/[?&]place_id=([^&]+)/i);
  if (fromQuery?.[1]) return decodeURIComponent(fromQuery[1]);
  const fromPath = trimmed.match(PLACE_ID_RE);
  return fromPath?.[1] ?? null;
}

export function resolvePlacesApiKey(
  encrypted: string | null | undefined,
): string | null {
  const stored = encrypted?.trim();
  if (stored) {
    try {
      const decrypted = decryptSecret(stored).trim();
      if (decrypted) return decrypted;
    } catch {
      // Fall through to the env key.
    }
  }
  return process.env.GOOGLE_PLACES_API_KEY?.trim() || null;
}

export async function fetchPlaceDetails(
  placeId: string,
  apiKey?: string | null,
): Promise<PlaceDetails> {
  const key = apiKey?.trim() || process.env.GOOGLE_PLACES_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "Save a Google Places API (New) key in Sentiment Settings to import public reviews.",
    );
  }

  const response = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
    {
      headers: {
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask":
          "id,displayName,rating,userRatingCount,googleMapsUri,reviews",
      },
    },
  );
  const json = (await response.json()) as {
    id?: string;
    displayName?: { text?: string };
    rating?: number;
    userRatingCount?: number;
    googleMapsUri?: string;
    reviews?: Array<{
      name?: string;
      rating?: number;
      text?: { text?: string; languageCode?: string };
      originalText?: { text?: string; languageCode?: string };
      authorAttribution?: {
        displayName?: string;
        photoUri?: string;
        uri?: string;
      };
      publishTime?: string;
      googleMapsUri?: string;
    }>;
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(
      json.error?.message ||
        "Could not load this Google Place. Check the Place ID and that Places API (New) is enabled.",
    );
  }

  return {
    placeId: json.id || placeId,
    displayName: json.displayName?.text ?? null,
    mapsUri: json.googleMapsUri ?? null,
    rating: json.rating ?? null,
    userRatingCount: json.userRatingCount ?? null,
    reviews: (json.reviews ?? []).map((review, index) => ({
      externalId:
        review.name ||
        `${placeId}:${review.publishTime ?? "unknown"}:${index}`,
      authorName: review.authorAttribution?.displayName ?? null,
      authorPhotoUrl: review.authorAttribution?.photoUri ?? null,
      authorProfileUrl: review.authorAttribution?.uri ?? null,
      rating: typeof review.rating === "number" ? review.rating : null,
      comment: review.originalText?.text || review.text?.text || null,
      reviewedAt: review.publishTime ?? null,
      language:
        review.originalText?.languageCode ||
        review.text?.languageCode ||
        null,
      reviewUrl: review.googleMapsUri ?? null,
      photoUrls: [],
      raw: review as Record<string, unknown>,
    })),
  };
}
