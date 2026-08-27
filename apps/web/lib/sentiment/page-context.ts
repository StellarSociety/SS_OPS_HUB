import { redirect } from "next/navigation";
import { getRenderClient, getRenderUser, getRenderVenue } from "@/lib/auth/render-user";
import { createServiceClient } from "@/lib/supabase/service";
import { canEditActions, canEditReviews } from "./permissions";
import {
  resolveReviewPeriod,
  type ReviewPeriodSearchParams,
} from "./review-period";
import {
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
    await ensureReplyTemplates(service, venue.id).catch(() => {
      // Default templates are best-effort.
    });
  }

  return { supabase, venue, permissions: permissions ?? [], user };
}

export async function getSentimentReviewsPage(
  channel?: SentimentChannel,
  searchParams?: ReviewPeriodSearchParams,
) {
  const ctx = await getSentimentPageContext();
  const period = resolveReviewPeriod(searchParams);
  const range =
    period.fromDate && period.toDate
      ? { fromDate: period.fromDate, toDate: period.toDate }
      : null;
  const [reviews, source, templates, actions] = await Promise.all([
    listReviews(ctx.supabase, ctx.venue.id, channel, range).catch(
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
    period,
    templates,
    actionsByReviewId,
    venueName: ctx.venue.name,
    venueId: ctx.venue.id,
    permissions: ctx.permissions,
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
