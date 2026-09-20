import { createServiceClient } from "@/lib/supabase/service";
import { venueSlugFromMobilePathname } from "@/lib/mobile/app-path";
import { mobileUsagePageFromPathname } from "@/lib/mobile/usage";
import { insertMobileAppUsageEvent } from "@/lib/mobile/usage-store";

const EDIT_ACTIONS = new Set(["create", "update", "delete"]);

function pathFromReferer(referer: string | null): string | null {
  if (!referer) return null;
  try {
    return new URL(referer).pathname;
  } catch {
    return referer.startsWith("/") ? referer.split("?")[0] ?? referer : null;
  }
}

/**
 * When an audit write comes from the staff PWA, also count it as an in-app edit.
 * Swallows errors so audit inserts are never blocked.
 */
export async function recordMobileUsageEditFromAudit(entry: {
  actor_id: string | null;
  action: string;
  venue_id?: string | null;
}): Promise<void> {
  if (!entry.actor_id || !EDIT_ACTIONS.has(entry.action)) return;

  const { headers } = await import("next/headers");
  let referer: string | null = null;
  try {
    const headerStore = await headers();
    referer =
      headerStore.get("referer") ??
      headerStore.get("next-url") ??
      headerStore.get("x-url");
  } catch {
    return;
  }

  const path = pathFromReferer(referer);
  if (!path) return;
  const page = mobileUsagePageFromPathname(path);
  if (!page) return;

  const service = createServiceClient();
  let venueId = entry.venue_id ?? null;
  if (!venueId) {
    const slug = venueSlugFromMobilePathname(page.path);
    if (slug) {
      const { data: venue } = await service
        .from("venues")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();
      venueId = venue?.id ?? null;
    }
  }

  await insertMobileAppUsageEvent(service, entry.actor_id, {
    venueId,
    eventType: "edit",
    pageKey: page.pageKey,
    path: page.path,
    platform: null,
  });
}
