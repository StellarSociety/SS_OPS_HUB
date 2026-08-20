import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  SentimentActionStatus,
  SentimentChannel,
  SentimentReplyTemplate,
  SentimentReview,
  SentimentReviewAction,
  SentimentReviewSource,
  SentimentSourceStatus,
} from "./types";
import { DEFAULT_REPLY_TEMPLATES } from "./reply-templates";

type Client = SupabaseClient;

export const PRACTICE_REVIEW_EXTERNAL_ID = "practice:local-sample";
export const PRACTICE_NEGATIVE_EXTERNAL_ID = "practice:local-negative";
export const PRACTICE_AVATAR_URL = "/sentiment/practice/layla.webp";
export const PRACTICE_PHOTO_URLS = [
  "/sentiment/practice/terrace.webp",
  "/sentiment/practice/mezze.webp",
  "/sentiment/practice/dining.webp",
];

const REVIEW_COLUMNS =
  "id, venue_id, source_id, channel, external_id, author_name, author_photo_url, rating, comment, reviewed_at, language, reply_text, reply_at, review_url, status, is_practice, reply_sync_status, reply_sync_error, author_profile_url, author_is_local_guide, author_review_count, photo_urls, imported_at, updated_at";

const SOURCE_PUBLIC_COLUMNS = [
  "id",
  "venue_id",
  "channel",
  "label",
  "external_account_id",
  "external_location_id",
  "place_id",
  "location_name",
  "location_url",
  "account_email",
  "status",
  "last_synced_at",
  "last_error",
  "rating_average",
  "review_count",
  "connected_via_oauth",
  "has_places_api_key",
  "created_at",
  "updated_at",
].join(", ");

export async function listReviewSources(
  client: Client,
  venueId: string,
): Promise<SentimentReviewSource[]> {
  const { data, error } = await client
    .from("sentiment_review_sources")
    .select(SOURCE_PUBLIC_COLUMNS)
    .eq("venue_id", venueId)
    .order("channel");
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as SentimentReviewSource[];
}

export async function getReviewSource(
  client: Client,
  venueId: string,
  channel: SentimentChannel,
): Promise<SentimentReviewSource | null> {
  const { data, error } = await client
    .from("sentiment_review_sources")
    .select(SOURCE_PUBLIC_COLUMNS)
    .eq("venue_id", venueId)
    .eq("channel", channel)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as SentimentReviewSource | null) ?? null;
}

export async function listReviews(
  client: Client,
  venueId: string,
  channel?: SentimentChannel,
): Promise<SentimentReview[]> {
  let query = client
    .from("sentiment_reviews")
    .select(REVIEW_COLUMNS)
    .eq("venue_id", venueId)
    .order("reviewed_at", { ascending: false, nullsFirst: false });

  if (channel) query = query.eq("channel", channel);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as SentimentReview[];
}

export async function upsertReviewSource(
  client: Client,
  values: {
    venue_id: string;
    channel: SentimentChannel;
    label?: string;
    external_account_id?: string | null;
    external_location_id?: string | null;
    place_id?: string | null;
    location_name?: string | null;
    location_url?: string | null;
    account_email?: string | null;
    refresh_token_encrypted?: string | null;
    access_token_encrypted?: string | null;
    access_token_expires_at?: string | null;
    connected_via_oauth?: boolean;
    places_api_key_encrypted?: string | null;
    has_places_api_key?: boolean;
    status?: SentimentSourceStatus;
    last_synced_at?: string | null;
    last_error?: string | null;
    rating_average?: number | null;
    review_count?: number | null;
  },
): Promise<SentimentReviewSource> {
  const { data, error } = await client
    .from("sentiment_review_sources")
    .upsert(values, { onConflict: "venue_id,channel" })
    .select(SOURCE_PUBLIC_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as SentimentReviewSource;
}

export async function updateReviewSource(
  client: Client,
  id: string,
  values: Record<string, unknown>,
): Promise<void> {
  const { error } = await client
    .from("sentiment_review_sources")
    .update(values)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function getSourceSecrets(
  client: Client,
  venueId: string,
  channel: SentimentChannel,
): Promise<{
  id: string;
  refresh_token_encrypted: string | null;
  access_token_encrypted: string | null;
  access_token_expires_at: string | null;
  places_api_key_encrypted: string | null;
  external_account_id: string | null;
  external_location_id: string | null;
  place_id: string | null;
} | null> {
  const { data, error } = await client
    .from("sentiment_review_sources")
    .select(
      "id, refresh_token_encrypted, access_token_encrypted, access_token_expires_at, places_api_key_encrypted, external_account_id, external_location_id, place_id",
    )
    .eq("venue_id", venueId)
    .eq("channel", channel)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as {
    id: string;
    refresh_token_encrypted: string | null;
    access_token_encrypted: string | null;
    access_token_expires_at: string | null;
    places_api_key_encrypted: string | null;
    external_account_id: string | null;
    external_location_id: string | null;
    place_id: string | null;
  } | null;
}

export type ReviewUpsertInput = {
  venue_id: string;
  source_id: string;
  channel: SentimentChannel;
  external_id: string;
  author_name: string | null;
  author_photo_url: string | null;
  rating: number | null;
  comment: string | null;
  reviewed_at: string | null;
  language: string | null;
  reply_text?: string | null;
  reply_at?: string | null;
  review_url: string | null;
  raw: Record<string, unknown> | null;
  is_practice?: boolean;
  author_profile_url?: string | null;
  author_is_local_guide?: boolean;
  author_review_count?: number | null;
  photo_urls?: string[];
};

export async function getReviewById(
  client: Client,
  venueId: string,
  reviewId: string,
): Promise<SentimentReview | null> {
  const { data, error } = await client
    .from("sentiment_reviews")
    .select(REVIEW_COLUMNS)
    .eq("venue_id", venueId)
    .eq("id", reviewId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as SentimentReview | null) ?? null;
}

export async function updateReviewReply(
  client: Client,
  venueId: string,
  reviewId: string,
  values: {
    reply_text: string | null;
    reply_at: string | null;
    status: SentimentReview["status"];
    reply_sync_status: SentimentReview["reply_sync_status"];
    reply_sync_error: string | null;
  },
): Promise<void> {
  const { error } = await client
    .from("sentiment_reviews")
    .update(values)
    .eq("venue_id", venueId)
    .eq("id", reviewId);
  if (error) throw new Error(error.message);
}

export async function ensurePracticeReview(
  client: Client,
  venueId: string,
): Promise<void> {
  const existingSource = await getReviewSource(client, venueId, "google");
  const source =
    existingSource ??
    (await upsertReviewSource(client, {
      venue_id: venueId,
      channel: "google",
      label: "Google",
    }));

  const { data: existing, error: lookupError } = await client
    .from("sentiment_reviews")
    .select("id")
    .eq("source_id", source.id)
    .eq("external_id", PRACTICE_REVIEW_EXTERNAL_ID)
    .maybeSingle();
  if (lookupError) throw new Error(lookupError.message);

  const practiceFields = {
    author_name: "Layla M.",
    author_photo_url: PRACTICE_AVATAR_URL,
    author_profile_url: null as string | null,
    author_is_local_guide: true,
    author_review_count: 47,
    photo_urls: PRACTICE_PHOTO_URLS,
    rating: 4,
    comment:
      "Beautiful evening on the terrace. Sunset over JVT was a highlight, and the kitchen sent out a generous mezze to start. Service was warm though we waited a little for mains. Would happily come back for another dinner.",
    language: "en",
    is_practice: true,
    raw: { practice: true },
  };

  if (existing) {
    const { error } = await client
      .from("sentiment_reviews")
      .update(practiceFields)
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else {
    const reviewedAt = new Date();
    reviewedAt.setUTCDate(reviewedAt.getUTCDate() - 3);
    const { error } = await client.from("sentiment_reviews").insert({
      venue_id: venueId,
      source_id: source.id,
      channel: "google",
      external_id: PRACTICE_REVIEW_EXTERNAL_ID,
      reviewed_at: reviewedAt.toISOString(),
      status: "new",
      ...practiceFields,
    });
    if (error) throw new Error(error.message);
  }

  await ensureNegativePracticeReview(client, venueId, source.id);
}

async function ensureNegativePracticeReview(
  client: Client,
  venueId: string,
  sourceId: string,
): Promise<void> {
  const { data: existing, error: lookupError } = await client
    .from("sentiment_reviews")
    .select("id")
    .eq("source_id", sourceId)
    .eq("external_id", PRACTICE_NEGATIVE_EXTERNAL_ID)
    .maybeSingle();
  if (lookupError) throw new Error(lookupError.message);

  const fields = {
    author_name: "Omar K.",
    author_photo_url: null as string | null,
    author_profile_url: null as string | null,
    author_is_local_guide: false,
    author_review_count: 3,
    photo_urls: [] as string[],
    rating: 2,
    comment:
      "We waited over 40 minutes for mains and the sea bass arrived lukewarm. When we asked, the server seemed rushed and didn't offer much help. Disappointing for the price.",
    language: "en",
    is_practice: true,
    raw: { practice: true, scenario: "negative" },
  };

  if (existing) {
    const { error } = await client
      .from("sentiment_reviews")
      .update(fields)
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
    return;
  }

  const reviewedAt = new Date();
  reviewedAt.setUTCDate(reviewedAt.getUTCDate() - 1);
  const { error } = await client.from("sentiment_reviews").insert({
    venue_id: venueId,
    source_id: sourceId,
    channel: "google",
    external_id: PRACTICE_NEGATIVE_EXTERNAL_ID,
    reviewed_at: reviewedAt.toISOString(),
    status: "new",
    ...fields,
  });
  if (error) throw new Error(error.message);
}

export async function listReplyTemplates(
  client: Client,
  venueId: string,
): Promise<SentimentReplyTemplate[]> {
  const { data, error } = await client
    .from("sentiment_reply_templates")
    .select("id, venue_id, name, body, sort_order, created_at, updated_at")
    .eq("venue_id", venueId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as SentimentReplyTemplate[];
}

export async function ensureReplyTemplates(
  client: Client,
  venueId: string,
): Promise<void> {
  const existing = await listReplyTemplates(client, venueId);
  if (existing.length > 0) return;
  const { error } = await client.from("sentiment_reply_templates").insert(
    DEFAULT_REPLY_TEMPLATES.map((template) => ({
      venue_id: venueId,
      name: template.name,
      body: template.body,
      sort_order: template.sort_order,
    })),
  );
  if (error) throw new Error(error.message);
}

export async function upsertReplyTemplate(
  client: Client,
  values: {
    id?: string;
    venue_id: string;
    name: string;
    body: string;
    sort_order?: number;
  },
): Promise<SentimentReplyTemplate> {
  if (values.id) {
    const { data, error } = await client
      .from("sentiment_reply_templates")
      .update({
        name: values.name,
        body: values.body,
        sort_order: values.sort_order,
      })
      .eq("id", values.id)
      .eq("venue_id", values.venue_id)
      .select("id, venue_id, name, body, sort_order, created_at, updated_at")
      .single();
    if (error) throw new Error(error.message);
    return data as SentimentReplyTemplate;
  }

  const { data, error } = await client
    .from("sentiment_reply_templates")
    .insert({
      venue_id: values.venue_id,
      name: values.name,
      body: values.body,
      sort_order: values.sort_order ?? 10,
    })
    .select("id, venue_id, name, body, sort_order, created_at, updated_at")
    .single();
  if (error) throw new Error(error.message);
  return data as SentimentReplyTemplate;
}

export async function deleteReplyTemplate(
  client: Client,
  venueId: string,
  templateId: string,
): Promise<void> {
  const { error } = await client
    .from("sentiment_reply_templates")
    .delete()
    .eq("venue_id", venueId)
    .eq("id", templateId);
  if (error) throw new Error(error.message);
}

const ACTION_COLUMNS =
  "id, venue_id, review_id, status, what_happened, action_plan, recovery_tags, justification_requested_user_id, justification_requested_name, justification_requested_by, justification_requested_at, justification_submitted_at, created_by, updated_by, created_at, updated_at";

export async function listReviewActions(
  client: Client,
  venueId: string,
): Promise<SentimentReviewAction[]> {
  const { data, error } = await client
    .from("sentiment_review_actions")
    .select(ACTION_COLUMNS)
    .eq("venue_id", venueId)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as SentimentReviewAction[];
}

export async function getReviewAction(
  client: Client,
  venueId: string,
  reviewId: string,
): Promise<SentimentReviewAction | null> {
  const { data, error } = await client
    .from("sentiment_review_actions")
    .select(ACTION_COLUMNS)
    .eq("venue_id", venueId)
    .eq("review_id", reviewId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as SentimentReviewAction | null) ?? null;
}

export async function upsertReviewAction(
  client: Client,
  values: {
    venue_id: string;
    review_id: string;
    status: SentimentActionStatus;
    what_happened: string | null;
    action_plan: string | null;
    recovery_tags: string[];
    user_id: string;
    justification_requested_user_id?: string | null;
    justification_requested_name?: string | null;
    justification_requested_by?: string | null;
    justification_requested_at?: string | null;
    justification_submitted_at?: string | null;
  },
): Promise<SentimentReviewAction> {
  const existing = await getReviewAction(
    client,
    values.venue_id,
    values.review_id,
  );
  const payload: Record<string, unknown> = {
    status: values.status,
    what_happened: values.what_happened,
    action_plan: values.action_plan,
    recovery_tags: values.recovery_tags,
    updated_by: values.user_id,
  };

  if ("justification_requested_user_id" in values) {
    payload.justification_requested_user_id =
      values.justification_requested_user_id ?? null;
    payload.justification_requested_name =
      values.justification_requested_name ?? null;
    payload.justification_requested_by =
      values.justification_requested_by ?? null;
    payload.justification_requested_at =
      values.justification_requested_at ?? null;
    payload.justification_submitted_at =
      values.justification_submitted_at ?? null;
  }

  if (existing) {
    const { data, error } = await client
      .from("sentiment_review_actions")
      .update(payload)
      .eq("id", existing.id)
      .select(ACTION_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    return data as SentimentReviewAction;
  }

  const { data, error } = await client
    .from("sentiment_review_actions")
    .insert({
      venue_id: values.venue_id,
      review_id: values.review_id,
      created_by: values.user_id,
      ...payload,
    })
    .select(ACTION_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return data as SentimentReviewAction;
}

export async function upsertReviews(
  client: Client,
  reviews: ReviewUpsertInput[],
): Promise<number> {
  if (reviews.length === 0) return 0;
  const { error, data } = await client
    .from("sentiment_reviews")
    .upsert(reviews, { onConflict: "source_id,external_id" })
    .select("id");
  if (error) throw new Error(error.message);
  return data?.length ?? reviews.length;
}
