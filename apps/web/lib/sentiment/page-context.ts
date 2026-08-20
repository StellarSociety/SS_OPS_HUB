import { redirect } from "next/navigation";
import { getRenderClient, getRenderUser, getRenderVenue } from "@/lib/auth/render-user";
import { createServiceClient } from "@/lib/supabase/service";
import { canEditActions, canEditReviews } from "./permissions";
import {
  ensurePracticeReview,
  ensureReplyTemplates,
  getReviewSource,
  listReplyTemplates,
  listReviewActions,
  listReviews,
} from "./store";
import type {
  SentimentChannel,
  SentimentReplyTemplate,
  SentimentReview,
  SentimentReviewAction,
} from "./types";

export async function getSentimentPageContext() {
  const supabase = await getRenderClient();
  const user = await getRenderUser();
  if (!user) redirect("/login");

  const venue = await getRenderVenue();
  if (!venue) redirect("/select-venue");

  const { data: permissions } = await supabase
    .from("user_permissions")
    .select("*")
    .eq("user_id", user.id);

  if (!venue.is_global) {
    const service = createServiceClient();
    await Promise.all([
      ensurePracticeReview(service, venue.id).catch(() => {
        // Practice seed is best-effort so a listing still loads.
      }),
      ensureReplyTemplates(service, venue.id).catch(() => {
        // Default templates are best-effort.
      }),
    ]);
  }

  return { supabase, venue, permissions: permissions ?? [], user };
}

export async function getSentimentReviewsPage(channel?: SentimentChannel) {
  const ctx = await getSentimentPageContext();
  const [reviews, source, templates, actions] = await Promise.all([
    listReviews(ctx.supabase, ctx.venue.id, channel).catch(
      () => [] as SentimentReview[],
    ),
    getReviewSource(ctx.supabase, ctx.venue.id, "google").catch(() => null),
    listReplyTemplates(ctx.supabase, ctx.venue.id).catch(
      () => [] as SentimentReplyTemplate[],
    ),
    listReviewActions(ctx.supabase, ctx.venue.id).catch(
      () => [] as SentimentReviewAction[],
    ),
  ]);

  const actionsByReviewId: Record<string, SentimentReviewAction> = {};
  for (const action of actions) {
    actionsByReviewId[action.review_id] = action;
  }

  return {
    reviews,
    templates,
    actionsByReviewId,
    venueName: ctx.venue.name,
    canEdit: canEditReviews(ctx.permissions, ctx.venue.id),
    canEditActions:
      canEditActions(ctx.permissions, ctx.venue.id) ||
      canEditReviews(ctx.permissions, ctx.venue.id),
    googleCanPost: Boolean(
      source?.connected_via_oauth &&
        source.external_account_id &&
        source.external_location_id,
    ),
  };
}
