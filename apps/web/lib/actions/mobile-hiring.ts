"use server";

import { canAccessHiring } from "@/lib/hr/permissions";
import { loadMobileHiringPage } from "@/lib/mobile/hiring-replies";
import { requireMobileAppVenueAccess } from "@/lib/mobile/require-app-access";
import { createClient } from "@/lib/supabase/server";

export async function loadMobileHiringPageAction(input: {
  venueId: string;
  formId?: string | null;
}) {
  const access = await requireMobileAppVenueAccess(input.venueId);
  if (!access) return null;

  const supabase = await createClient();
  const { data: permissions } = await supabase
    .from("user_permissions")
    .select("*")
    .eq("user_id", access.userId);

  if (!canAccessHiring(permissions ?? [], access.venueId)) {
    return null;
  }

  return loadMobileHiringPage(access.venueId, input.formId);
}
