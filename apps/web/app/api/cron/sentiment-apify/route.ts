import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  listApifyGoogleVenueSources,
  syncGoogleReviewsFromApify,
} from "@/lib/sentiment/apify/sync";
import {
  listApifyTripadvisorVenueSources,
  syncTripadvisorReviewsFromApify,
} from "@/lib/sentiment/apify/tripadvisor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorizeCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn("[cron/sentiment-apify] CRON_SECRET is not set.");
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

  if (!process.env.APIFY_TOKEN?.trim()) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "APIFY_TOKEN is not set.",
    });
  }

  try {
    const service = createServiceClient();
    const [googleSources, tripadvisorSources] = await Promise.all([
      listApifyGoogleVenueSources(service),
      listApifyTripadvisorVenueSources(service),
    ]);

    type SyncOutcome =
      | { venueId: string; channel: "google" | "tripadvisor"; imported: number }
      | { venueId: string; channel: "google" | "tripadvisor"; error: string };

    const jobs: Array<Promise<SyncOutcome>> = [
      ...googleSources.map(async (source) => {
        try {
          const synced = await syncGoogleReviewsFromApify(
            service,
            source.venueId,
          );
          return {
            venueId: source.venueId,
            channel: "google" as const,
            imported: synced.imported,
          };
        } catch (error) {
          return {
            venueId: source.venueId,
            channel: "google" as const,
            error:
              error instanceof Error ? error.message : "Apify import failed",
          };
        }
      }),
      ...tripadvisorSources.map(async (source) => {
        try {
          const synced = await syncTripadvisorReviewsFromApify(
            service,
            source.venueId,
          );
          return {
            venueId: source.venueId,
            channel: "tripadvisor" as const,
            imported: synced.imported,
          };
        } catch (error) {
          return {
            venueId: source.venueId,
            channel: "tripadvisor" as const,
            error:
              error instanceof Error ? error.message : "Apify import failed",
          };
        }
      }),
    ];

    const results = await Promise.all(jobs);

    return NextResponse.json({
      ok: true,
      venues: googleSources.length + tripadvisorSources.length,
      results,
    });
  } catch (err) {
    console.error("[cron/sentiment-apify]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 },
    );
  }
}
