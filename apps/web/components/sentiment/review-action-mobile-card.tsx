"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardPen } from "lucide-react";
import {
  GuestMark,
  GoogleMark,
  TripAdvisorMark,
} from "@/components/sentiment/channel-marks";
import { GoogleStars } from "@/components/sentiment/google-stars";
import { ReviewActionDialog } from "@/components/sentiment/review-action-dialog";
import { FieldFillState } from "@/components/sentiment/review-actions-table";
import { ReviewMessageDialog } from "@/components/sentiment/review-message-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  sentimentChannelLabel,
  sentimentGuestFallbackName,
} from "@/lib/sentiment/channels";
import {
  sentimentActionStatusMeta,
  type SentimentChannel,
  type SentimentReview,
  type SentimentReviewAction,
} from "@/lib/sentiment/types";
import { cn } from "@/lib/utils";

function formatReviewDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "2-digit",
    });
  } catch {
    return iso;
  }
}

function ChannelMark({ channel }: { channel: SentimentChannel }) {
  if (channel === "google") return <GoogleMark className="h-3 w-3 shrink-0" />;
  if (channel === "tripadvisor") {
    return <TripAdvisorMark className="h-3 w-3 shrink-0" />;
  }
  return <GuestMark className="h-3 w-3 shrink-0" />;
}

function Pipe() {
  return (
    <span className="shrink-0 text-black/20" aria-hidden>
      |
    </span>
  );
}

export function ReviewActionMobileCard({
  review,
  action,
  canEdit,
  currentUserId,
}: {
  review: SentimentReview;
  action: SentimentReviewAction | null;
  canEdit: boolean;
  currentUserId?: string;
}) {
  const router = useRouter();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [actionOpen, setActionOpen] = useState(false);
  const status = action?.status ?? "needed";
  const guestName =
    review.author_name || sentimentGuestFallbackName(review.channel);
  const needsFollowUp =
    typeof review.rating === "number" &&
    review.rating <= 3 &&
    (status === "needed" || status === "open" || status === "in_progress");
  const logged = Boolean(action?.what_happened || action?.action_plan);

  return (
    <Card
      className={cn(
        "p-3",
        needsFollowUp && "border-amber-200/80 bg-amber-50/50",
      )}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2">
        <button
          type="button"
          className="flex min-w-0 items-center gap-1.5 text-left text-[11px] leading-none text-[#3D421F]"
          onClick={() => setDetailsOpen(true)}
        >
          <span className="shrink-0 whitespace-nowrap tabular-nums text-black/60">
            {formatReviewDate(review.reviewed_at)}
          </span>
          <Pipe />
          <span
            className="inline-flex shrink-0 items-center"
            title={sentimentChannelLabel(review.channel)}
          >
            <ChannelMark channel={review.channel} />
          </span>
          <Pipe />
          <span className="min-w-0 flex-1 truncate font-medium">{guestName}</span>
        </button>
        <div className="flex h-7 items-center justify-center">
          <GoogleStars rating={review.rating} size="sm" className="shrink-0" />
        </div>

        <button
          type="button"
          className="flex h-7 min-w-0 items-center justify-center gap-1"
          onClick={() => setDetailsOpen(true)}
          aria-label="Open review details"
        >
          <span title="What happened" className="inline-flex h-7 items-center">
            <FieldFillState
              compact
              filled={Boolean(action?.what_happened?.trim())}
            />
          </span>
          <span title="Recovery" className="inline-flex h-7 items-center">
            <FieldFillState
              compact
              filled={(action?.recovery_tags ?? []).length > 0}
            />
          </span>
          <span title="Action taken" className="inline-flex h-7 items-center">
            <FieldFillState
              compact
              filled={Boolean(action?.action_plan?.trim())}
            />
          </span>
          <span
            className={cn(
              "inline-flex h-7 shrink-0 items-center whitespace-nowrap rounded-full px-1.5 text-[10px] font-medium uppercase leading-none tracking-wide",
              sentimentActionStatusMeta(status).className,
            )}
          >
            {sentimentActionStatusMeta(status).label}
          </span>
        </button>
        <Button
          type="button"
          size="sm"
          className="h-7 shrink-0 px-2 text-[10px] font-medium uppercase tracking-wide"
          variant={logged ? "ghost" : "default"}
          onClick={() => setActionOpen(true)}
        >
          <ClipboardPen className="h-3.5 w-3.5" />
          {canEdit ? (logged ? "Edit" : "Actions") : "View"}
        </Button>
      </div>

      <ReviewMessageDialog
        open={detailsOpen}
        review={review}
        onClose={() => setDetailsOpen(false)}
      />
      <ReviewActionDialog
        open={actionOpen}
        review={review}
        action={action}
        canEdit={canEdit}
        currentUserId={currentUserId}
        onClose={() => {
          setActionOpen(false);
          router.refresh();
        }}
        onSaved={() => router.refresh()}
      />
    </Card>
  );
}
