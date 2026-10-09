import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import {
  getRenderClient,
  getRenderUser,
  getRenderVenue,
} from "@/lib/auth/render-user";
import {
  listAnniversaryCelebrations,
  listBirthdayCelebrations,
} from "@/lib/directory/celebrations";
import { isDirectoryPeopleMember, loadDirectoryStaff } from "@/lib/directory/store";
import type { UserPermission } from "@/lib/role-permissions";
import { createServiceClient } from "@/lib/supabase/service";
import {
  canAccessConnect,
  canAccessConnectSettings,
  canAdminConnect,
} from "./permissions";
import { listConnectGroups, loadConnectPeople } from "./store";
import type { ConnectCelebrationItem } from "./types";

/** Celebrations shown in the feed: three days back through a week ahead. */
const CELEBRATION_DAYS_BEFORE = 3;
const CELEBRATION_DAYS_AFTER = 7;

/** Shared by the Connecteam layout and pages — deduped per request. */
export const getConnectPageContext = cache(async function getConnectPageContext() {
  const supabase = await getRenderClient();
  const user = await getRenderUser();
  if (!user) redirect("/login");

  const venue = await getRenderVenue();
  if (!venue) redirect("/select-venue");

  const { data: permissionRows } = await supabase
    .from("user_permissions")
    .select("*")
    .eq("user_id", user.id);
  const permissions = (permissionRows ?? []) as UserPermission[];

  const service = createServiceClient();
  const isConnectAdmin = canAdminConnect(permissions, venue.id);
  const seesAllGroups = canAccessConnectSettings(permissions, venue.id);

  const [groups, people] = await Promise.all([
    venue.is_global
      ? Promise.resolve([])
      : listConnectGroups(service, venue.id, {
          userId: user.id,
          seesAllGroups,
          isConnectAdmin,
        }),
    loadConnectPeople(service, [user.id]),
  ]);

  return {
    supabase,
    service,
    user,
    me: people.get(user.id) ?? null,
    venue,
    permissions,
    canAccess: canAccessConnect(permissions, venue.id),
    isConnectAdmin,
    seesAllGroups,
    groups,
  };
});

export async function loadConnectCelebrations(
  service: ReturnType<typeof createServiceClient>,
  venue: { id: string; is_global?: boolean },
): Promise<ConnectCelebrationItem[]> {
  const staff = (await loadDirectoryStaff(service, venue)).filter(
    isDirectoryPeopleMember,
  );
  const inRange = (days: number) =>
    days >= -CELEBRATION_DAYS_BEFORE && days <= CELEBRATION_DAYS_AFTER;

  return [
    ...listBirthdayCelebrations(staff),
    ...listAnniversaryCelebrations(staff),
  ]
    .filter((c) => inRange(c.daysFromToday))
    .sort(
      (a, b) =>
        Math.abs(a.daysFromToday) - Math.abs(b.daysFromToday) ||
        a.occurrenceDate.localeCompare(b.occurrenceDate),
    )
    .map((c) => ({
      staffId: c.staffId,
      staffName: c.member.fullName,
      photoUrl: c.member.photoUrl,
      positionName: c.member.positionName,
      kind: c.kind,
      occurrenceDate: c.occurrenceDate,
      daysFromToday: c.daysFromToday,
      years: c.years,
    }));
}
