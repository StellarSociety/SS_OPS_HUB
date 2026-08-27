"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardPen } from "lucide-react";
import { ReviewActionDialog } from "@/components/sentiment/review-action-dialog";
import { ReviewMessageDialog } from "@/components/sentiment/review-message-dialog";
import { GoogleStars } from "@/components/sentiment/google-stars";
import { Button } from "@/components/ui/button";
import type {
  SentimentReview,
  SentimentReviewAction,
} from "@/lib/sentiment/types";
import { sentimentActionStatusMeta } from "@/lib/sentiment/types";
import { cn } from "@/lib/utils";

function formatReviewDate(iso: string | null): string {
  if (!iso) return "—";
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

function GuestCell({ review }: { review: SentimentReview }) {
  const name = review.author_name || "Google user";
  const initial = name.slice(0, 1).toUpperCase();
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      {review.author_photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={review.author_photo_url}
          alt=""
          referrerPolicy="no-referrer"
          className="h-8 w-8 shrink-0 rounded-full object-cover"
        />
      ) : (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--venue-primary)]/15 text-xs font-medium text-[#3D421F]">
          {initial}
        </div>
      )}
      <div className="min-w-0">
        <p className="truncate font-medium text-[#3D421F]">{name}</p>
        {review.is_practice ? (
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[#3D421F]/70">
            Practice
          </span>
        ) : null}
      </div>
    </div>
  );
}

function FieldFillState({ filled }: { filled: boolean }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide",
        filled
          ? "bg-[var(--venue-primary)]/15 text-[#3D421F]"
          : "bg-black/[0.04] text-black/40",
      )}
    >
      {filled ? "Logged" : "Empty"}
    </span>
  );
}

function ActionRow({
  review,
  action,
  canEdit,
  currentUserId,
}: {
  review: SentimentReview;
  action: SentimentReviewAction | null;
  canEdit: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);
  const photos = review.photo_urls ?? [];
  const status = action?.status ?? "needed";
  const needsFollowUp =
    typeof review.rating === "number" &&
    review.rating <= 3 &&
    (status === "needed" || status === "open" || status === "in_progress");

  return (
    <tr
      className={cn(
        "border-b border-black/5 hover:bg-[var(--venue-secondary)]/30",
        needsFollowUp && "bg-amber-50/50",
      )}
    >
      <td className="whitespace-nowrap px-3 py-4 text-xs tabular-nums text-black/60">
        {formatReviewDate(review.reviewed_at)}
      </td>
      <td className="whitespace-nowrap px-3 py-4 text-xs text-black/55">
        {review.channel === "google"
          ? "Google"
          : review.channel === "tripadvisor"
            ? "TripAdvisor"
            : "Guest"}
      </td>
      <td className="px-3 py-4">
        <GuestCell review={review} />
      </td>
      <td className="px-3 py-4">
        <GoogleStars rating={review.rating} size="sm" />
      </td>
      <td className="max-w-[18rem] px-3 py-4">
        <button
          type="button"
          className="w-full text-left"
          onClick={() => setMessageOpen(true)}
        >
          <p className="line-clamp-2 text-sm leading-snug text-black/70 hover:text-[#3D421F]">
            {review.comment || (
              <span className="italic text-black/35">No written comment.</span>
            )}
          </p>
          {photos.length > 0 ? (
            <p className="mt-1 text-[11px] text-black/40">
              {photos.length} {photos.length === 1 ? "photo" : "photos"}
            </p>
          ) : null}
        </button>
      </td>
      <td
        className="cursor-pointer whitespace-nowrap px-3 py-4 text-center"
        onClick={() => setOpen(true)}
      >
        <FieldFillState filled={Boolean(action?.what_happened?.trim())} />
      </td>
      <td
        className="cursor-pointer whitespace-nowrap px-3 py-4 text-center"
        onClick={() => setOpen(true)}
      >
        <FieldFillState filled={(action?.recovery_tags ?? []).length > 0} />
      </td>
      <td
        className="cursor-pointer whitespace-nowrap px-3 py-4 text-center"
        onClick={() => setOpen(true)}
      >
        <FieldFillState filled={Boolean(action?.action_plan?.trim())} />
      </td>
      <td className="whitespace-nowrap px-3 py-4 text-center">
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide",
            sentimentActionStatusMeta(status).className,
          )}
        >
          {sentimentActionStatusMeta(status).label}
        </span>
      </td>
      <td className="px-3 py-4 text-center">
        <Button
          type="button"
          size="sm"
          className="h-8"
          variant={action?.what_happened || action?.action_plan ? "ghost" : "default"}
          onClick={() => setOpen(true)}
        >
          <ClipboardPen className="h-3.5 w-3.5" />
          {canEdit
            ? action?.what_happened || action?.action_plan
              ? "Edit"
              : "Log action"
            : "View"}
        </Button>
        <ReviewActionDialog
          open={open}
          review={review}
          action={action}
          canEdit={canEdit}
          currentUserId={currentUserId}
          onClose={() => setOpen(false)}
          onSaved={() => router.refresh()}
        />
        <ReviewMessageDialog
          open={messageOpen}
          review={review}
          onClose={() => setMessageOpen(false)}
        />
      </td>
    </tr>
  );
}

export function ReviewActionsTable({
  rows,
  canEdit,
  currentUserId,
}: {
  rows: { review: SentimentReview; action: SentimentReviewAction | null }[];
  canEdit: boolean;
  currentUserId: string;
}) {
  const awaiting = rows.filter((row) => !row.review.reply_text?.trim());
  const replied = rows.filter((row) => Boolean(row.review.reply_text?.trim()));

  return (
    <div className="overflow-hidden rounded-xl border border-black/10 bg-white/70 shadow-sm backdrop-blur-xl">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[56rem] text-left text-sm">
          <thead className="border-b border-black/10 bg-black/[0.03] text-[11px] font-semibold uppercase tracking-wide text-black/45">
            <tr>
              <th className="px-3 py-3">Date</th>
              <th className="px-3 py-3">Channel</th>
              <th className="px-3 py-3">Guest</th>
              <th className="px-3 py-3">Rating</th>
              <th className="px-3 py-3">Review</th>
              <th className="px-3 py-3 text-center">What happened</th>
              <th className="px-3 py-3 text-center">Recovery</th>
              <th className="px-3 py-3 text-center">Action taken</th>
              <th className="px-3 py-3 text-center">Status</th>
              <th className="px-3 py-3 text-center">Log</th>
            </tr>
          </thead>
          <tbody>
            {awaiting.length > 0 ? (
              <>
                <SectionRow label="Awaiting reply" count={awaiting.length} />
                {awaiting.map(({ review, action }) => (
                  <ActionRow
                    key={review.id}
                    review={review}
                    action={action}
                    canEdit={canEdit}
                    currentUserId={currentUserId}
                  />
                ))}
              </>
            ) : null}
            {replied.length > 0 ? (
              <>
                <SectionRow label="Reply sent" count={replied.length} />
                {replied.map(({ review, action }) => (
                  <ActionRow
                    key={review.id}
                    review={review}
                    action={action}
                    canEdit={canEdit}
                    currentUserId={currentUserId}
                  />
                ))}
              </>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SectionRow({ label, count }: { label: string; count: number }) {
  return (
    <tr>
      <td
        colSpan={10}
        className="border-y border-black/10 bg-[var(--venue-secondary,#F0F3DD)]/80 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-black/50"
      >
        {label}
        <span className="ml-2 tabular-nums font-medium text-black/35">
          {count}
        </span>
      </td>
    </tr>
  );
}
