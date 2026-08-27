import "server-only";

import { generateQrSvg } from "@/lib/guests-intel/qr";
import {
  googleReviewHref,
  tripadvisorReviewHref,
} from "@/lib/sentiment/guest-feedback/outbound-links";
import { listReviews, listReviewSources } from "@/lib/sentiment/store";
import type { SentimentReview, SentimentReviewSource } from "@/lib/sentiment/types";
import { getVenueLogoUrl, getVenueTagline } from "@/lib/venue/branding";
import type { Venue } from "@/lib/types/database";
import type { LiveDisplayChannelCard, LiveDisplayView } from "./types";
import {
  combineListingStats,
  formatLiveUpdatedLabel,
  guestsLoveTopics,
  listingStatsFromSource,
  thisMonthStats,
} from "./stats";

function publicReviews(reviews: SentimentReview[]): SentimentReview[] {
  return reviews.filter(
    (review) => !review.is_practice && review.channel !== "guest",
  );
}

function latestSyncAt(sources: SentimentReviewSource[]): string | null {
  let latest: string | null = null;
  let latestMs = 0;
  for (const source of sources) {
    if (!source.last_synced_at) continue;
    const ms = new Date(source.last_synced_at).getTime();
    if (Number.isNaN(ms) || ms < latestMs) continue;
    latest = source.last_synced_at;
    latestMs = ms;
  }
  return latest;
}

async function channelCard(
  key: "google" | "tripadvisor",
  label: string,
  cta: string,
  source: SentimentReviewSource | undefined,
  reviews: SentimentReview[],
): Promise<LiveDisplayChannelCard | null> {
  const href =
    key === "google"
      ? googleReviewHref(source?.place_id ?? null, source?.location_url ?? null)
      : tripadvisorReviewHref(source?.location_url ?? null);
  if (!href) return null;
  const stats = listingStatsFromSource(source ?? null, reviews);
  const qrSvg = await generateQrSvg(href).catch(() => "");
  return {
    key,
    label,
    cta,
    rating: stats.rating,
    reviewCount: stats.reviewCount,
    qrSvg: qrSvg || null,
  };
}

export async function loadLiveDisplayView(
  client: Parameters<typeof listReviewSources>[0],
  venue: Venue,
): Promise<LiveDisplayView> {
  const [sources, allReviews] = await Promise.all([
    listReviewSources(client, venue.id),
    listReviews(client, venue.id).catch(() => [] as SentimentReview[]),
  ]);
  const reviews = publicReviews(allReviews);
  const googleSource = sources.find((source) => source.channel === "google");
  const tripadvisorSource = sources.find(
    (source) => source.channel === "tripadvisor",
  );
  const googleReviews = reviews.filter((review) => review.channel === "google");
  const tripadvisorReviews = reviews.filter(
    (review) => review.channel === "tripadvisor",
  );

  const google = listingStatsFromSource(googleSource, googleReviews);
  const tripadvisor = listingStatsFromSource(
    tripadvisorSource,
    tripadvisorReviews,
  );

  const [googleCard, tripadvisorCard] = await Promise.all([
    channelCard(
      "google",
      "Google",
      "Scan to review on Google",
      googleSource,
      googleReviews,
    ),
    channelCard(
      "tripadvisor",
      "Tripadvisor",
      "Scan to review on Tripadvisor",
      tripadvisorSource,
      tripadvisorReviews,
    ),
  ]);

  return {
    venueName: venue.name.trim() || "Venue",
    venueTagline: getVenueTagline(venue.slug),
    venueLogoUrl: getVenueLogoUrl(venue),
    updatedLabel: formatLiveUpdatedLabel(latestSyncAt(sources)),
    google,
    channels: [googleCard, tripadvisorCard].filter(
      (card): card is LiveDisplayChannelCard => Boolean(card),
    ),
    thisMonth: thisMonthStats(reviews),
    overall: combineListingStats([google, tripadvisor]),
    guestsLove: guestsLoveTopics(reviews),
  };
}
