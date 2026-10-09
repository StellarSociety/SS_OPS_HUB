import "server-only";

import { canAccessConnect, canAccessConnectSettings, canAdminConnect } from "@/lib/connect/permissions";
import { listConnectGroups, loadConnectPeople } from "@/lib/connect/store";
import { getMobileAppContext } from "@/lib/mobile/page-context";
import type { UserPermission } from "@/lib/role-permissions";
import { createServiceClient } from "@/lib/supabase/service";

export async function getMobileConnectContext(venueSlug: string) {
  const base = await getMobileAppContext(venueSlug);
  const permissions = base.permissions as UserPermission[];
  const service = createServiceClient();
  const isConnectAdmin = canAdminConnect(permissions, base.venue.id);
  const seesAllGroups = canAccessConnectSettings(permissions, base.venue.id);
  const [groups, people] = await Promise.all([
    listConnectGroups(service, base.venue.id, {
      userId: base.user.id,
      seesAllGroups,
      isConnectAdmin,
    }),
    loadConnectPeople(service, [base.user.id]),
  ]);

  return {
    ...base,
    service,
    groups,
    me: people.get(base.user.id) ?? null,
    canAccess: canAccessConnect(permissions, base.venue.id),
  };
}
