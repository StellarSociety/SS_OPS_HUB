"use server";

import { canAccessHiring } from "@/lib/hr/permissions";
import { loadMobileHiringPage } from "@/lib/mobile/hiring-replies";
import { requireMobileAppVenueAccess } from "@/lib/mobile/require-app-access";
import { loadPhoneAccess } from "@/lib/mobile/phone-access";

export async function loadMobileHiringPageAction(input: {
  venueId: string;
  formId?: string | null;
}) {
  const access = await requireMobileAppVenueAccess(input.venueId);
  if (!access) return null;

  // Phone access (Mobile App Access switches), not web grants.
  const phone = await loadPhoneAccess(access.userId, access.venueId);
  if (!canAccessHiring(phone.permissions, access.venueId)) {
    return null;
  }

  return loadMobileHiringPage(access.venueId, input.formId);
}
