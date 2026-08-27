"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, ClipboardList, ExternalLink, MessageSquare } from "lucide-react";
import { GoogleMark, GuestMark, TripAdvisorMark } from "@/components/sentiment/channel-marks";
import { GoogleStars } from "@/components/sentiment/google-stars";
import { ReviewActionDialog } from "@/components/sentiment/review-action-dialog";
import { ReviewPhotoStrip } from "@/components/sentiment/review-photo-gallery";
import { ReviewReplyDialog } from "@/components/sentiment/review-reply-dialog";
import { SentimentBadge } from "@/components/sentiment/sentiment-badge";
import { AnimatedSymbol } from "@/components/ui/animated-symbol";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  SENTIMENT_ACTION_STATUS_META,
  type SentimentChannel,
  type SentimentReplyTemplate,
  type SentimentReview,
  type SentimentReviewAction,
} from "@/lib/sentiment/types";
import { sentimentGuestFallbackName } from "@/lib/sentiment/channels";

function formatReviewDate(iso: string | null): string {
  if (!iso) return "Date unknown";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatReviewTime(iso: string | null): string | null {
  if (!iso) return null;
  const posted = new Date(iso);
  if (Number.isNaN(posted.getTime())) return null;
  return posted.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function calendarDaysAgo(iso: string | null): number | null {
  if (!iso) return null;
  const posted = new Date(iso);
  if (Number.isNaN(posted.getTime())) return null;
  const now = new Date();
  const startToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const startPosted = new Date(
    posted.getFullYear(),
    posted.getMonth(),
    posted.getDate(),
  ).getTime();
  return Math.round((startToday - startPosted) / 86_400_000);
}

function relativePostedLabel(days: number | null): string | null {
  if (days == null || days < 0) return null;
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "Last week";
  return null;
}

function PostedDateBadge({ iso }: { iso: string | null }) {
  const date = formatReviewDate(iso);
  const time = formatReviewTime(iso);
  const days = calendarDaysAgo(iso);
  const relative = relativePostedLabel(days);
  const recent = days != null && days <= 7;
  const parts = [relative, date, time].filter(Boolean);
  const when = time ? `${date} · ${time}` : date;

  return (
    <span
      className={
        recent
          ? "inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-full bg-[var(--venue-primary)]/18 px-2.5 py-1 text-[11px] font-medium tabular-nums text-[#3D421F]"
          : "inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-full bg-[var(--venue-secondary,#F0F3DD)] px-2.5 py-1 text-[11px] font-medium tabular-nums text-[#3D421F]"
      }
      title={relative ? `Posted ${relative} · ${when}` : `Posted ${when}`}
    >
      <Calendar className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
      {parts.join(" · ")}
    </span>
  );
}

function ChannelBadge({ channel }: { channel: SentimentChannel }) {
  if (channel === "google") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-black/[0.04] px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-black/55">
        <GoogleMark className="h-3 w-3" />
        Google
      </span>
    );
  }
  if (channel === "tripadvisor") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-black/[0.04] px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-black/55">
        <TripAdvisorMark className="h-3 w-3" />
        TripAdvisor
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-black/[0.04] px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-black/55">
      <GuestMark className="h-3 w-3" />
      Guest
    </span>
  );
}

function extraRatingAnswers(raw: Record<string, unknown> | null) {
  const answers = raw?.answers;
  if (!Array.isArray(answers)) return [];
  return answers.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (row.type !== "rating" || row.key === "overall_rating") return [];
    if (typeof row.value !== "number") return [];
    return [
      {
        label: String(row.label ?? row.key),
        rating: row.value,
      },
    ];
  });
}

function syncLabel(review: SentimentReview): string | null {
  if (review.is_practice && review.reply_text) return "Saved in app only";
  if (review.reply_sync_status === "posted") return "Posted to Google";
  if (review.reply_sync_status === "error") {
    return review.reply_sync_error || "Google did not accept this reply";
  }
  if (review.reply_sync_status === "local" && review.reply_text) {
    return "Saved in the app";
  }
  return null;
}

function GuestAvatar({
  review,
  onPracticeProfile,
}: {
  review: SentimentReview;
  onPracticeProfile: () => void;
}) {
  const photo = review.author_photo_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={review.author_photo_url}
      alt=""
      referrerPolicy="no-referrer"
      className="h-11 w-11 rounded-full object-cover"
    />
  ) : (
    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--venue-primary)]/15 text-sm font-medium text-[#3D421F]">
      {(review.author_name ?? "?").slice(0, 1).toUpperCase()}
    </div>
  );

  const className =
    "shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#818a40]";

  if (review.author_profile_url) {
    return (
      <a
        href={review.author_profile_url}
        target="_blank"
        rel="noreferrer"
        className={className}
        title={
          review.channel === "tripadvisor"
            ? "Open TripAdvisor profile"
            : "Open Local Guide profile"
        }
      >
        {photo}
      </a>
    );
  }

  if (review.is_practice) {
    return (
      <button
        type="button"
        className={className}
        onClick={onPracticeProfile}
        title="Practice Local Guide profile"
      >
        {photo}
      </button>
    );
  }

  return photo;
}

function PracticeProfileDialog({
  review,
  onClose,
}: {
  review: SentimentReview;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="practice-profile-title"
        className="relative z-10 w-full max-w-sm rounded-xl border border-black/10 bg-white p-5 shadow-xl"
      >
        <div className="flex items-center gap-3">
          {review.author_photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={review.author_photo_url}
              alt=""
              referrerPolicy="no-referrer"
              className="h-14 w-14 rounded-full object-cover"
            />
          ) : null}
          <div>
            <h2
              id="practice-profile-title"
              className="font-medium text-[#3D421F]"
            >
              {review.author_name || "Google user"}
            </h2>
            <p className="text-sm text-black/55">Local Guide</p>
          </div>
        </div>
        <p className="mt-3 text-sm text-black/60">
          {review.author_review_count ?? 0} reviews
          {review.photo_urls.length > 0
            ? ` · ${review.photo_urls.length} photos`
            : ""}
        </p>
        <p className="mt-2 text-xs text-black/45">
          Practice guest — this is not a live Google Local Guide account.
        </p>
        <Button type="button" className="mt-4 w-full" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}

export function ReviewCard({
  review,
  canEdit,
  googleCanPost,
  venueName,
  templates,
  action = null,
  canEditActions = false,
  compactAction = false,
}: {
  review: SentimentReview;
  canEdit: boolean;
  googleCanPost: boolean;
  venueName: string;
  templates: SentimentReplyTemplate[];
  action?: SentimentReviewAction | null;
  canEditActions?: boolean;
  /** Put a follow-up symbol next to Reply instead of a separate actions card. */
  compactAction?: boolean;
}) {
  const router = useRouter();
  const [replyOpen, setReplyOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [actionOpen, setActionOpen] = useState(false);
  const sync = syncLabel(review);
  const photos = review.photo_urls ?? [];
  const guestName =
    review.author_name || sentimentGuestFallbackName(review.channel);
  const actionStatus =
    action && action.status !== "not_required" ? action.status : null;
  const actionMeta = actionStatus
    ? SENTIMENT_ACTION_STATUS_META[actionStatus]
    : null;
  const showAction = compactAction && (canEditActions || actionMeta);

  const localGuideLine = [
    review.author_is_local_guide ? "Local Guide" : null,
    review.author_review_count
      ? `${review.author_review_count} reviews`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <GuestAvatar
            review={review}
            onPracticeProfile={() => setProfileOpen(true)}
          />
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 font-medium text-[#3D421F]">
              {review.author_profile_url ? (
                <a
                  href={review.author_profile_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 truncate hover:underline"
                >
                  {guestName}
                  <ExternalLink className="h-3 w-3 shrink-0 text-black/35" />
                </a>
              ) : review.is_practice ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 truncate hover:underline"
                  onClick={() => setProfileOpen(true)}
                >
                  {guestName}
                  <ExternalLink className="h-3 w-3 shrink-0 text-black/35" />
                </button>
              ) : (
                <span className="truncate">{guestName}</span>
              )}
              {review.is_practice ? (
                <span className="rounded-full bg-[var(--venue-secondary,#F0F3DD)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#3D421F]">
                  Practice
                </span>
              ) : null}
            </p>
            {localGuideLine ? (
              <p className="text-xs text-black/45">{localGuideLine}</p>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <ChannelBadge channel={review.channel} />
          <PostedDateBadge iso={review.reviewed_at} />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <GoogleStars rating={review.rating} />
        <SentimentBadge
          label={review.sentiment_label}
          score={review.sentiment_score}
        />
      </div>
      {review.channel === "guest"
        ? extraRatingAnswers(review.raw).map((item) => (
            <div
              key={item.label}
              className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-black/55"
            >
              <span className="w-20 shrink-0">{item.label}</span>
              <GoogleStars rating={item.rating} size="sm" />
            </div>
          ))
        : null}
      {review.comment ? (
        <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-black/70">
          {review.comment}
        </p>
      ) : (
        <p className="mt-1.5 text-sm italic text-black/40">No written comment.</p>
      )}

      <ReviewPhotoStrip photos={photos} altPrefix={`${guestName} review`} />

      {review.reply_text ? (
        <div className="mt-3 rounded-lg bg-[var(--venue-primary)]/8 px-3 py-2 text-sm text-black/65">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-black/40">
            Owner reply
            {sync ? ` · ${sync}` : ""}
          </p>
          <p className="mt-1 whitespace-pre-wrap">{review.reply_text}</p>
        </div>
      ) : null}

      {canEdit || showAction ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {canEdit ? (
            <Button
              type="button"
              className={review.reply_text ? "h-9 text-[#3D421F]" : "h-9"}
              variant={review.reply_text ? "ghost" : "default"}
              onClick={() => setReplyOpen(true)}
            >
              <MessageSquare className="h-4 w-4" />
              {review.reply_text ? "Edit reply" : "Reply"}
            </Button>
          ) : null}
          {showAction ? (
            <>
              <button
                type="button"
                disabled={!canEditActions}
                onClick={() => setActionOpen(true)}
                title={actionMeta ? `Action · ${actionMeta.label}` : "Start action"}
                aria-label={
                  actionMeta ? `Action: ${actionMeta.label}` : "Start action"
                }
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-black/10 bg-white text-[#3D421F] transition-colors hover:bg-[var(--venue-secondary)]/40 disabled:pointer-events-none disabled:opacity-50"
              >
                <AnimatedSymbol>
                  <ClipboardList className="h-4 w-4" aria-hidden />
                </AnimatedSymbol>
              </button>
              {actionMeta ? (
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${actionMeta.className}`}
                >
                  {actionMeta.label}
                </span>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      <ReviewReplyDialog
        open={replyOpen}
        review={review}
        templates={templates}
        venueName={venueName}
        googleCanPost={googleCanPost}
        onClose={() => setReplyOpen(false)}
        onSaved={() => router.refresh()}
      />
      {compactAction ? (
        <ReviewActionDialog
          open={actionOpen}
          review={review}
          action={action}
          canEdit={canEditActions}
          onClose={() => {
            setActionOpen(false);
            router.refresh();
          }}
          onSaved={() => router.refresh()}
        />
      ) : null}
      {profileOpen ? (
        <PracticeProfileDialog
          review={review}
          onClose={() => setProfileOpen(false)}
        />
      ) : null}
    </Card>
  );
}
