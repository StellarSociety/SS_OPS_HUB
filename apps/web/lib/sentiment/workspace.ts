import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { canEditActions, canEditReviews } from "./permissions";
import {
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
import type { UserPermission } from "@/lib/role-permissions";

export type StaffMentionRow = {
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
};

export type SentimentWorkspace = {
  reviews: SentimentReview[];
  actions: SentimentReviewAction[];
  templates: SentimentReplyTemplate[];
  actionsByReviewId: Record<string, SentimentReviewAction>;
  googleCanPost: boolean;
};

export async function loadStaffMentionRows(venue: {
  id: string;
  is_global: boolean;
}): Promise<StaffMentionRow[]> {
  if (venue.is_global) return [];
  try {
    const { data } = await createServiceClient()
      .from("staff")
      .select("first_name, last_name, full_name")
      .eq("home_venue_id", venue.id);
    return data ?? [];
  } catch {
    return [];
  }
}

export async function loadSentimentWorkspace(
  supabase: SupabaseClient,
  venueId: string,
  options?: {
    channel?: SentimentChannel;
    range?: { fromDate: string; toDate: string } | null;
  },
): Promise<SentimentWorkspace> {
  const [reviews, actions, templates, source] = await Promise.all([
    listReviews(
      supabase,
      venueId,
      options?.channel,
      options?.range,
    ).catch(() => [] as SentimentReview[]),
    listReviewActions(supabase, venueId).catch(
      () => [] as SentimentReviewAction[],
    ),
    listReplyTemplates(supabase, venueId).catch(
      () => [] as SentimentReplyTemplate[],
    ),
    getReviewSource(supabase, venueId, "google").catch(() => null),
  ]);

  const actionsByReviewId: Record<string, SentimentReviewAction> = {};
  for (const action of actions) {
    actionsByReviewId[action.review_id] = action;
  }

  return {
    reviews,
    actions,
    templates,
    actionsByReviewId,
    googleCanPost: Boolean(
      source?.connected_via_oauth &&
        source.external_account_id &&
        source.external_location_id,
    ),
  };
}

export function sentimentEditFlags(
  permissions: UserPermission[],
  venueId: string,
) {
  const canEdit = canEditReviews(permissions, venueId);
  return {
    canEdit,
    canEditActions: canEditActions(permissions, venueId) || canEdit,
  };
}
