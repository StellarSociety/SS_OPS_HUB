"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { ApifyMark } from "@/components/sentiment/channel-marks";
import { ScopedLink } from "@/components/layout/scoped-link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { refreshGoogleReviewsFromApify } from "@/lib/actions/sentiment-apify";
import {
  apifyManualCooldownRemainingMs,
  formatCooldownUntil,
} from "@/lib/sentiment/apify/config";
import type { SentimentReviewSource } from "@/lib/sentiment/types";
import { cn } from "@/lib/utils";

function formatSynced(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString("en-AE", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function ApifyConnectionCard({
  source,
  apifyConfigured,
  canEdit,
}: {
  source: SentimentReviewSource | null;
  apifyConfigured: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const cooldownMs = apifyManualCooldownRemainingMs(source?.last_synced_at);
  const coolingDown = cooldownMs > 0;
  const hasPlaceId = Boolean(source?.place_id);

  const statusLabel = !apifyConfigured
    ? "Token missing"
    : !hasPlaceId
      ? "Needs Place ID"
      : "Ready";
  const statusClass = !apifyConfigured
    ? "bg-red-50 text-red-800"
    : !hasPlaceId
      ? "bg-amber-50 text-amber-900"
      : "bg-emerald-50 text-emerald-800";

  return (
    <Card className="space-y-5 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white shadow-sm ring-1 ring-black/5">
            <ApifyMark className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-medium text-[#3D421F]">Apify</h2>
            <p className="text-sm text-black/55">
              Interim Google Maps scrape until Business Profile access is
              approved. TripAdvisor uses the same token from the Tripadvisor
              tab.
            </p>
          </div>
        </div>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide",
            statusClass,
          )}
        >
          {statusLabel}
        </span>
      </div>

      <p className="text-sm text-black/60">
        {source?.location_name ? (
          <strong>{source.location_name}</strong>
        ) : (
          "No listing name yet"
        )}
        {source?.last_synced_at
          ? ` · last import ${formatSynced(source.last_synced_at)}`
          : " · not imported via Apify yet"}
        {typeof source?.review_count === "number"
          ? ` · ${source.review_count} Google ratings`
          : null}
      </p>

      {!hasPlaceId ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Save a Google Place ID on the{" "}
          <ScopedLink
            href="/sentiment/settings/google"
            className="font-medium underline underline-offset-2"
          >
            Google
          </ScopedLink>{" "}
          tab first.
        </p>
      ) : null}

      {!apifyConfigured ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          APIFY_TOKEN is not set on this environment.
        </p>
      ) : null}

      <p className="text-sm text-black/55">
        A daily job at 10:30 Dubai pulls reviews from the last 3 days. Manual
        refresh pulls the last 2 days (max 25 reviews) and is limited to once
        every 2 hours so we stay on Apify’s free $5 plan (~$0.0006 per review
        scraped).
      </p>

      {canEdit ? (
        <Button
          type="button"
          disabled={pending || !apifyConfigured || !hasPlaceId || coolingDown}
          onClick={() => {
            startTransition(async () => {
              const result = await refreshGoogleReviewsFromApify();
              if (!result.ok) {
                toast.error(result.error);
                return;
              }
              toast.saved(
                `Imported ${result.imported} review${result.imported === 1 ? "" : "s"}.`,
              );
              router.refresh();
            });
          }}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", pending && "animate-spin")} />
          {coolingDown
            ? `Refresh available ${formatCooldownUntil(cooldownMs)}`
            : "Refresh latest reviews"}
        </Button>
      ) : (
        <p className="text-sm text-black/45">
          Admin access is required to run a refresh.
        </p>
      )}
    </Card>
  );
}
