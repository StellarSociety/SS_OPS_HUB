"use server";

import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { getActionAuthContext } from "@/lib/auth/action-context";
import { createServiceClient } from "@/lib/supabase/service";
import { sendGuestPassEmail } from "@/lib/guests-intel/email";
import {
  canAdminSettings,
  canAccessRedeem,
  canEditCollect,
  canEditRedeem,
  canEditRewards,
} from "@/lib/guests-intel/permissions";
import { newPublicToken } from "@/lib/guests-intel/qr";
import { issuePassForIntake, parseIntake, validateEmail } from "@/lib/guests-intel/issue";
import {
  getIssueByCode,
  getSettings,
  listRewards,
} from "@/lib/guests-intel/store";
import {
  DEFAULT_FROM_EMAIL,
  DEFAULT_VALID_DAYS,
  GUESTS_INTEL_MODULE_KEY,
  REWARD_KINDS,
  type RewardKind,
} from "@/lib/guests-intel/types";

function fail(message: string) {
  return { ok: false as const, error: message };
}

function revalidateGuestsIntel() {
  revalidatePath("/guests-intel", "page");
  revalidatePath("/guests-intel/collect", "page");
  revalidatePath("/guests-intel/collect/share", "page");
  revalidatePath("/guests-intel/guests", "page");
  revalidatePath("/guests-intel/rewards", "page");
  revalidatePath("/guests-intel/redeem", "page");
  revalidatePath("/guests-intel/settings", "page");
}

export async function submitHubGuestForm(formData: FormData) {
  const auth = await getActionAuthContext();
  if ("error" in auth) return fail(auth.error);
  if (!canEditCollect(auth.permissions, auth.venue.id)) {
    return fail("You need Collect edit access to fill this form.");
  }
  if (auth.venue.is_global) {
    return fail("Open Guests Intel from a venue, not Global.");
  }

  const result = await issuePassForIntake({
    service: createServiceClient(),
    venueId: auth.venue.id,
    venueName: auth.venue.name,
    source: "hub",
    submittedBy: auth.user.id,
    input: parseIntake(formData),
  });
  if (!result.ok) return result;

  await writeAuditLog({
    actor_id: auth.user.id,
    action: "guests_intel.collect",
    module_key: GUESTS_INTEL_MODULE_KEY,
    entity: "guests_intel_guests",
    entity_id: result.pass.guestId,
    venue_id: auth.venue.id,
    after: { email: result.pass.email, code: result.pass.code },
  });
  revalidateGuestsIntel();
  return result;
}

export async function resendGuestPassEmail(issueId: string) {
  const auth = await getActionAuthContext();
  if ("error" in auth) return fail(auth.error);
  if (!canEditCollect(auth.permissions, auth.venue.id)) {
    return fail("You need Collect edit access to resend a pass.");
  }

  const service = createServiceClient();
  const { data: issueRow, error } = await service
    .from("guests_intel_issues")
    .select("*")
    .eq("id", issueId)
    .eq("venue_id", auth.venue.id)
    .maybeSingle();
  if (error || !issueRow) return fail("Pass not found.");

  const found = await getIssueByCode(service, String(issueRow.code));
  if (!found) return fail("Pass not found.");
  const settings = await getSettings(service, auth.venue.id);
  if (!settings) return fail("Guests Intel is not set up for this venue yet.");

  const emailResult = await sendGuestPassEmail({
    venueId: auth.venue.id,
    venueName: auth.venue.name,
    settings,
    guest: found.guest,
    reward: found.reward,
    issue: found.issue,
  });

  await service
    .from("guests_intel_issues")
    .update({
      email_sent_at: emailResult.sent ? new Date().toISOString() : found.issue.email_sent_at,
      email_error: emailResult.error,
    })
    .eq("id", issueId);

  if (!emailResult.sent) return fail(emailResult.error ?? "Could not send email.");
  revalidateGuestsIntel();
  return { ok: true as const };
}

export async function lookupRedeemCode(code: string) {
  const auth = await getActionAuthContext();
  if ("error" in auth) return fail(auth.error);
  if (!canAccessRedeem(auth.permissions, auth.venue.id)) {
    return fail("You need Redeem access to look up a pass.");
  }

  const service = createServiceClient();
  const found = await getIssueByCode(service, code);
  if (!found || found.issue.venue_id !== auth.venue.id) {
    return fail("No pass matches that code.");
  }

  const now = Date.now();
  const expired =
    found.issue.status === "issued" &&
    found.issue.expires_at &&
    new Date(found.issue.expires_at).getTime() < now;
  const status = expired ? "expired" : found.issue.status;

  return {
    ok: true as const,
    pass: {
      issueId: found.issue.id,
      code: found.issue.code,
      status,
      firstName: found.guest.first_name,
      lastName: found.guest.last_name,
      email: found.guest.email,
      rewardTitle: found.reward.title,
      rewardKind: found.reward.kind,
      rewardValueLabel: found.reward.value_label,
      expiresAt: found.issue.expires_at,
      redeemedAt: found.issue.redeemed_at,
    },
  };
}

export async function redeemGuestPass(issueId: string) {
  const auth = await getActionAuthContext();
  if ("error" in auth) return fail(auth.error);
  if (!canEditRedeem(auth.permissions, auth.venue.id)) {
    return fail("You need Redeem edit access to mark a pass as used.");
  }

  const service = createServiceClient();
  const { data: issue, error } = await service
    .from("guests_intel_issues")
    .select("*")
    .eq("id", issueId)
    .eq("venue_id", auth.venue.id)
    .maybeSingle();
  if (error || !issue) return fail("Pass not found.");
  if (issue.status === "redeemed") return fail("This pass has already been redeemed.");
  if (issue.status === "void") return fail("This pass is void.");
  if (
    issue.expires_at &&
    new Date(String(issue.expires_at)).getTime() < Date.now()
  ) {
    await service
      .from("guests_intel_issues")
      .update({ status: "expired" })
      .eq("id", issueId);
    return fail("This pass has expired.");
  }
  if (issue.status !== "issued") return fail("This pass cannot be redeemed.");

  const { error: updateError } = await service
    .from("guests_intel_issues")
    .update({
      status: "redeemed",
      redeemed_at: new Date().toISOString(),
      redeemed_by: auth.user.id,
    })
    .eq("id", issueId);
  if (updateError) return fail(updateError.message);

  await writeAuditLog({
    actor_id: auth.user.id,
    action: "guests_intel.redeem",
    module_key: GUESTS_INTEL_MODULE_KEY,
    entity: "guests_intel_issues",
    entity_id: issueId,
    venue_id: auth.venue.id,
    after: { code: issue.code },
  });
  revalidateGuestsIntel();
  return { ok: true as const };
}

export async function saveGuestReward(formData: FormData) {
  const auth = await getActionAuthContext();
  if ("error" in auth) return fail(auth.error);
  if (!canEditRewards(auth.permissions, auth.venue.id)) {
    return fail("You need Rewards edit access.");
  }

  const id = String(formData.get("id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const kind = String(formData.get("kind") ?? "").trim() as RewardKind;
  const description = String(formData.get("description") ?? "").trim();
  const valueLabel = String(formData.get("value_label") ?? "").trim();
  const terms = String(formData.get("terms") ?? "").trim();
  const validDaysRaw = String(formData.get("valid_days") ?? "").trim();
  const active = String(formData.get("active") ?? "") === "on";

  if (!title) return fail("Title is required.");
  if (!REWARD_KINDS.includes(kind)) return fail("Choose a reward type.");
  const validDays = validDaysRaw ? Number(validDaysRaw) : null;
  if (validDays != null && (!Number.isFinite(validDays) || validDays < 0)) {
    return fail("Valid days must be 0 or more.");
  }

  const service = createServiceClient();
  if (id) {
    const { error } = await service
      .from("guests_intel_rewards")
      .update({
        title,
        kind,
        description: description || null,
        value_label: valueLabel || null,
        terms: terms || null,
        valid_days: validDays,
        active,
      })
      .eq("id", id)
      .eq("venue_id", auth.venue.id);
    if (error) return fail(error.message);
  } else {
    const existing = await listRewards(service, auth.venue.id, {
      includeArchived: true,
    });
    const sortOrder =
      existing.reduce((max, reward) => Math.max(max, reward.sort_order), 0) + 10;
    const { error } = await service.from("guests_intel_rewards").insert({
      venue_id: auth.venue.id,
      title,
      kind,
      description: description || null,
      value_label: valueLabel || null,
      terms: terms || null,
      valid_days: validDays,
      active,
      sort_order: sortOrder,
    });
    if (error) return fail(error.message);
  }

  await writeAuditLog({
    actor_id: auth.user.id,
    action: id ? "guests_intel.reward_update" : "guests_intel.reward_create",
    module_key: GUESTS_INTEL_MODULE_KEY,
    entity: "guests_intel_rewards",
    entity_id: id || null,
    venue_id: auth.venue.id,
    after: { title, kind },
  });
  revalidateGuestsIntel();
  return { ok: true as const };
}

export async function archiveGuestReward(id: string, restore = false) {
  const auth = await getActionAuthContext();
  if ("error" in auth) return fail(auth.error);
  if (!canEditRewards(auth.permissions, auth.venue.id)) {
    return fail("You need Rewards edit access.");
  }

  const service = createServiceClient();
  const { error } = await service
    .from("guests_intel_rewards")
    .update({
      archived_at: restore ? null : new Date().toISOString(),
      active: restore,
    })
    .eq("id", id)
    .eq("venue_id", auth.venue.id);
  if (error) return fail(error.message);

  await writeAuditLog({
    actor_id: auth.user.id,
    action: restore ? "guests_intel.reward_restore" : "guests_intel.reward_archive",
    module_key: GUESTS_INTEL_MODULE_KEY,
    entity: "guests_intel_rewards",
    entity_id: id,
    venue_id: auth.venue.id,
  });
  revalidateGuestsIntel();
  return { ok: true as const };
}

export async function saveGuestsIntelSettings(formData: FormData) {
  const auth = await getActionAuthContext();
  if ("error" in auth) return fail(auth.error);
  if (!canAdminSettings(auth.permissions, auth.venue.id)) {
    return fail("You need Guests Intel Settings admin access.");
  }

  const fromEmail = String(formData.get("from_email") ?? "").trim();
  const fromName = String(formData.get("from_name") ?? "").trim();
  const formTitle = String(formData.get("form_title") ?? "").trim();
  const formIntro = String(formData.get("form_intro") ?? "").trim();
  const thankYou = String(formData.get("thank_you_message") ?? "").trim();
  const emailSubject = String(formData.get("email_subject") ?? "").trim();
  const defaultRewardId = String(formData.get("default_reward_id") ?? "").trim();
  const publicFormEnabled = String(formData.get("public_form_enabled") ?? "") === "on";
  const validDays = Number(String(formData.get("valid_days") ?? DEFAULT_VALID_DAYS));
  const rotateToken = String(formData.get("rotate_token") ?? "") === "1";

  if (!fromEmail || !validateEmail(fromEmail)) {
    return fail("Enter a valid from email, e.g. reservations@orillarestaurant.com.");
  }
  if (!fromName) return fail("From name is required.");
  if (!formTitle) return fail("Form title is required.");
  if (!Number.isFinite(validDays) || validDays < 0) {
    return fail("Valid days must be 0 or more.");
  }

  const service = createServiceClient();
  const current = await getSettings(service, auth.venue.id);
  if (!current) return fail("Guests Intel is not set up for this venue yet.");

  const { error } = await service
    .from("guests_intel_settings")
    .update({
      from_email: fromEmail || DEFAULT_FROM_EMAIL,
      from_name: fromName,
      form_title: formTitle,
      form_intro: formIntro,
      thank_you_message: thankYou,
      email_subject: emailSubject || current.email_subject,
      default_reward_id: defaultRewardId || null,
      public_form_enabled: publicFormEnabled,
      valid_days: validDays,
      ...(rotateToken ? { public_token: newPublicToken() } : {}),
    })
    .eq("venue_id", auth.venue.id);
  if (error) return fail(error.message);

  await writeAuditLog({
    actor_id: auth.user.id,
    action: "guests_intel.settings_update",
    module_key: GUESTS_INTEL_MODULE_KEY,
    entity: "guests_intel_settings",
    entity_id: auth.venue.id,
    venue_id: auth.venue.id,
    after: { fromEmail, publicFormEnabled, rotateToken },
  });
  revalidateGuestsIntel();
  return { ok: true as const };
}
