import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit";
import { encryptSecret } from "@/lib/email/secret";
import { absoluteAppHref } from "@/lib/public-app-url";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { listAllGoogleLocations } from "@/lib/sentiment/google/business-profile";
import {
  clearOAuthCookie,
  decodeOAuthState,
  exchangeGoogleCode,
  readOAuthCookie,
} from "@/lib/sentiment/google/oauth";
import { upsertReviewSource, updateReviewSource } from "@/lib/sentiment/store";
import { GLOBAL_BASE, venueBase } from "@/lib/venue/scope-routing";

export const dynamic = "force-dynamic";

function settingsUrl(slug: string | null, query: Record<string, string>): string {
  const base = slug
    ? `${venueBase(slug)}/sentiment/settings/google`
    : `${GLOBAL_BASE}/settings/sentiment/google`;
  const params = new URLSearchParams(query);
  return `${base}?${params.toString()}`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const cookieState = await readOAuthCookie();
  await clearOAuthCookie();

  const state = stateParam ? decodeOAuthState(stateParam) : null;
  const cookieDecoded = cookieState ? decodeOAuthState(cookieState) : null;
  const venueSlug = state?.slug ?? cookieDecoded?.slug ?? null;

  if (oauthError) {
    return NextResponse.redirect(
      absoluteAppHref(settingsUrl(venueSlug, { google: "denied" }), request.url),
    );
  }

  if (!code || !state || !cookieDecoded) {
    return NextResponse.redirect(
      absoluteAppHref(settingsUrl(venueSlug, { google: "invalid" }), request.url),
    );
  }

  if (
    state.venueId !== cookieDecoded.venueId ||
    state.userId !== cookieDecoded.userId ||
    state.nonce !== cookieDecoded.nonce
  ) {
    return NextResponse.redirect(
      absoluteAppHref(settingsUrl(venueSlug, { google: "invalid" }), request.url),
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== state.userId) {
    return NextResponse.redirect(absoluteAppHref("/login", request.url));
  }

  try {
    const tokens = await exchangeGoogleCode(code, state.redirectOrigin);
    const service = createServiceClient();
    const source = await upsertReviewSource(service, {
      venue_id: state.venueId,
      channel: "google",
      label: "Google",
      account_email: tokens.email,
      refresh_token_encrypted: tokens.refreshToken
        ? encryptSecret(tokens.refreshToken)
        : undefined,
      access_token_encrypted: encryptSecret(tokens.accessToken),
      access_token_expires_at: tokens.expiresAt,
      connected_via_oauth: Boolean(tokens.refreshToken),
      status: "pending",
      last_error: tokens.refreshToken
        ? null
        : "Google did not return a refresh token. Disconnect and connect again, granting offline access.",
    });

    if (!tokens.refreshToken) {
      return NextResponse.redirect(
        absoluteAppHref(settingsUrl(venueSlug, { google: "norefresh" }), request.url),
      );
    }

    try {
      const locations = await listAllGoogleLocations(tokens.accessToken);
      if (locations.length === 1) {
        const location = locations[0]!;
        await updateReviewSource(service, source.id, {
          external_account_id: location.accountId,
          external_location_id: location.locationId,
          location_name: location.title,
          location_url: location.mapsUri,
          place_id: location.placeId ?? source.place_id,
          status: "connected",
          last_error: null,
        });
      } else if (locations.length === 0) {
        await updateReviewSource(service, source.id, {
          status: "error",
          last_error:
            "No Google Business Profile locations were found on this account.",
        });
      }
    } catch (error) {
      await updateReviewSource(service, source.id, {
        status: "error",
        last_error:
          error instanceof Error
            ? error.message
            : "Connected, but listing Business Profile locations failed.",
      });
    }

    await writeAuditLog({
      actor_id: user.id,
      action: "connect",
      module_key: "sentiment",
      entity: "sentiment_review_sources",
      entity_id: source.id,
      venue_id: state.venueId,
      after: { channel: "google", email: tokens.email },
    });

    return NextResponse.redirect(
      absoluteAppHref(settingsUrl(venueSlug, { google: "connected" }), request.url),
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Google connection failed.";
    try {
      const service = createServiceClient();
      await upsertReviewSource(service, {
        venue_id: state.venueId,
        channel: "google",
        label: "Google",
        status: "error",
        last_error: message,
      });
    } catch {
      // Ignore persistence of the error row if the table is not ready yet.
    }
    return NextResponse.redirect(
      absoluteAppHref(settingsUrl(venueSlug, { google: "error" }), request.url),
    );
  }
}
