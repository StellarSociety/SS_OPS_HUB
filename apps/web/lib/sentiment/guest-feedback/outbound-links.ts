import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadEmailChromeForVenue,
  normalizeEmailChromeUrl,
} from "@/lib/hr/email-chrome";
import { EMAIL_CHROME_SOCIAL_LINKS } from "@/lib/hr/types";
import { listReviewSources } from "@/lib/sentiment/store";
import type { GuestFeedbackOutboundLink } from "./types";

export function googleReviewHref(
  placeId: string | null,
  locationUrl: string | null,
): string | null {
  const id = placeId?.trim();
  if (id) {
    return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(id)}`;
  }
  const url = locationUrl?.trim();
  return url || null;
}

export function tripadvisorReviewHref(listingUrl: string | null): string | null {
  const url = listingUrl?.trim();
  if (!url) return null;
  const match = url.match(/-g(\d+)-d(\d+)/i);
  if (match) {
    return `https://www.tripadvisor.com/UserReviewEdit-g${match[1]}-d${match[2]}`;
  }
  return url;
}

export async function loadGuestFeedbackOutboundLinks(
  client: SupabaseClient,
  venue: { id: string; slug?: string | null; name?: string | null },
): Promise<GuestFeedbackOutboundLink[]> {
  const [chrome, sources] = await Promise.all([
    loadEmailChromeForVenue(client, venue),
    listReviewSources(client, venue.id),
  ]);

  const google = sources.find((source) => source.channel === "google");
  const tripadvisor = sources.find((source) => source.channel === "tripadvisor");
  const fallbacks: Record<string, string> = {
    googleUrl:
      googleReviewHref(google?.place_id ?? null, google?.location_url ?? null) ??
      "",
    tripadvisorUrl: tripadvisor?.location_url?.trim() || "",
  };

  return EMAIL_CHROME_SOCIAL_LINKS.flatMap((row) => {
    const href =
      normalizeEmailChromeUrl(chrome[row.key]) ||
      normalizeEmailChromeUrl(fallbacks[row.key] ?? "");
    if (!href) return [];
    return [
      {
        key: row.key,
        label: row.label,
        href,
        icon: row.icon,
      },
    ];
  });
}
