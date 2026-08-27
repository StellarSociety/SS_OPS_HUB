"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { TripAdvisorMark } from "@/components/sentiment/channel-marks";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import {
  refreshTripadvisorReviewsFromApify,
  saveTripadvisorListingUrl,
} from "@/lib/actions/sentiment-apify";
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

function statusBadge(source: SentimentReviewSource | null, hasUrl: boolean) {
  if (!hasUrl) return { label: "Needs listing URL", className: "bg-amber-50 text-amber-900" };
  if (source?.status === "error") {
    return { label: "Needs attention", className: "bg-red-50 text-red-800" };
  }
  if (source?.last_synced_at || source?.status === "connected") {
    return { label: "Connected", className: "bg-emerald-50 text-emerald-800" };
  }
  return { label: "Ready", className: "bg-emerald-50 text-emerald-800" };
}

export function TripadvisorConnectionCard({
  source,
  apifyConfigured,
  canEdit,
}: {
  source: SentimentReviewSource | null;
  apifyConfigured: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [listingUrl, setListingUrl] = useState(source?.location_url ?? "");
  const [pending, startTransition] = useTransition();
  const cooldownMs = apifyManualCooldownRemainingMs(source?.last_synced_at);
  const coolingDown = cooldownMs > 0;
  const hasUrl = Boolean(source?.location_url);
  const status = statusBadge(source, hasUrl);

  function run(
    action: () => Promise<{ ok: true; imported?: number } | { ok: false; error: string }>,
    success: string,
  ) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.saved(
        "imported" in result && typeof result.imported === "number"
          ? `Imported ${result.imported} review${result.imported === 1 ? "" : "s"}.`
          : success,
      );
      router.refresh();
    });
  }

  return (
    <Card className="space-y-5 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white shadow-sm ring-1 ring-black/5">
            <TripAdvisorMark className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-medium text-[#3D421F]">TripAdvisor</h2>
            <p className="text-sm text-black/55">
              Import guest reviews from the venue TripAdvisor listing via Apify.
            </p>
          </div>
        </div>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide",
            !apifyConfigured ? "bg-red-50 text-red-800" : status.className,
          )}
        >
          {!apifyConfigured ? "Token missing" : status.label}
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
          ? ` · ${source.review_count} TripAdvisor ratings`
          : null}
      </p>

      {source?.last_error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {source.last_error}
        </p>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="tripadvisor-listing-url">TripAdvisor listing URL</Label>
        <p className="text-xs text-black/45">
          Paste the restaurant page from TripAdvisor, for example Orilla’s listing.
        </p>
        <form
          className="flex flex-col gap-2 sm:flex-row"
          action={(formData) =>
            run(() => saveTripadvisorListingUrl(formData), "Listing URL saved.")
          }
        >
          <Input
            id="tripadvisor-listing-url"
            name="listingUrl"
            value={listingUrl}
            onChange={(event) => setListingUrl(event.target.value)}
            placeholder="https://www.tripadvisor.com/Restaurant_Review-…"
            disabled={!canEdit || pending}
            className="flex-1"
          />
          {canEdit ? (
            <Button type="submit" size="sm" disabled={pending}>
              Save URL
            </Button>
          ) : null}
        </form>
      </div>

      {!apifyConfigured ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          APIFY_TOKEN is not set on this environment.
        </p>
      ) : null}

      <p className="text-sm text-black/55">
        Uses the same Apify token and limits as Google: a daily job at 10:30 Dubai
        pulls reviews from the last 3 days. The first refresh imports the newest
        reviews (max 25); after that it is limited to once every 2 hours.
      </p>

      {canEdit ? (
        <Button
          type="button"
          disabled={pending || !apifyConfigured || !hasUrl || coolingDown}
          onClick={() =>
            run(
              () => refreshTripadvisorReviewsFromApify(),
              "TripAdvisor reviews refreshed.",
            )
          }
        >
          <RefreshCw className={cn("h-3.5 w-3.5", pending && "animate-spin")} />
          {coolingDown
            ? `Refresh available ${formatCooldownUntil(cooldownMs)}`
            : "Refresh latest reviews"}
        </Button>
      ) : (
        <p className="text-sm text-black/45">
          Admin access is required to save the listing or run a refresh.
        </p>
      )}
    </Card>
  );
}
