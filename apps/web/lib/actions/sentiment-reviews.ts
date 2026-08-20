"use server";

import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { listUsers } from "@/lib/access/store";
import type { UserListRow } from "@/lib/access/types";
import { getActionAuthContext } from "@/lib/auth/action-context";
import { decryptSecret, encryptSecret } from "@/lib/email/secret";
import {
  deleteGoogleReviewReply,
  updateGoogleReviewReply,
} from "@/lib/sentiment/google/business-profile";
import { refreshGoogleAccessToken } from "@/lib/sentiment/google/oauth";
import { canAdminSettings, canEditActions, canEditReviews } from "@/lib/sentiment/permissions";
import {
  deleteReplyTemplate as deleteReplyTemplateRow,
  getReviewAction,
  getReviewById,
  getSourceSecrets,
  updateReviewReply,
  updateReviewSource,
  upsertReplyTemplate,
  upsertReviewAction,
} from "@/lib/sentiment/store";
import {
  MAX_REVIEW_REPLY_LENGTH,
  SENTIMENT_ACTION_STATUSES,
  SENTIMENT_RECOVERY_TAGS,
  type SentimentActionStatus,
  type SentimentJustificationAssignee,
} from "@/lib/sentiment/types";
import { createServiceClient } from "@/lib/supabase/service";

function fail(message: string) {
  return { ok: false as const, error: message };
}

function revalidateSentimentReviews() {
  revalidatePath("/sentiment", "page");
  revalidatePath("/sentiment/reviews", "page");
  revalidatePath("/sentiment/reviews/google", "page");
  revalidatePath("/sentiment/reviews/tripadvisor", "page");
  revalidatePath("/sentiment/actions", "page");
  revalidatePath("/sentiment/settings", "page");
  revalidatePath("/sentiment/settings/templates", "page");
}

async function requireReviewEditor(): Promise<
  | { error: string }
  | {
      userId: string;
      venueId: string;
      service: ReturnType<typeof createServiceClient>;
    }
> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { error: auth.error };

  if (!canEditReviews(auth.permissions, auth.venue.id)) {
    return { error: "You need Sentiment Reviews edit access to reply." };
  }

  return {
    userId: auth.user.id,
    venueId: auth.venue.id,
    service: createServiceClient(),
  };
}

async function requireTemplateEditor(): Promise<
  | { error: string }
  | {
      userId: string;
      venueId: string;
      service: ReturnType<typeof createServiceClient>;
    }
> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { error: auth.error };

  if (
    !canAdminSettings(auth.permissions, auth.venue.id) &&
    !canEditReviews(auth.permissions, auth.venue.id)
  ) {
    return {
      error: "You need Sentiment Settings admin or Reviews edit access to change templates.",
    };
  }

  return {
    userId: auth.user.id,
    venueId: auth.venue.id,
    service: createServiceClient(),
  };
}

async function postReplyToGoogle(args: {
  service: ReturnType<typeof createServiceClient>;
  venueId: string;
  externalId: string;
  comment: string | null;
}): Promise<{ posted: boolean; error: string | null }> {
  const secrets = await getSourceSecrets(args.service, args.venueId, "google");
  if (
    !secrets?.refresh_token_encrypted ||
    !secrets.external_account_id ||
    !secrets.external_location_id
  ) {
    return { posted: false, error: null };
  }

  try {
    const access = await refreshGoogleAccessToken(
      decryptSecret(secrets.refresh_token_encrypted),
    );
    await updateReviewSource(args.service, secrets.id, {
      access_token_encrypted: encryptSecret(access.accessToken),
      access_token_expires_at: access.expiresAt,
    });

    if (args.comment) {
      await updateGoogleReviewReply(
        access.accessToken,
        secrets.external_account_id,
        secrets.external_location_id,
        args.externalId,
        args.comment,
      );
    } else {
      await deleteGoogleReviewReply(
        access.accessToken,
        secrets.external_account_id,
        secrets.external_location_id,
        args.externalId,
      );
    }
    return { posted: true, error: null };
  } catch (error) {
    return {
      posted: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not update this reply on Google.",
    };
  }
}

export async function saveReviewReply(formData: FormData) {
  const ctx = await requireReviewEditor();
  if ("error" in ctx) return fail(ctx.error);

  const reviewId = String(formData.get("reviewId") ?? "").trim();
  const comment = String(formData.get("reply") ?? "").trim();
  if (!reviewId) return fail("Missing review.");
  if (!comment) return fail("Write a reply before posting.");
  if (comment.length > MAX_REVIEW_REPLY_LENGTH) {
    return fail(`Replies can be at most ${MAX_REVIEW_REPLY_LENGTH} characters.`);
  }

  const review = await getReviewById(ctx.service, ctx.venueId, reviewId);
  if (!review) return fail("That review is no longer available.");

  let syncStatus: "local" | "posted" | "error" = "local";
  let syncError: string | null = null;
  let postedToGoogle = false;

  if (!review.is_practice && review.channel === "google") {
    const google = await postReplyToGoogle({
      service: ctx.service,
      venueId: ctx.venueId,
      externalId: review.external_id,
      comment,
    });
    postedToGoogle = google.posted;
    if (google.posted) {
      syncStatus = "posted";
    } else if (google.error) {
      syncStatus = "error";
      syncError = google.error;
    }
  }

  await updateReviewReply(ctx.service, ctx.venueId, reviewId, {
    reply_text: comment,
    reply_at: new Date().toISOString(),
    status: "replied",
    reply_sync_status: syncStatus,
    reply_sync_error: syncError,
  });

  await writeAuditLog({
    actor_id: ctx.userId,
    action: "reply",
    module_key: "sentiment",
    entity: "sentiment_reviews",
    entity_id: reviewId,
    venue_id: ctx.venueId,
    after: {
      is_practice: review.is_practice,
      posted_to_google: postedToGoogle,
    },
  });

  revalidateSentimentReviews();

  if (syncError) {
    return {
      ok: true as const,
      postedToGoogle: false,
      warning: `Reply saved in the app, but Google did not accept it: ${syncError}`,
    };
  }

  return {
    ok: true as const,
    postedToGoogle,
    localOnly: review.is_practice || !postedToGoogle,
  };
}

export async function deleteReviewReply(formData: FormData) {
  const ctx = await requireReviewEditor();
  if ("error" in ctx) return fail(ctx.error);

  const reviewId = String(formData.get("reviewId") ?? "").trim();
  if (!reviewId) return fail("Missing review.");

  const review = await getReviewById(ctx.service, ctx.venueId, reviewId);
  if (!review) return fail("That review is no longer available.");

  let syncStatus: "local" | "posted" | "error" | null = null;
  let syncError: string | null = null;

  if (!review.is_practice && review.channel === "google" && review.reply_text) {
    const google = await postReplyToGoogle({
      service: ctx.service,
      venueId: ctx.venueId,
      externalId: review.external_id,
      comment: null,
    });
    if (google.posted) {
      syncStatus = null;
    } else if (google.error) {
      syncStatus = "error";
      syncError = google.error;
    }
  }

  if (syncError) {
    await updateReviewReply(ctx.service, ctx.venueId, reviewId, {
      reply_text: review.reply_text,
      reply_at: review.reply_at,
      status: review.status,
      reply_sync_status: "error",
      reply_sync_error: syncError,
    });
    return fail(`Google did not remove the reply: ${syncError}`);
  }

  await updateReviewReply(ctx.service, ctx.venueId, reviewId, {
    reply_text: null,
    reply_at: null,
    status: "read",
    reply_sync_status: syncStatus,
    reply_sync_error: null,
  });

  await writeAuditLog({
    actor_id: ctx.userId,
    action: "unreply",
    module_key: "sentiment",
    entity: "sentiment_reviews",
    entity_id: reviewId,
    venue_id: ctx.venueId,
    after: { is_practice: review.is_practice },
  });

  revalidateSentimentReviews();
  return { ok: true as const };
}

export async function saveReplyTemplate(formData: FormData) {
  const ctx = await requireTemplateEditor();
  if ("error" in ctx) return fail(ctx.error);

  const id = String(formData.get("templateId") ?? "").trim() || undefined;
  const name = String(formData.get("name") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!name) return fail("Give this template a name.");
  if (!body) return fail("Write the template reply first.");
  if (body.length > MAX_REVIEW_REPLY_LENGTH) {
    return fail(`Templates can be at most ${MAX_REVIEW_REPLY_LENGTH} characters.`);
  }

  const template = await upsertReplyTemplate(ctx.service, {
    id,
    venue_id: ctx.venueId,
    name,
    body,
  });

  await writeAuditLog({
    actor_id: ctx.userId,
    action: id ? "update" : "create",
    module_key: "sentiment",
    entity: "sentiment_reply_templates",
    entity_id: template.id,
    venue_id: ctx.venueId,
    after: { name },
  });

  revalidateSentimentReviews();
  return { ok: true as const, template };
}

export async function deleteReplyTemplate(formData: FormData) {
  const ctx = await requireTemplateEditor();
  if ("error" in ctx) return fail(ctx.error);

  const templateId = String(formData.get("templateId") ?? "").trim();
  if (!templateId) return fail("Missing template.");

  await deleteReplyTemplateRow(ctx.service, ctx.venueId, templateId);
  await writeAuditLog({
    actor_id: ctx.userId,
    action: "delete",
    module_key: "sentiment",
    entity: "sentiment_reply_templates",
    entity_id: templateId,
    venue_id: ctx.venueId,
  });
  revalidateSentimentReviews();
  return { ok: true as const };
}

const RECOVERY_TAG_IDS = new Set<string>(
  SENTIMENT_RECOVERY_TAGS.map((tag) => tag.id),
);

function parseActionStatus(raw: string): SentimentActionStatus | null {
  return SENTIMENT_ACTION_STATUSES.includes(raw as SentimentActionStatus)
    ? (raw as SentimentActionStatus)
    : null;
}

export async function saveReviewAction(formData: FormData) {
  const auth = await getActionAuthContext();
  if ("error" in auth) return fail(auth.error);

  const canEdit =
    canEditActions(auth.permissions, auth.venue.id) ||
    canEditReviews(auth.permissions, auth.venue.id);
  if (!canEdit) {
    return fail("You need Sentiment Actions edit access to save a follow-up.");
  }

  const reviewId = String(formData.get("reviewId") ?? "").trim();
  const status = parseActionStatus(String(formData.get("status") ?? "").trim());
  const hasDetails = formData.has("whatHappened") || formData.has("actionPlan");

  if (!reviewId) return fail("Missing review.");
  if (!status) return fail("Choose an action status.");

  const service = createServiceClient();
  const review = await getReviewById(service, auth.venue.id, reviewId);
  if (!review) return fail("That review is no longer available.");

  const existing = await getReviewAction(service, auth.venue.id, reviewId);
  const whatHappened = hasDetails
    ? String(formData.get("whatHappened") ?? "").trim() || null
    : (existing?.what_happened ?? null);
  const actionPlan = hasDetails
    ? String(formData.get("actionPlan") ?? "").trim() || null
    : (existing?.action_plan ?? null);
  const recoveryTags = hasDetails
    ? String(formData.get("recoveryTags") ?? "")
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => RECOVERY_TAG_IDS.has(tag))
    : (existing?.recovery_tags ?? []);

  const saved = await upsertReviewAction(service, {
    venue_id: auth.venue.id,
    review_id: reviewId,
    status,
    what_happened: whatHappened,
    action_plan: actionPlan,
    recovery_tags: recoveryTags,
    user_id: auth.user.id,
  });

  await writeAuditLog({
    actor_id: auth.user.id,
    action: "update",
    module_key: "sentiment",
    entity: "sentiment_review_actions",
    entity_id: reviewId,
    venue_id: auth.venue.id,
    after: { status, recovery_tags: recoveryTags },
  });

  revalidateSentimentReviews();
  return { ok: true as const, action: saved };
}

function userBelongsToVenue(user: UserListRow, venueId: string) {
  if (user.status === "disabled") return false;
  if (user.staff?.home_venue_id === venueId) return true;
  if (
    user.permissions.some(
      (permission) =>
        permission.venue_id === venueId || permission.venue_id === null,
    )
  ) {
    return true;
  }
  return user.moduleAccess.some(
    (access) =>
      access.enabled &&
      !access.suspended &&
      (access.venue_id === venueId || access.venue_id === null),
  );
}

function assigneeLabel(user: UserListRow) {
  return user.staff?.full_name?.trim() || user.full_name?.trim() || user.email;
}

export async function listJustificationAssignees() {
  const auth = await getActionAuthContext();
  if ("error" in auth) return fail(auth.error);

  const canEdit =
    canEditActions(auth.permissions, auth.venue.id) ||
    canEditReviews(auth.permissions, auth.venue.id);
  if (!canEdit) {
    return fail("You need Sentiment Actions edit access to request a report.");
  }

  const users = await listUsers(createServiceClient());
  const assignees: SentimentJustificationAssignee[] = users
    .filter(
      (user) =>
        user.id !== auth.user.id && userBelongsToVenue(user, auth.venue.id),
    )
    .map((user) => ({
      id: user.id,
      label: assigneeLabel(user),
      searchText: [
        user.email,
        user.staff?.emp_no,
        user.staff?.department?.name,
        user.staff?.position?.name,
      ]
        .filter(Boolean)
        .join(" "),
    }))
    .sort((left, right) => left.label.localeCompare(right.label));

  return { ok: true as const, assignees };
}

export async function requestReviewJustification(formData: FormData) {
  const auth = await getActionAuthContext();
  if ("error" in auth) return fail(auth.error);

  const canEdit =
    canEditActions(auth.permissions, auth.venue.id) ||
    canEditReviews(auth.permissions, auth.venue.id);
  if (!canEdit) {
    return fail("You need Sentiment Actions edit access to request a report.");
  }

  const reviewId = String(formData.get("reviewId") ?? "").trim();
  const assigneeId = String(formData.get("assigneeUserId") ?? "").trim();
  const status =
    parseActionStatus(String(formData.get("status") ?? "").trim()) ?? "open";

  if (!reviewId) return fail("Missing review.");
  if (!assigneeId) return fail("Choose an employee.");
  if (assigneeId === auth.user.id) {
    return fail("Choose another employee.");
  }

  const service = createServiceClient();
  const review = await getReviewById(service, auth.venue.id, reviewId);
  if (!review) return fail("That review is no longer available.");

  const users = await listUsers(service);
  const assignee = users.find((user) => user.id === assigneeId);
  if (!assignee || !userBelongsToVenue(assignee, auth.venue.id)) {
    return fail("That employee is not available for this venue.");
  }

  const existing = await getReviewAction(service, auth.venue.id, reviewId);
  const nextStatus =
    status === "not_required" || status === "resolved" ? "open" : status;
  const guest = review.author_name || "a guest";
  const assigneeName = assigneeLabel(assignee);

  await upsertReviewAction(service, {
    venue_id: auth.venue.id,
    review_id: reviewId,
    status: nextStatus,
    what_happened: existing?.what_happened ?? null,
    action_plan: existing?.action_plan ?? null,
    recovery_tags: existing?.recovery_tags ?? [],
    user_id: auth.user.id,
    justification_requested_user_id: assignee.id,
    justification_requested_name: assigneeName,
    justification_requested_by: auth.user.id,
    justification_requested_at: new Date().toISOString(),
    justification_submitted_at: null,
  });

  const requesterName =
    users.find((user) => user.id === auth.user.id)?.full_name?.trim() ||
    "A manager";

  const { error: notifyError } = await service.from("notifications").upsert(
    {
      user_id: assignee.id,
      venue_id: auth.venue.id,
      module_key: "sentiment",
      type: "review_justification_requested",
      title: "Guest review report requested",
      body: `${requesterName} asked you to explain what happened on ${guest}'s review.`,
      entity: "sentiment_review",
      entity_id: reviewId,
      severity: "warning",
      read_at: null,
      dedupe_key: `sentiment-justification:${auth.venue.id}:${reviewId}:${assignee.id}`,
    },
    { onConflict: "dedupe_key" },
  );
  if (notifyError) {
    console.error(
      "[sentiment] justification notify failed:",
      notifyError.message,
    );
  }

  await writeAuditLog({
    actor_id: auth.user.id,
    action: "update",
    module_key: "sentiment",
    entity: "sentiment_review_actions",
    entity_id: reviewId,
    venue_id: auth.venue.id,
    after: {
      justification_requested_user_id: assignee.id,
    },
  });

  revalidateSentimentReviews();
  revalidatePath(`/sentiment/justify/${reviewId}`, "page");
  return { ok: true as const, assigneeName };
}

export async function submitReviewJustification(formData: FormData) {
  const auth = await getActionAuthContext();
  if ("error" in auth) return fail(auth.error);

  const reviewId = String(formData.get("reviewId") ?? "").trim();
  const whatHappened = String(formData.get("whatHappened") ?? "").trim();
  if (!reviewId) return fail("Missing review.");
  if (!whatHappened) return fail("Write what actually happened.");

  const service = createServiceClient();
  const existing = await getReviewAction(service, auth.venue.id, reviewId);
  if (!existing) return fail("No report has been requested for this review.");

  const canEdit =
    canEditActions(auth.permissions, auth.venue.id) ||
    canEditReviews(auth.permissions, auth.venue.id);
  const isAssignee = existing.justification_requested_user_id === auth.user.id;
  if (!canEdit && !isAssignee) {
    return fail("This report was not assigned to you.");
  }

  const review = await getReviewById(service, auth.venue.id, reviewId);
  await upsertReviewAction(service, {
    venue_id: auth.venue.id,
    review_id: reviewId,
    status:
      existing.status === "not_required" ? "in_progress" : existing.status,
    what_happened: whatHappened,
    action_plan: existing.action_plan,
    recovery_tags: existing.recovery_tags,
    user_id: auth.user.id,
    justification_requested_user_id: existing.justification_requested_user_id,
    justification_requested_name: existing.justification_requested_name,
    justification_requested_by: existing.justification_requested_by,
    justification_requested_at: existing.justification_requested_at,
    justification_submitted_at: new Date().toISOString(),
  });

  if (existing.justification_requested_by) {
    const guest = review?.author_name || "a guest";
    const submitter =
      existing.justification_requested_name || "The assigned employee";
    await service.from("notifications").upsert(
      {
        user_id: existing.justification_requested_by,
        venue_id: auth.venue.id,
        module_key: "sentiment",
        type: "review_justification_submitted",
        title: "Guest review report submitted",
        body: `${submitter} submitted what happened on ${guest}'s review.`,
        entity: "sentiment_review",
        entity_id: reviewId,
        severity: "info",
        read_at: null,
        dedupe_key: `sentiment-justification-done:${auth.venue.id}:${reviewId}`,
      },
      { onConflict: "dedupe_key" },
    );
  }

  revalidateSentimentReviews();
  revalidatePath(`/sentiment/justify/${reviewId}`, "page");
  return { ok: true as const };
}
