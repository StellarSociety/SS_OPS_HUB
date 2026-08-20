import type { SentimentLabel } from "./score-review";

export const SENTIMENT_MODULE_KEY = "sentiment" as const;

export const SENTIMENT_FEATURES = {
  overview: "overview",
  reviews: "reviews",
  actions: "actions",
  settings: "settings",
} as const;

export const SENTIMENT_CHANNELS = ["google", "tripadvisor"] as const;

export const MAX_REVIEW_REPLY_LENGTH = 4096;

export type SentimentChannel = (typeof SENTIMENT_CHANNELS)[number];

export type SentimentSourceStatus =
  | "disconnected"
  | "pending"
  | "connected"
  | "error";

export type SentimentReviewStatus = "new" | "read" | "replied" | "ignored";

export type SentimentReviewSource = {
  id: string;
  venue_id: string;
  channel: SentimentChannel;
  label: string;
  external_account_id: string | null;
  external_location_id: string | null;
  place_id: string | null;
  location_name: string | null;
  location_url: string | null;
  account_email: string | null;
  status: SentimentSourceStatus;
  last_synced_at: string | null;
  last_error: string | null;
  rating_average: number | null;
  review_count: number | null;
  connected_via_oauth: boolean;
  has_places_api_key: boolean;
  created_at: string;
  updated_at: string;
};

export type SentimentReview = {
  id: string;
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
  reply_text: string | null;
  reply_at: string | null;
  review_url: string | null;
  status: SentimentReviewStatus;
  is_practice: boolean;
  reply_sync_status: "local" | "posted" | "error" | null;
  reply_sync_error: string | null;
  author_profile_url: string | null;
  author_is_local_guide: boolean;
  author_review_count: number | null;
  photo_urls: string[];
  sentiment_label: SentimentLabel | null;
  sentiment_score: number | null;
  sentiment_topics: string[];
  sentiment_analyzed_at: string | null;
  imported_at: string;
  updated_at: string;
};

export const SENTIMENT_ACTION_STATUSES = [
  "open",
  "in_progress",
  "resolved",
  "not_required",
] as const;

export type SentimentActionStatus = (typeof SENTIMENT_ACTION_STATUSES)[number];

export const SENTIMENT_ACTION_STATUS_META: Record<
  SentimentActionStatus,
  { label: string; className: string; fieldClassName: string }
> = {
  open: {
    label: "Urgent",
    className: "bg-red-100 text-red-800",
    fieldClassName:
      "border-red-300 bg-red-100 text-red-800 focus:border-red-400 focus:ring-red-300/40",
  },
  in_progress: {
    label: "On Going",
    className: "bg-amber-100 text-amber-800",
    fieldClassName:
      "border-amber-300 bg-amber-100 text-amber-800 focus:border-amber-400 focus:ring-amber-300/40",
  },
  resolved: {
    label: "Resolved",
    className: "bg-emerald-100 text-emerald-800",
    fieldClassName:
      "border-emerald-300 bg-emerald-100 text-emerald-800 focus:border-emerald-400 focus:ring-emerald-300/40",
  },
  not_required: {
    label: "No action",
    className: "bg-black/[0.06] text-black/45",
    fieldClassName:
      "border-black/15 bg-black/[0.06] text-black/55 focus:border-black/25 focus:ring-black/10",
  },
};

export function sentimentActionStatusMeta(
  status: SentimentActionStatus | "needed",
) {
  if (status === "needed") return SENTIMENT_ACTION_STATUS_META.open;
  return SENTIMENT_ACTION_STATUS_META[status];
}

export const SENTIMENT_ACTION_STATUS_OPTIONS = SENTIMENT_ACTION_STATUSES.map(
  (id) => ({ id, label: SENTIMENT_ACTION_STATUS_META[id].label }),
);

export const SENTIMENT_RECOVERY_TAGS = [
  { id: "invite_back", label: "Invite guest back" },
  { id: "discount", label: "Offer discount" },
  { id: "complimentary", label: "Complimentary item" },
  { id: "staff_coaching", label: "Staff coaching" },
  { id: "kitchen", label: "Kitchen follow-up" },
] as const;

export type SentimentRecoveryTagId =
  (typeof SENTIMENT_RECOVERY_TAGS)[number]["id"];

export type SentimentReviewAction = {
  id: string;
  venue_id: string;
  review_id: string;
  status: SentimentActionStatus;
  what_happened: string | null;
  action_plan: string | null;
  recovery_tags: string[];
  justification_requested_user_id: string | null;
  justification_requested_name: string | null;
  justification_requested_by: string | null;
  justification_requested_at: string | null;
  justification_submitted_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type SentimentJustificationAssignee = {
  id: string;
  label: string;
  searchText: string;
};

export type SentimentReplyTemplate = {
  id: string;
  venue_id: string;
  name: string;
  body: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type GoogleBusinessLocation = {
  accountId: string;
  accountName: string;
  locationId: string;
  title: string;
  placeId: string | null;
  mapsUri: string | null;
};
