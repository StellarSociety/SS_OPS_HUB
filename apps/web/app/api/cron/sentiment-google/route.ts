import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  listGoogleOauthVenueIds,
  syncGoogleReviewsForVenue,
} from "@/lib/sentiment/google/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorizeCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn("[cron/sentiment-google] CRON_SECRET is not set.");
    return false;
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${secret}`) return true;

  const url = new URL(request.url);
  return url.searchParams.get("secret") === secret;
}

export async function GET(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const service = createServiceClient();
    const venueIds = await listGoogleOauthVenueIds(service);
    const results: Array<{ venueId: string; imported: number } | { venueId: string; error: string }> =
      [];

    for (const venueId of venueIds) {
      try {
        const synced = await syncGoogleReviewsForVenue(service, venueId);
        results.push({ venueId, imported: synced.imported });
      } catch (error) {
        results.push({
          venueId,
          error: error instanceof Error ? error.message : "Import failed",
        });
      }
    }

    return NextResponse.json({
      ok: true,
      venues: venueIds.length,
      results,
    });
  } catch (err) {
    console.error("[cron/sentiment-google]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 },
    );
  }
}
