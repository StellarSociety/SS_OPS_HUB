import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  APIFY_CRON_LOOKBACK_DAYS,
  APIFY_CRON_MAX_REVIEWS,
  APIFY_MANUAL_LOOKBACK_DAYS,
  APIFY_MANUAL_MAX_REVIEWS,
} from "@/lib/sentiment/apify/config";
import {
  apifyConfigured,
  runApifyActor,
  type ApifySyncMode,
  type ApifySyncResult,
} from "@/lib/sentiment/apify/sync";
import {
  getReviewSource,
  updateReviewSource,
  upsertReviews,
  type ReviewUpsertInput,
} from "@/lib/sentiment/store";

const TA_ACTOR = "delicious_zebu~tripadvisor-review-collector";
const LOCATION_ID_RE = /-d(\d+)/i;

export type TripadvisorListing = {
  url: string;
  locationId: string;
};

type TaReview = {
  locationId?: number | string | null;
  locationName?: string | null;
  reviewId?: number | string | null;
  reviewUrl?: string | null;
  title?: string | null;
  text?: string | null;
  rating?: number | null;
  publishedDate?: string | null;
  language?: string | null;
  originalLanguage?: string | null;
  username?: string | null;
  contributionCount?: number | null;
  userProfileUrl?: string | null;
  userAvatar?: string | null;
  ownerResponseText?: string | null;
  ownerResponseDate?: string | null;
  photoUrls?: string[] | null;
};

export function parseTripadvisorListingUrl(
  input: string,
): TripadvisorListing | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }

  if (!/tripadvisor\./i.test(parsed.hostname)) return null;

  const match = parsed.pathname.match(LOCATION_ID_RE);
  if (!match?.[1]) return null;

  parsed.protocol = "https:";
  parsed.search = "";
  parsed.hash = "";
  const url = parsed.toString().replace(/\/+$/, "");
  return { url, locationId: match[1] };
}

function externalId(locationId: string, reviewId: string): string {
  return `tripadvisor/${locationId}/reviews/${reviewId}`;
}

function nonempty(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function httpUrl(value: unknown): string | null {
  const text = nonempty(value);
  return text?.startsWith("http") ? text : null;
}

function toReviewedAt(value: string | null | undefined): string | null {
  const trimmed = nonempty(value);
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return `${trimmed}T12:00:00.000Z`;
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString();
}

function toStars(rating: number | null | undefined): number | null {
  if (typeof rating !== "number" || !Number.isFinite(rating)) return null;
  const stars = rating > 5 ? Math.round(rating / 10) : Math.round(rating);
  if (stars < 1 || stars > 5) return null;
  return stars;
}

function reviewComment(
  title: string | null | undefined,
  text: string | null | undefined,
): string | null {
  const headline = nonempty(title) || "";
  const body = nonempty(text) || "";
  if (headline && body && headline !== body) return `${headline}\n\n${body}`;
  return body || headline || null;
}

function photoUrls(photos: unknown): string[] {
  if (!Array.isArray(photos)) return [];
  return [
    ...new Set(
      photos
        .map((url) => httpUrl(url))
        .filter((url): url is string => Boolean(url)),
    ),
  ];
}

function toRows(
  venueId: string,
  sourceId: string,
  locationId: string,
  items: TaReview[],
): ReviewUpsertInput[] {
  const rows: ReviewUpsertInput[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const reviewId = item.reviewId != null ? String(item.reviewId).trim() : "";
    if (!reviewId) continue;
    const itemLocationId =
      item.locationId != null ? String(item.locationId).trim() : "";
    if (itemLocationId && itemLocationId !== locationId) continue;
    const id = externalId(locationId, reviewId);
    if (seen.has(id)) continue;
    seen.add(id);

    rows.push({
      venue_id: venueId,
      source_id: sourceId,
      channel: "tripadvisor",
      external_id: id,
      author_name: nonempty(item.username),
      author_photo_url: httpUrl(item.userAvatar),
      author_profile_url: httpUrl(item.userProfileUrl),
      author_is_local_guide: false,
      author_review_count:
        typeof item.contributionCount === "number"
          ? item.contributionCount
          : null,
      rating: toStars(item.rating),
      comment: reviewComment(item.title, item.text),
      reviewed_at: toReviewedAt(item.publishedDate),
      language:
        nonempty(item.originalLanguage) || nonempty(item.language),
      reply_text: nonempty(item.ownerResponseText),
      reply_at: toReviewedAt(item.ownerResponseDate),
      review_url: httpUrl(item.reviewUrl),
      photo_urls: photoUrls(item.photoUrls),
      raw: item as Record<string, unknown>,
    });
  }
  return rows;
}

async function scrapeRecentReviews(
  listingUrl: string,
  mode: ApifySyncMode,
  options?: { lookback?: boolean },
): Promise<TaReview[]> {
  const maxReviews = options?.lookback
    ? mode === "manual"
      ? APIFY_MANUAL_MAX_REVIEWS
      : APIFY_CRON_MAX_REVIEWS
    : Math.max(APIFY_CRON_MAX_REVIEWS, APIFY_MANUAL_MAX_REVIEWS);

  return runApifyActor<TaReview>(TA_ACTOR, {
    detailUrls: [listingUrl],
    maxReviews,
    sortBy: "newest",
    autoTranslate: false,
    ...(options?.lookback
      ? {
          recentDays:
            mode === "manual"
              ? APIFY_MANUAL_LOOKBACK_DAYS
              : APIFY_CRON_LOOKBACK_DAYS,
        }
      : {}),
  });
}

export async function listApifyTripadvisorVenueSources(
  service: SupabaseClient,
): Promise<Array<{ venueId: string; sourceId: string; listingUrl: string }>> {
  const { data, error } = await service
    .from("sentiment_review_sources")
    .select("id, venue_id, location_url")
    .eq("channel", "tripadvisor")
    .not("location_url", "is", null);
  if (error) throw new Error(error.message);

  return (data ?? [])
    .map((row) => ({
      venueId: row.venue_id as string,
      sourceId: row.id as string,
      listingUrl: String(row.location_url ?? "").trim(),
    }))
    .filter((row) => Boolean(parseTripadvisorListingUrl(row.listingUrl)));
}

export async function syncTripadvisorReviewsFromApify(
  service: SupabaseClient,
  venueId: string,
  mode: ApifySyncMode = "cron",
): Promise<ApifySyncResult> {
  if (!apifyConfigured()) {
    return { imported: 0, skipped: true, reason: "APIFY_TOKEN is not set." };
  }

  const source = await getReviewSource(service, venueId, "tripadvisor");
  const listing = parseTripadvisorListingUrl(source?.location_url ?? "");
  if (!source || !listing) {
    return {
      imported: 0,
      skipped: true,
      reason: "No TripAdvisor listing URL saved.",
    };
  }

  const items = await scrapeRecentReviews(listing.url, mode, {
    lookback: Boolean(source.last_synced_at),
  });
  const rows = toRows(venueId, source.id, listing.locationId, items);
  const imported = await upsertReviews(service, rows);

  const sample = items.find((item) => {
    const id = item.locationId != null ? String(item.locationId) : "";
    return !id || id === listing.locationId;
  });
  const ratings = rows
    .map((row) => row.rating)
    .filter((rating): rating is number => typeof rating === "number");

  await updateReviewSource(service, source.id, {
    status: "connected",
    last_error: null,
    last_synced_at: new Date().toISOString(),
    review_count: items.length || source.review_count,
    ...(sample?.locationName
      ? { location_name: sample.locationName }
      : {}),
    ...(ratings.length > 0
      ? {
          rating_average:
            Math.round(
              (ratings.reduce((sum, rating) => sum + rating, 0) /
                ratings.length) *
                100,
            ) / 100,
        }
      : {}),
  });

  return { imported };
}
