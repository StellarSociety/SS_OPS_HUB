"use server";

import { getActionAuthContext } from "@/lib/auth/action-context";
import { canAccessConnect } from "@/lib/connect/permissions";
import { listVenueAppUsers } from "@/lib/connect/store";
import type { ConnectPerson } from "@/lib/connect/types";
import { createServiceClient } from "@/lib/supabase/service";

/** Everyone at the venue who can be @mentioned (excluding the viewer). */
export async function getMentionPeople(): Promise<ConnectPerson[]> {
  const auth = await getActionAuthContext();
  if ("error" in auth || auth.venue.is_global) return [];
  if (!canAccessConnect(auth.permissions, auth.venue.id)) return [];
  const people = await listVenueAppUsers(createServiceClient(), auth.venue.id);
  return people.filter((p) => p.userId !== auth.user.id);
}
