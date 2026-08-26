"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link2, RefreshCw, Unplug } from "lucide-react";
import { GoogleMark } from "@/components/sentiment/channel-marks";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import {
  clearGooglePlacesApiKey,
  disconnectGoogle,
  listGoogleLocationsAction,
  saveGooglePlaceId,
  saveGooglePlacesApiKey,
  selectGoogleLocation,
  startGoogleOAuth,
  syncGoogleReviews,
} from "@/lib/actions/sentiment-google";
import type {
  GoogleBusinessLocation,
  SentimentReviewSource,
} from "@/lib/sentiment/types";
import { cn } from "@/lib/utils";
import { joinAppUrl, PRODUCTION_APP_URL } from "@/lib/public-app-url";

function statusBadge(status: SentimentReviewSource["status"]) {
  if (status === "connected") return "bg-emerald-50 text-emerald-800";
  if (status === "pending") return "bg-amber-50 text-amber-900";
  if (status === "error") return "bg-red-50 text-red-800";
  return "bg-black/5 text-black/50";
}

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

export function GoogleConnectionCard({
  source,
  oauthConfigured,
  placesConfigured,
  canEdit,
}: {
  source: SentimentReviewSource | null;
  oauthConfigured: boolean;
  placesConfigured: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [placeId, setPlaceId] = useState(source?.place_id ?? "");
  const [placesApiKey, setPlacesApiKey] = useState("");
  const [locations, setLocations] = useState<GoogleBusinessLocation[] | null>(
    null,
  );
  const [pending, startTransition] = useTransition();

  const statusLabel = useMemo(() => {
    if (!source || source.status === "disconnected") return "Not connected";
    if (source.status === "pending") return "Choose a location";
    if (source.status === "error") return "Needs attention";
    return "Connected";
  }, [source]);

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
            <GoogleMark className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-medium text-[#3D421F]">Google</h2>
            <p className="text-sm text-black/55">
              Import guest reviews from the venue Google listing.
            </p>
          </div>
        </div>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide",
            statusBadge(source?.status ?? "disconnected"),
          )}
        >
          {statusLabel}
        </span>
      </div>

      {source?.location_name || source?.account_email ? (
        <p className="text-sm text-black/60">
          {source.location_name ? <strong>{source.location_name}</strong> : null}
          {source.account_email
            ? ` · connected as ${source.account_email}`
            : null}
          {source.last_synced_at
            ? ` · last import ${formatSynced(source.last_synced_at)}`
            : null}
        </p>
      ) : null}

      {source?.last_error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {source.last_error}
        </p>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="google-places-api-key">Places API key</Label>
        <p className="text-xs text-black/45">
          Create a key in{" "}
          <a
            href="https://console.cloud.google.com/google/maps-apis/credentials"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >
            Google Cloud credentials
          </a>
          . This app needs{" "}
          <a
            href="https://console.cloud.google.com/apis/library/places.googleapis.com"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >
            Places API (New)
          </a>
          , not the legacy Places API. Enable Places API (New), attach billing,
          then on the key allow “Places API (New)”. A public Place ID import
          can include up to 5 reviews — only if Google returns the reviews
          field on that key. For the full history, connect Google Business
          Profile below. Saved keys are stored encrypted and never shown again.
          {placesConfigured
            ? " A key is already available for this venue."
            : null}
        </p>
        <form
          className="flex flex-col gap-2 sm:flex-row"
          action={(formData) =>
            run(async () => {
              const result = await saveGooglePlacesApiKey(formData);
              if (result.ok) setPlacesApiKey("");
              return result;
            }, "Places API key saved.")
          }
        >
          <Input
            id="google-places-api-key"
            name="placesApiKey"
            type="password"
            autoComplete="off"
            value={placesApiKey}
            onChange={(event) => setPlacesApiKey(event.target.value)}
            placeholder={
              source?.has_places_api_key || placesConfigured
                ? "••••••••••••••••"
                : "AIza…"
            }
            disabled={!canEdit || pending}
            className="flex-1"
          />
          {canEdit ? (
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={pending}>
                Save API key
              </Button>
              {source?.has_places_api_key ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => clearGooglePlacesApiKey(),
                      "Places API key removed.",
                    )
                  }
                >
                  Remove
                </Button>
              ) : null}
            </div>
          ) : null}
        </form>
      </div>

      <div className="space-y-2">
        <Label htmlFor="google-place-id">Google Place ID</Label>
        <p className="text-xs text-black/45">
          Paste the listing Place ID from{" "}
          <a
            href="https://developers.google.com/maps/documentation/javascript/examples/places-placeid-finder"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >
            Google’s Place ID finder
          </a>
          , or a Google Maps URL. Public reviews (up to 5) import with the key
          above.
        </p>
        <form
          className="flex flex-col gap-2 sm:flex-row"
          action={(formData) =>
            run(() => saveGooglePlaceId(formData), "Google Place ID saved.")
          }
        >
          <Input
            id="google-place-id"
            name="placeId"
            value={placeId}
            onChange={(event) => setPlaceId(event.target.value)}
            placeholder="ChIJ… or a Google Maps URL"
            disabled={!canEdit || pending}
            className="flex-1"
          />
          {canEdit ? (
            <Button type="submit" size="sm" disabled={pending}>
              Save Place ID
            </Button>
          ) : null}
        </form>
      </div>

      <div className="space-y-2 border-t border-black/5 pt-4">
        <p className="text-sm font-medium text-[#3D421F]">
          Google Business Profile
        </p>
        <p className="text-xs text-black/45">
          Connect the Google account that manages this listing to import the
          full review history and, later, reply from the app. In Google Cloud
          enable Account Management, Business Information, and Google My
          Business API, and add both redirect URIs:{" "}
          <code className="text-[11px]">
            {joinAppUrl("/api/sentiment/google/callback", PRODUCTION_APP_URL)}
          </code>{" "}
          and{" "}
          <code className="text-[11px]">
            http://localhost:3000/api/sentiment/google/callback
          </code>
          .
          {!oauthConfigured
            ? " Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, then restart the app."
            : null}
        </p>
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            <form
              action={async () => {
                const result = await startGoogleOAuth();
                if (result && "error" in result) toast.error(result.error);
              }}
            >
              <Button
                type="submit"
                size="sm"
                variant="secondary"
                disabled={!oauthConfigured || pending}
              >
                <Link2 className="h-3.5 w-3.5" />
                {source?.connected_via_oauth
                  ? "Reconnect Google"
                  : "Connect Google account"}
              </Button>
            </form>
            {source?.connected_via_oauth &&
            !source.external_location_id ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await listGoogleLocationsAction();
                    if (!result.ok) {
                      toast.error(result.error);
                      return;
                    }
                    setLocations(result.locations);
                    if (result.locations.length === 0) {
                      toast.alert("No Business Profile locations on this account.");
                    }
                  })
                }
              >
                Load locations
              </Button>
            ) : null}
            {source?.connected_via_oauth ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  run(() => disconnectGoogle(), "Google account disconnected.")
                }
              >
                <Unplug className="h-3.5 w-3.5" />
                Disconnect
              </Button>
            ) : null}
          </div>
        ) : null}

        {locations && locations.length > 0 ? (
          <LocationPicker
            locations={locations}
            pending={pending}
            onSave={(formData) =>
              run(async () => {
                const result = await selectGoogleLocation(formData);
                if (result.ok) setLocations(null);
                return result;
              }, "Google location saved.")
            }
          />
        ) : null}
      </div>

      {canEdit ? (
        <div className="border-t border-black/5 pt-4">
          <Button
            type="button"
            disabled={pending || (!source?.place_id && !source?.external_location_id)}
            onClick={() =>
              run(() => syncGoogleReviews(), "Google reviews imported.")
            }
          >
            <RefreshCw className={cn("h-3.5 w-3.5", pending && "animate-spin")} />
            Import reviews
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

function LocationPicker({
  locations,
  pending,
  onSave,
}: {
  locations: GoogleBusinessLocation[];
  pending: boolean;
  onSave: (formData: FormData) => void;
}) {
  const [selectedId, setSelectedId] = useState(locations[0]?.locationId ?? "");
  const location =
    locations.find((item) => item.locationId === selectedId) ?? locations[0];

  return (
    <form
      className="space-y-2 rounded-lg border border-black/10 bg-white/70 p-3"
      action={onSave}
    >
      <Label htmlFor="google-location">Choose the venue listing</Label>
      <select
        id="google-location"
        name="locationId"
        className="flex h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F] outline-none focus:border-[var(--venue-primary)]/50 focus:ring-2 focus:ring-[var(--venue-primary)]/20"
        value={selectedId}
        onChange={(event) => setSelectedId(event.target.value)}
        disabled={pending}
      >
        {locations.map((item) => (
          <option
            key={`${item.accountId}:${item.locationId}`}
            value={item.locationId}
          >
            {item.title}
            {item.accountName ? ` · ${item.accountName}` : ""}
          </option>
        ))}
      </select>
      <input type="hidden" name="accountId" value={location?.accountId ?? ""} />
      <input type="hidden" name="title" value={location?.title ?? ""} />
      <input type="hidden" name="placeId" value={location?.placeId ?? ""} />
      <input type="hidden" name="mapsUri" value={location?.mapsUri ?? ""} />
      <Button type="submit" size="sm" disabled={pending}>
        Use this location
      </Button>
    </form>
  );
}
