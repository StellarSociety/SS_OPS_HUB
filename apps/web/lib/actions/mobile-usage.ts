"use server";

import { listUsers } from "@/lib/access/store";
import { getActionAuthContext } from "@/lib/auth/action-context";
import { venueSlugFromMobilePathname } from "@/lib/mobile/app-path";
import { canAccessMobileApp } from "@/lib/mobile/permissions";
import {
  buildMobileAppInsights,
  defaultMobileInsightsPeriod,
  dubaiDayRangeUtc,
  emptyMobileAppInsights,
  isIsoDate,
  isMobileUsageEventType,
  isMobileUsagePlatform,
  mobileUsagePageFromPathname,
  type MobileAppInsights,
  type MobileUsagePersonInfo,
} from "@/lib/mobile/usage";
import {
  insertMobileAppUsageEvent,
  listMobileAppUsageEvents,
} from "@/lib/mobile/usage-store";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function reportMobileAppUsage(input: {
  eventType: string;
  path: string;
  venueSlug?: string | null;
  platform?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Not signed in." };

    if (!isMobileUsageEventType(input.eventType)) {
      return { ok: false, error: "Invalid event." };
    }
    const page = mobileUsagePageFromPathname(input.path.trim());
    if (!page) return { ok: false, error: "Not a mobile screen." };

    let venueId: string | null = null;
    const venueSlug =
      input.venueSlug?.trim() || venueSlugFromMobilePathname(page.path) || "";
    if (venueSlug) {
      const { data: venue } = await supabase
        .from("venues")
        .select("id")
        .eq("slug", venueSlug)
        .maybeSingle();
      venueId = venue?.id ?? null;
    }

    const platform =
      input.platform && isMobileUsagePlatform(input.platform)
        ? input.platform
        : null;

    const saved = await insertMobileAppUsageEvent(supabase, user.id, {
      venueId,
      eventType: input.eventType,
      pageKey: page.pageKey,
      path: page.path,
      platform,
    });
    if (saved.error) return { ok: false, error: saved.error };
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not record usage." };
  }
}

function insightsPeopleFromUsers(
  users: Awaited<ReturnType<typeof listUsers>>,
): MobileUsagePersonInfo[] {
  return users.map((user) => ({
    userId: user.id,
    name:
      user.full_name?.trim() ||
      user.staff?.full_name?.trim() ||
      user.email,
    empNo: user.staff?.emp_no ?? null,
    staffId: user.staff?.id ?? null,
    photoUrl: user.staff?.photo_url ?? user.avatar_url ?? null,
    department: user.staff?.department?.name ?? null,
  }));
}

export async function listMobileAppInsights(input?: {
  from?: string;
  to?: string;
}): Promise<MobileAppInsights> {
  const fallback = defaultMobileInsightsPeriod();
  const periodFrom =
    input?.from && isIsoDate(input.from) ? input.from : fallback.from;
  const periodTo = input?.to && isIsoDate(input.to) ? input.to : fallback.to;
  const from = periodFrom <= periodTo ? periodFrom : periodTo;
  const to = periodFrom <= periodTo ? periodTo : periodFrom;

  const ctx = await getActionAuthContext();
  if ("error" in ctx) return emptyMobileAppInsights(from, to);
  const { venue, permissions } = ctx;
  if (!canAccessMobileApp(permissions, venue.id)) {
    return emptyMobileAppInsights(from, to);
  }

  const range = dubaiDayRangeUtc(from, to);
  const service = createServiceClient();
  const [events, users] = await Promise.all([
    listMobileAppUsageEvents(service, {
      venueId: venue.id,
      start: range.start,
      endExclusive: range.endExclusive,
    }),
    listUsers(service),
  ]);

  return buildMobileAppInsights({
    periodFrom: from,
    periodTo: to,
    events,
    people: insightsPeopleFromUsers(users),
  });
}
