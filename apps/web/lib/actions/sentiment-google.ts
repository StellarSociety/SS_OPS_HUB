"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { getActionAuthContext } from "@/lib/auth/action-context";
import { decryptSecret, encryptSecret } from "@/lib/email/secret";
import { createServiceClient } from "@/lib/supabase/service";
import { listAllGoogleLocations } from "@/lib/sentiment/google/business-profile";
import {
  buildGoogleAuthUrl,
  encodeOAuthState,
  googleOAuthConfigured,
  refreshGoogleAccessToken,
  requestAppOrigin,
  storeOAuthCookie,
} from "@/lib/sentiment/google/oauth";
import {
  extractGooglePlaceId,
  fetchPlaceDetails,
  resolvePlacesApiKey,
} from "@/lib/sentiment/google/places";
import { syncGoogleReviewsForVenue } from "@/lib/sentiment/google/sync";
import { canAdminSettings } from "@/lib/sentiment/permissions";
import {
  getReviewSource,
  getSourceSecrets,
  updateReviewSource,
  upsertReviewSource,
} from "@/lib/sentiment/store";
import type { GoogleBusinessLocation } from "@/lib/sentiment/types";

function fail(message: string) {
  return { ok: false as const, error: message };
}

async function requireSettingsAdmin(): Promise<
  | { error: string }
  | {
      userId: string;
      venueId: string;
      venueSlug: string | null;
      venueIsGlobal: boolean;
      service: ReturnType<typeof createServiceClient>;
    }
> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { error: auth.error };

  if (!canAdminSettings(auth.permissions, auth.venue.id)) {
    return { error: "You need Sentiment Settings admin access." };
  }

  return {
    userId: auth.user.id,
    venueId: auth.venue.id,
    venueSlug: auth.venue.slug ?? null,
    venueIsGlobal: Boolean(auth.venue.is_global),
    service: createServiceClient(),
  };
}

function revalidateSentiment() {
  revalidatePath("/sentiment", "page");
  revalidatePath("/sentiment/reviews", "page");
  revalidatePath("/sentiment/reviews/google", "page");
  revalidatePath("/sentiment/calendar", "page");
  revalidatePath("/sentiment/settings", "page");
  revalidatePath("/sentiment/settings/google", "page");
  revalidatePath("/sentiment/settings/apify", "page");
}

export async function startGoogleOAuth() {
  const ctx = await requireSettingsAdmin();
  if ("error" in ctx) return fail(ctx.error);
  if (!googleOAuthConfigured()) {
    return fail(
      "Google OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to the server environment.",
    );
  }

  const redirectOrigin = await requestAppOrigin();
  const state = encodeOAuthState({
    venueId: ctx.venueId,
    userId: ctx.userId,
    slug: ctx.venueIsGlobal ? null : ctx.venueSlug,
    redirectOrigin,
  });
  await storeOAuthCookie(state);
  redirect(buildGoogleAuthUrl(state, redirectOrigin));
}

export async function saveGooglePlacesApiKey(formData: FormData) {
  const ctx = await requireSettingsAdmin();
  if ("error" in ctx) return fail(ctx.error);

  const raw = String(formData.get("placesApiKey") ?? "").trim();
  if (!raw) {
    return fail("Paste a Google Places API (New) key.");
  }

  const existing = await getReviewSource(ctx.service, ctx.venueId, "google");
  await upsertReviewSource(ctx.service, {
    venue_id: ctx.venueId,
    channel: "google",
    label: existing?.label || "Google",
    places_api_key_encrypted: encryptSecret(raw),
    has_places_api_key: true,
    status: existing?.status ?? "disconnected",
    last_error: null,
  });

  await writeAuditLog({
    actor_id: ctx.userId,
    action: "update",
    module_key: "sentiment",
    entity: "sentiment_review_sources",
    venue_id: ctx.venueId,
    after: { channel: "google", has_places_api_key: true },
  });

  revalidateSentiment();
  return { ok: true as const };
}

export async function clearGooglePlacesApiKey() {
  const ctx = await requireSettingsAdmin();
  if ("error" in ctx) return fail(ctx.error);

  const existing = await getReviewSource(ctx.service, ctx.venueId, "google");
  if (!existing) return { ok: true as const };

  await updateReviewSource(ctx.service, existing.id, {
    places_api_key_encrypted: null,
    has_places_api_key: false,
  });

  await writeAuditLog({
    actor_id: ctx.userId,
    action: "update",
    module_key: "sentiment",
    entity: "sentiment_review_sources",
    entity_id: existing.id,
    venue_id: ctx.venueId,
    after: { channel: "google", has_places_api_key: false },
  });

  revalidateSentiment();
  return { ok: true as const };
}

export async function saveGooglePlaceId(formData: FormData) {
  const ctx = await requireSettingsAdmin();
  if ("error" in ctx) return fail(ctx.error);

  const raw = String(formData.get("placeId") ?? "");
  const placeId = extractGooglePlaceId(raw);
  if (!placeId) {
    return fail(
      "Paste a Google Place ID (starts with ChIJ) or a Google Maps URL that contains one.",
    );
  }

  let locationName: string | null = null;
  let locationUrl: string | null = null;
  let ratingAverage: number | null = null;
  let reviewCount: number | null = null;
  let lastError: string | null = null;
  let status: "connected" | "error" = "connected";

  try {
    const secrets = await getSourceSecrets(ctx.service, ctx.venueId, "google");
    const details = await fetchPlaceDetails(
      placeId,
      resolvePlacesApiKey(secrets?.places_api_key_encrypted),
    );
    locationName = details.displayName;
    locationUrl = details.mapsUri;
    ratingAverage = details.rating;
    reviewCount = details.userRatingCount;
  } catch (error) {
    status = "error";
    lastError = error instanceof Error ? error.message : "Could not verify Place ID.";
  }

  const existing = await getReviewSource(ctx.service, ctx.venueId, "google");
  await upsertReviewSource(ctx.service, {
    venue_id: ctx.venueId,
    channel: "google",
    label: locationName || existing?.label || "Google",
    place_id: placeId,
    location_name: locationName ?? existing?.location_name ?? null,
    location_url: locationUrl ?? existing?.location_url ?? null,
    rating_average: ratingAverage ?? existing?.rating_average ?? null,
    review_count: reviewCount ?? existing?.review_count ?? null,
    status: existing?.connected_via_oauth ? existing.status : status,
    last_error: lastError,
  });

  await writeAuditLog({
    actor_id: ctx.userId,
    action: "update",
    module_key: "sentiment",
    entity: "sentiment_review_sources",
    venue_id: ctx.venueId,
    after: { channel: "google", place_id: placeId },
  });

  revalidateSentiment();
  if (lastError) return fail(lastError);
  return { ok: true as const };
}

export async function listGoogleLocationsAction(): Promise<
  | { ok: true; locations: GoogleBusinessLocation[] }
  | { ok: false; error: string }
> {
  const ctx = await requireSettingsAdmin();
  if ("error" in ctx) return fail(ctx.error);

  const secrets = await getSourceSecrets(ctx.service, ctx.venueId, "google");
  if (!secrets?.refresh_token_encrypted) {
    return fail("Connect a Google account first.");
  }

  try {
    const access = await refreshGoogleAccessToken(
      decryptSecret(secrets.refresh_token_encrypted),
    );
    await updateReviewSource(ctx.service, secrets.id, {
      access_token_encrypted: encryptSecret(access.accessToken),
      access_token_expires_at: access.expiresAt,
    });
    const locations = await listAllGoogleLocations(access.accessToken);
    return { ok: true, locations };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not list Google locations.";
    await updateReviewSource(ctx.service, secrets.id, {
      status: "error",
      last_error: message,
    });
    revalidateSentiment();
    return fail(message);
  }
}

export async function selectGoogleLocation(formData: FormData) {
  const ctx = await requireSettingsAdmin();
  if ("error" in ctx) return fail(ctx.error);

  const accountId = String(formData.get("accountId") ?? "").trim();
  const locationId = String(formData.get("locationId") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const placeId = String(formData.get("placeId") ?? "").trim() || null;
  const mapsUri = String(formData.get("mapsUri") ?? "").trim() || null;

  if (!accountId || !locationId) {
    return fail("Choose a Google Business location.");
  }

  const existing = await getReviewSource(ctx.service, ctx.venueId, "google");
  if (!existing) return fail("Connect a Google account first.");

  await updateReviewSource(ctx.service, existing.id, {
    external_account_id: accountId,
    external_location_id: locationId,
    location_name: title || existing.location_name,
    location_url: mapsUri ?? existing.location_url,
    place_id: placeId ?? existing.place_id,
    status: "connected",
    last_error: null,
  });

  await writeAuditLog({
    actor_id: ctx.userId,
    action: "update",
    module_key: "sentiment",
    entity: "sentiment_review_sources",
    entity_id: existing.id,
    venue_id: ctx.venueId,
    after: { accountId, locationId, title },
  });

  revalidateSentiment();
  return { ok: true as const };
}

export async function syncGoogleReviews() {
  const ctx = await requireSettingsAdmin();
  if ("error" in ctx) return fail(ctx.error);

  const source = await getReviewSource(ctx.service, ctx.venueId, "google");
  if (!source) {
    return fail("Save a Google Place ID or connect a Google account first.");
  }

  try {
    const result = await syncGoogleReviewsForVenue(ctx.service, ctx.venueId);

    await writeAuditLog({
      actor_id: ctx.userId,
      action: "sync",
      module_key: "sentiment",
      entity: "sentiment_reviews",
      entity_id: source.id,
      venue_id: ctx.venueId,
      after: { imported: result.imported, channel: "google" },
    });

    revalidateSentiment();
    return { ok: true as const, imported: result.imported };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Google review import failed.";
    await updateReviewSource(ctx.service, source.id, {
      status: "error",
      last_error: message,
    });
    revalidateSentiment();
    return fail(message);
  }
}

export async function disconnectGoogle() {
  const ctx = await requireSettingsAdmin();
  if ("error" in ctx) return fail(ctx.error);

  const existing = await getReviewSource(ctx.service, ctx.venueId, "google");
  if (!existing) return { ok: true as const };

  await updateReviewSource(ctx.service, existing.id, {
    refresh_token_encrypted: null,
    access_token_encrypted: null,
    access_token_expires_at: null,
    connected_via_oauth: false,
    account_email: null,
    external_account_id: null,
    external_location_id: null,
    status: existing.place_id ? "connected" : "disconnected",
    last_error: null,
  });

  await writeAuditLog({
    actor_id: ctx.userId,
    action: "disconnect",
    module_key: "sentiment",
    entity: "sentiment_review_sources",
    entity_id: existing.id,
    venue_id: ctx.venueId,
    after: { channel: "google" },
  });

  revalidateSentiment();
  return { ok: true as const };
}

