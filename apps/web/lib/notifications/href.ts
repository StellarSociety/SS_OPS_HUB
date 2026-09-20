import type { PushPlatform } from "@/lib/push/types";
import { toScopedHref, type VenueScope } from "@/lib/venue/scope-routing";

export function notificationCanonicalHref(n: {
  module_key: string;
  entity: string;
  entity_id: string;
}): string | null {
  if (n.module_key === "sentiment" && n.entity === "sentiment_review") {
    return `/sentiment/justify/${n.entity_id}`;
  }
  if (n.module_key === "hr" && n.entity === "staff") {
    return `/hr/${n.entity_id}`;
  }
  if (n.module_key === "hr" && n.entity === "schedule_week") {
    return `/hr/schedules`;
  }
  if (n.module_key === "hr" && n.entity === "payroll_run") {
    return `/hr/payroll/${n.entity_id}`;
  }
  if (n.module_key === "hr" && n.entity === "hiring_form") {
    return `/hr/hiring/replies/${n.entity_id}`;
  }
  if (n.module_key === "mobile_app" && n.entity === "mobile_app") {
    return "/install?reinstall=1";
  }
  return null;
}

/**
 * Click-through URL for a device notification.
 * Phone PWAs are scoped to `/m/`, so they open the inbox instead of a hub path.
 */
export function notificationClickPath(input: {
  module_key: string;
  entity: string;
  entity_id: string;
  venueSlug: string | null;
  isGlobalVenue: boolean;
  platform: PushPlatform;
}): string {
  if (input.module_key === "mobile_app" && input.entity === "mobile_app") {
    return "/install?reinstall=1";
  }
  if (input.platform !== "desktop") {
    return input.venueSlug ? `/m/${input.venueSlug}/notifications` : "/m/";
  }
  const canonical = notificationCanonicalHref(input) ?? "/modules";
  const scope: VenueScope = input.isGlobalVenue ? "global" : "venue";
  return toScopedHref(canonical, scope, input.venueSlug);
}
