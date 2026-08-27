"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { issuePassForIntake, parseIntake } from "@/lib/guests-intel/issue";
import { getSettingsByToken } from "@/lib/guests-intel/store";

export async function submitPublicGuestForm(token: string, formData: FormData) {
  const service = createServiceClient();
  const settings = await getSettingsByToken(service, token);
  if (!settings || !settings.public_form_enabled) {
    return { ok: false as const, error: "This guest form is not available." };
  }

  const { data: venue, error } = await service
    .from("venues")
    .select("id, name")
    .eq("id", settings.venue_id)
    .maybeSingle();
  if (error || !venue) {
    return { ok: false as const, error: "This guest form is not available." };
  }

  const input = parseIntake(formData);
  if (!input.rewardId) {
    input.rewardId = settings.default_reward_id ?? "";
  }

  return issuePassForIntake({
    service,
    venueId: venue.id,
    venueName: venue.name,
    source: "public",
    submittedBy: null,
    input,
  });
}
