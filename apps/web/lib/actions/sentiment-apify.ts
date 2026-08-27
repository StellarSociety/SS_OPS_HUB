"use server";

import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { getActionAuthContext } from "@/lib/auth/action-context";
import { createServiceClient } from "@/lib/supabase/service";
import {
  apifyManualCooldownRemainingMs,
  formatCooldownUntil,
} from "@/lib/sentiment/apify/config";
import {
  apifyConfigured,
  syncGoogleReviewsFromApify,
} from "@/lib/sentiment/apify/sync";
import {
  parseTripadvisorListingUrl,
  syncTripadvisorReviewsFromApify,
} from "@/lib/sentiment/apify/tripadvisor";
import { canAdminSettings } from "@/lib/sentiment/permissions";
import {
  getReviewSource,
  updateReviewSource,
  upsertReviewSource,
} from "@/lib/sentiment/store";

function fail(message: string) {
  return { ok: false as const, error: message };
}

function revalidateSentiment() {
  revalidatePath("/sentiment", "page");
  revalidatePath("/sentiment/reviews", "page");
  revalidatePath("/sentiment/reviews/google", "page");
  revalidatePath("/sentiment/reviews/tripadvisor", "page");
  revalidatePath("/sentiment/calendar", "page");
  revalidatePath("/sentiment/settings", "page");
  revalidatePath("/sentiment/settings/apify", "page");
  revalidatePath("/sentiment/settings/google", "page");
  revalidatePath("/sentiment/settings/tripadvisor", "page");
}

export async function refreshGoogleReviewsFromApify() {
  const auth = await getActionAuthContext();
  if ("error" in auth) return fail(auth.error);

  if (!canAdminSettings(auth.permissions, auth.venue.id)) {
    return fail("You need Sentiment Settings admin access.");
  }

  if (!apifyConfigured()) {
    return fail("APIFY_TOKEN is not set on this environment.");
  }

  const service = createServiceClient();
  const source = await getReviewSource(service, auth.venue.id, "google");
  if (!source?.place_id) {
    return fail("Save a Google Place ID first.");
  }

  const remaining = apifyManualCooldownRemainingMs(source.last_synced_at);
  if (remaining > 0) {
    return fail(
      `Refresh is limited to once every 2 hours to stay on the free Apify plan. Try again after ${formatCooldownUntil(remaining)}.`,
    );
  }

  try {
    const result = await syncGoogleReviewsFromApify(
      service,
      auth.venue.id,
      "manual",
    );

    await writeAuditLog({
      actor_id: auth.user.id,
      action: "sync",
      module_key: "sentiment",
      entity: "sentiment_reviews",
      entity_id: source.id,
      venue_id: auth.venue.id,
      after: { imported: result.imported, channel: "google", via: "apify" },
    });

    revalidateSentiment();
    return { ok: true as const, imported: result.imported };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Apify review refresh failed.";
    await updateReviewSource(service, source.id, {
      status: "error",
      last_error: message,
    });
    revalidateSentiment();
    return fail(message);
  }
}

export async function saveTripadvisorListingUrl(formData: FormData) {
  const auth = await getActionAuthContext();
  if ("error" in auth) return fail(auth.error);

  if (!canAdminSettings(auth.permissions, auth.venue.id)) {
    return fail("You need Sentiment Settings admin access.");
  }

  const listing = parseTripadvisorListingUrl(
    String(formData.get("listingUrl") ?? ""),
  );
  if (!listing) {
    return fail(
      "Paste a TripAdvisor restaurant, hotel, or attraction listing URL.",
    );
  }

  const service = createServiceClient();
  const existing = await getReviewSource(service, auth.venue.id, "tripadvisor");
  await upsertReviewSource(service, {
    venue_id: auth.venue.id,
    channel: "tripadvisor",
    label: existing?.label || "TripAdvisor",
    location_url: listing.url,
    external_location_id: listing.locationId,
    status: existing?.status === "connected" ? "connected" : "pending",
    last_error: null,
  });

  await writeAuditLog({
    actor_id: auth.user.id,
    action: "update",
    module_key: "sentiment",
    entity: "sentiment_review_sources",
    venue_id: auth.venue.id,
    after: {
      channel: "tripadvisor",
      location_url: listing.url,
      location_id: listing.locationId,
    },
  });

  revalidateSentiment();
  return { ok: true as const };
}

export async function refreshTripadvisorReviewsFromApify() {
  const auth = await getActionAuthContext();
  if ("error" in auth) return fail(auth.error);

  if (!canAdminSettings(auth.permissions, auth.venue.id)) {
    return fail("You need Sentiment Settings admin access.");
  }

  if (!apifyConfigured()) {
    return fail("APIFY_TOKEN is not set on this environment.");
  }

  const service = createServiceClient();
  const source = await getReviewSource(service, auth.venue.id, "tripadvisor");
  const listing = parseTripadvisorListingUrl(source?.location_url ?? "");
  if (!source || !listing) {
    return fail("Save a TripAdvisor listing URL first.");
  }

  const remaining = apifyManualCooldownRemainingMs(source.last_synced_at);
  if (remaining > 0) {
    return fail(
      `Refresh is limited to once every 2 hours to stay on the free Apify plan. Try again after ${formatCooldownUntil(remaining)}.`,
    );
  }

  try {
    const result = await syncTripadvisorReviewsFromApify(
      service,
      auth.venue.id,
      "manual",
    );

    await writeAuditLog({
      actor_id: auth.user.id,
      action: "sync",
      module_key: "sentiment",
      entity: "sentiment_reviews",
      entity_id: source.id,
      venue_id: auth.venue.id,
      after: {
        imported: result.imported,
        channel: "tripadvisor",
        via: "apify",
      },
    });

    revalidateSentiment();
    return { ok: true as const, imported: result.imported };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Apify TripAdvisor refresh failed.";
    await updateReviewSource(service, source.id, {
      status: "error",
      last_error: message,
    });
    revalidateSentiment();
    return fail(message);
  }
}
