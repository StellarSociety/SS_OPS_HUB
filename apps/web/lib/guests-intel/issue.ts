import { headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";
import { publicAppUrl } from "@/lib/public-app-url";
import { sendGuestPassEmail } from "@/lib/guests-intel/email";
import { generateQrSvg, newRedeemCode } from "@/lib/guests-intel/qr";
import {
  getReward,
  getSettings,
  listRewards,
} from "@/lib/guests-intel/store";
import {
  DEFAULT_VALID_DAYS,
  guestPassPath,
  isMonthDay,
  parseGuestChoices,
  type GuestIntakeInput,
  type IssuedPassView,
} from "@/lib/guests-intel/types";

async function resolvePassOrigin(): Promise<string> {
  try {
    const headerStore = await headers();
    const host =
      headerStore.get("x-forwarded-host") || headerStore.get("host") || "";
    if (host) {
      const proto = headerStore.get("x-forwarded-proto") || "http";
      return `${proto}://${host}`;
    }
  } catch {
    // headers() is only available in a request context.
  }
  return publicAppUrl();
}

export function parseIntake(formData: FormData): GuestIntakeInput {
  return {
    firstName: String(formData.get("first_name") ?? "").trim(),
    lastName: String(formData.get("last_name") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim(),
    phone: String(formData.get("phone") ?? "").trim(),
    birthAnniversary: String(formData.get("birth_anniversary") ?? "").trim(),
    allergens: parseGuestChoices(formData.getAll("allergens")),
    otherDiets: parseGuestChoices(formData.getAll("other_diets")),
    notes: String(formData.get("notes") ?? "").trim(),
    marketingOptIn: String(formData.get("marketing_opt_in") ?? "") === "on",
    rewardId: String(formData.get("reward_id") ?? "").trim(),
  };
}

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function issuePassForIntake(params: {
  service: ReturnType<typeof createServiceClient>;
  venueId: string;
  venueName: string;
  source: "hub" | "public";
  submittedBy: string | null;
  input: GuestIntakeInput;
}): Promise<{ ok: true; pass: IssuedPassView } | { ok: false; error: string }> {
  const { service, venueId, venueName, source, submittedBy, input } = params;

  if (!input.firstName) return { ok: false, error: "First name is required." };
  if (!validateEmail(input.email)) {
    return { ok: false, error: "A valid email is required." };
  }
  if (input.birthAnniversary && !isMonthDay(input.birthAnniversary)) {
    return {
      ok: false,
      error: "Birth / anniversary date must be a valid day and month.",
    };
  }

  const settings = await getSettings(service, venueId);
  if (!settings) {
    return { ok: false, error: "Guests Intel is not set up for this venue yet." };
  }

  const rewards = await listRewards(service, venueId, { activeOnly: true });
  const rewardId = input.rewardId || settings.default_reward_id || rewards[0]?.id;
  if (!rewardId) {
    return {
      ok: false,
      error: "Add an active reward in Rewards before collecting guests.",
    };
  }
  const reward = await getReward(service, rewardId);
  if (!reward || reward.venue_id !== venueId || !reward.active || reward.archived_at) {
    return { ok: false, error: "That reward is not available." };
  }

  const { data: guestRow, error: guestError } = await service
    .from("guests_intel_guests")
    .insert({
      venue_id: venueId,
      source,
      first_name: input.firstName,
      last_name: input.lastName || null,
      email: input.email.toLowerCase(),
      phone: input.phone || null,
      visit_date: null,
      birth_anniversary: input.birthAnniversary || null,
      allergens: input.allergens,
      other_diets: input.otherDiets,
      notes: input.notes || null,
      marketing_opt_in: input.marketingOptIn,
      submitted_by: submittedBy,
    })
    .select("*")
    .single();
  if (guestError || !guestRow) {
    return { ok: false, error: guestError?.message ?? "Could not save the guest." };
  }

  const validDays = reward.valid_days ?? settings.valid_days ?? DEFAULT_VALID_DAYS;
  const expiresAt =
    validDays > 0
      ? new Date(Date.now() + validDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

  let code = newRedeemCode();
  let issueRow: Record<string, unknown> | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await service
      .from("guests_intel_issues")
      .insert({
        venue_id: venueId,
        guest_id: guestRow.id,
        reward_id: reward.id,
        code,
        status: "issued",
        expires_at: expiresAt,
      })
      .select("*")
      .single();
    if (!error && data) {
      issueRow = data as Record<string, unknown>;
      break;
    }
    if (error?.code !== "23505") {
      return { ok: false, error: error?.message ?? "Could not issue the pass." };
    }
    code = newRedeemCode();
  }
  if (!issueRow) {
    return { ok: false, error: "Could not issue a unique pass code." };
  }

  const passUrl = `${await resolvePassOrigin()}${guestPassPath(String(issueRow.code))}`;
  const qrSvg = await generateQrSvg(passUrl);
  const guest = {
    id: String(guestRow.id),
    venue_id: venueId,
    source,
    first_name: input.firstName,
    last_name: input.lastName || null,
    email: input.email.toLowerCase(),
    phone: input.phone || null,
    visit_date: null,
    birth_anniversary: input.birthAnniversary || null,
    allergens: input.allergens,
    other_diets: input.otherDiets,
    notes: input.notes || null,
    marketing_opt_in: input.marketingOptIn,
    submitted_by: submittedBy,
    created_at: String(guestRow.created_at),
    updated_at: String(guestRow.updated_at),
  };
  const issue = {
    id: String(issueRow.id),
    venue_id: venueId,
    guest_id: String(guestRow.id),
    reward_id: reward.id,
    code: String(issueRow.code),
    status: "issued" as const,
    issued_at: String(issueRow.issued_at),
    expires_at: issueRow.expires_at ? String(issueRow.expires_at) : null,
    redeemed_at: null,
    redeemed_by: null,
    email_sent_at: null,
    email_error: null,
    created_at: String(issueRow.created_at),
    updated_at: String(issueRow.updated_at),
  };

  const emailResult = await sendGuestPassEmail({
    venueId,
    venueName,
    settings,
    guest,
    reward,
    issue,
  });

  await service
    .from("guests_intel_issues")
    .update({
      email_sent_at: emailResult.sent ? new Date().toISOString() : null,
      email_error: emailResult.error,
    })
    .eq("id", issue.id);

  return {
    ok: true,
    pass: {
      guestId: guest.id,
      issueId: issue.id,
      code: issue.code,
      firstName: guest.first_name,
      lastName: guest.last_name,
      email: guest.email,
      rewardTitle: reward.title,
      rewardKind: reward.kind,
      rewardValueLabel: reward.value_label,
      rewardDescription: reward.description,
      terms: reward.terms,
      expiresAt: issue.expires_at,
      status: "issued",
      qrSvg,
      passPath: guestPassPath(issue.code),
      emailSent: emailResult.sent,
      emailError: emailResult.error,
    },
  };
}
