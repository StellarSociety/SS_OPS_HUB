"use server";

import { loadMobileHiringPage } from "@/lib/mobile/hiring-replies";
import { requireMobileAppVenueAccess } from "@/lib/mobile/require-app-access";
import { loadPhoneAccess } from "@/lib/mobile/phone-access";
import { HIRING_SHORTCUT_KEY, isShortcutOpen } from "@/lib/mobile/shortcuts";

export async function loadMobileHiringPageAction(input: {
  venueId: string;
  formId?: string | null;
}) {
  const access = await requireMobileAppVenueAccess(input.venueId);
  if (!access) return null;

  // The Hiring Forms shortcut switch (Mobile App → Shortcuts), not web grants.
  const phone = await loadPhoneAccess(access.userId, access.venueId);
  if (!isShortcutOpen(phone.shortcuts[HIRING_SHORTCUT_KEY])) {
    return null;
  }

  return loadMobileHiringPage(access.venueId, input.formId);
}
