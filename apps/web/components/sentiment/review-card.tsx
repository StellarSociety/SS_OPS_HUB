"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, MessageSquare } from "lucide-react";
import { GoogleMark, TripAdvisorMark } from "@/components/sentiment/channel-marks";
import { GoogleStars } from "@/components/sentiment/google-stars";
import { ReviewPhotoStrip } from "@/components/sentiment/review-photo-gallery";
import { ReviewReplyDialog } from "@/components/sentiment/review-reply-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { SentimentChannel, SentimentReplyTemplate, SentimentReview } from "@/lib/sentiment/types";

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

function ChannelBadge({ channel }: { channel: SentimentChannel }) {
  if (channel === "google") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-black/[0.04] px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-black/55">
        <GoogleMark className="h-3 w-3" />
        Google
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-black/[0.04] px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-black/55">
      <TripAdvisorMark className="h-3 w-3" />
      TripAdvisor
    </span>
  );
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
        title="Open Local Guide profile"
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
}: {
  review: SentimentReview;
  canEdit: boolean;
  googleCanPost: boolean;
  venueName: string;
  templates: SentimentReplyTemplate[];
}) {
  const router = useRouter();
  const [replyOpen, setReplyOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const sync = syncLabel(review);
  const photos = review.photo_urls ?? [];
  const guestName = review.author_name || "Google user";

  const localGuideLine = [
    review.author_is_local_guide ? "Local Guide" : null,
    review.author_review_count
      ? `${review.author_review_count} reviews`
      : null,
    formatReviewDate(review.reviewed_at),
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
            <p className="text-xs text-black/45">{localGuideLine}</p>
          </div>
        </div>
        <ChannelBadge channel={review.channel} />
      </div>

      <div className="mt-3">
        <GoogleStars rating={review.rating} />
        {review.comment ? (
          <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-black/70">
            {review.comment}
          </p>
        ) : (
          <p className="mt-1.5 text-sm italic text-black/40">No written comment.</p>
        )}
      </div>

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

      {canEdit ? (
        <Button
          type="button"
          className={
            review.reply_text ? "mt-3 h-9 text-[#3D421F]" : "mt-3 h-9"
          }
          variant={review.reply_text ? "ghost" : "default"}
          onClick={() => setReplyOpen(true)}
        >
          <MessageSquare className="h-4 w-4" />
          {review.reply_text ? "Edit reply" : "Reply"}
        </Button>
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
      {profileOpen ? (
        <PracticeProfileDialog
          review={review}
          onClose={() => setProfileOpen(false)}
        />
      ) : null}
    </Card>
  );
}
