import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  APIFY_CRON_LOOKBACK,
  APIFY_CRON_MAX_REVIEWS,
  APIFY_MANUAL_LOOKBACK,
  APIFY_MANUAL_MAX_REVIEWS,
} from "@/lib/sentiment/apify/config";
import {
  getReviewSource,
  updateReviewSource,
  upsertReviews,
  type ReviewUpsertInput,
} from "@/lib/sentiment/store";

const COMPASS_ACTOR = "compass~google-maps-reviews-scraper";
const PLACE_ID = /^ChIJ[A-Za-z0-9_-]+$/;

type CompassReview = {
  reviewId?: string;
  name?: string | null;
  reviewerPhotoUrl?: string | null;
  reviewerUrl?: string | null;
  isLocalGuide?: boolean;
  reviewerNumberOfReviews?: number | null;
  text?: string | null;
  stars?: number | null;
  publishedAtDate?: string | null;
  reviewUrl?: string | null;
  reviewImageUrls?: string[] | null;
  responseFromOwnerText?: string | null;
  responseFromOwnerDate?: string | null;
  originalLanguage?: string | null;
  placeId?: string | null;
  title?: string | null;
  totalScore?: number | null;
  reviewsCount?: number | null;
};

export type ApifySyncResult = {
  imported: number;
  skipped?: boolean;
  reason?: string;
};

export type ApifySyncMode = "cron" | "manual";

export function apifyConfigured(): boolean {
  return Boolean(process.env.APIFY_TOKEN?.trim());
}

function apifyToken(): string | null {
  return process.env.APIFY_TOKEN?.trim() || null;
}

export async function runApifyActor<T>(
  actorId: string,
  input: Record<string, unknown>,
): Promise<T[]> {
  const token = apifyToken();
  if (!token) {
    throw new Error("APIFY_TOKEN is not set.");
  }

  const url = new URL(
    `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items`,
  );
  url.searchParams.set("timeout", "50");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    if (response.status === 401) {
      throw new Error(
        "Apify token is invalid. Create a new API token at https://console.apify.com/settings/integrations, set APIFY_TOKEN in .env.local (and apps/web/.env.local), then restart the app.",
      );
    }
    throw new Error(
      `Apify scrape failed (${response.status}): ${body.slice(0, 240) || response.statusText}`,
    );
  }

  const json = (await response.json()) as T[] | { error?: { message?: string } };
  if (!Array.isArray(json)) {
    throw new Error(json.error?.message || "Apify did not return review rows.");
  }
  return json;
}

function externalId(placeId: string, reviewId: string): string {
  return `places/${placeId}/reviews/${reviewId}`;
}

function toRows(
  venueId: string,
  sourceId: string,
  placeId: string,
  items: CompassReview[],
): ReviewUpsertInput[] {
  const rows: ReviewUpsertInput[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const reviewId = item.reviewId?.trim();
    if (!reviewId || item.placeId !== placeId) continue;
    const id = externalId(placeId, reviewId);
    if (seen.has(id)) continue;
    seen.add(id);
    const photos = (item.reviewImageUrls ?? []).filter(
      (url) => typeof url === "string" && url.startsWith("http"),
    );
    rows.push({
      venue_id: venueId,
      source_id: sourceId,
      channel: "google",
      external_id: id,
      author_name: item.name?.trim() || null,
      author_photo_url: item.reviewerPhotoUrl?.trim() || null,
      author_profile_url: item.reviewerUrl?.trim() || null,
      author_is_local_guide: Boolean(item.isLocalGuide),
      author_review_count:
        typeof item.reviewerNumberOfReviews === "number"
          ? item.reviewerNumberOfReviews
          : null,
      rating: typeof item.stars === "number" ? item.stars : null,
      comment: item.text?.trim() || null,
      reviewed_at: item.publishedAtDate || null,
      language: item.originalLanguage?.trim() || null,
      reply_text: item.responseFromOwnerText?.trim() || null,
      reply_at: item.responseFromOwnerDate || null,
      review_url: item.reviewUrl?.trim() || null,
      photo_urls: photos,
      raw: item as Record<string, unknown>,
    });
  }
  return rows;
}

async function scrapeRecentReviews(
  placeId: string,
  mode: ApifySyncMode,
): Promise<CompassReview[]> {
  return runApifyActor<CompassReview>(COMPASS_ACTOR, {
    placeIds: [placeId],
    maxReviews:
      mode === "manual" ? APIFY_MANUAL_MAX_REVIEWS : APIFY_CRON_MAX_REVIEWS,
    reviewsSort: "newest",
    reviewsStartDate:
      mode === "manual" ? APIFY_MANUAL_LOOKBACK : APIFY_CRON_LOOKBACK,
    language: "en",
    reviewsOrigin: "google",
    personalData: true,
  });
}

export async function listApifyGoogleVenueSources(
  service: SupabaseClient,
): Promise<Array<{ venueId: string; sourceId: string; placeId: string }>> {
  const { data, error } = await service
    .from("sentiment_review_sources")
    .select("id, venue_id, place_id")
    .eq("channel", "google")
    .not("place_id", "is", null);
  if (error) throw new Error(error.message);

  return (data ?? [])
    .map((row) => ({
      venueId: row.venue_id as string,
      sourceId: row.id as string,
      placeId: String(row.place_id ?? "").trim(),
    }))
    .filter((row) => PLACE_ID.test(row.placeId));
}

export async function syncGoogleReviewsFromApify(
  service: SupabaseClient,
  venueId: string,
  mode: ApifySyncMode = "cron",
): Promise<ApifySyncResult> {
  if (!apifyConfigured()) {
    return { imported: 0, skipped: true, reason: "APIFY_TOKEN is not set." };
  }

  const source = await getReviewSource(service, venueId, "google");
  const placeId = source?.place_id?.trim() ?? "";
  if (!source || !PLACE_ID.test(placeId)) {
    return { imported: 0, skipped: true, reason: "No Google Place ID saved." };
  }

  const items = await scrapeRecentReviews(placeId, mode);
  const rows = toRows(venueId, source.id, placeId, items);
  const imported = await upsertReviews(service, rows);

  const sample = items.find((item) => item.placeId === placeId);
  await updateReviewSource(service, source.id, {
    status: "connected",
    last_error: null,
    last_synced_at: new Date().toISOString(),
    ...(typeof sample?.totalScore === "number"
      ? { rating_average: sample.totalScore }
      : {}),
    ...(typeof sample?.reviewsCount === "number"
      ? { review_count: sample.reviewsCount }
      : {}),
    ...(sample?.title ? { location_name: sample.title } : {}),
  });

  return { imported };
}
