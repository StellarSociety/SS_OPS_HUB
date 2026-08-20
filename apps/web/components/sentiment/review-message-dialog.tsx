"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { GoogleStars } from "@/components/sentiment/google-stars";
import { ReviewPhotoStrip } from "@/components/sentiment/review-photo-gallery";
import { LiquidGlassPanel, LiquidGlassScrim } from "@/components/ui/liquid-glass";
import type { SentimentReview } from "@/lib/sentiment/types";

function formatReviewDate(iso: string | null): string {
  if (!iso) return "";
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

export function ReviewMessageDialog({
  open,
  review,
  onClose,
}: {
  open: boolean;
  review: SentimentReview;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  const guestName = review.author_name || "Google user";
  const photos = review.photo_urls ?? [];
  const date = formatReviewDate(review.reviewed_at);
  const channel = review.channel === "google" ? "Google" : "TripAdvisor";

  return createPortal(
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4">
      <LiquidGlassScrim onClose={onClose} />
      <LiquidGlassPanel
        labelledBy="review-message-title"
        className="flex max-h-[min(92vh,760px)] w-full max-w-2xl flex-col rounded-2xl"
      >
        <div className="relative flex items-start justify-between gap-3 border-b border-white/35 px-5 py-4">
          <div className="min-w-0">
            <h2
              id="review-message-title"
              className="font-serif text-xl text-[#3D421F]"
            >
              Guest review
            </h2>
            <p className="mt-0.5 text-sm text-black/50">
              {[guestName, channel, date].filter(Boolean).join(" · ")}
            </p>
          </div>
          <button
            type="button"
            className="rounded-md p-1 text-black/45 hover:bg-white/40 hover:text-[#3D421F]"
            aria-label="Close"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="relative min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <GoogleStars rating={review.rating} />
          {review.comment ? (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-black/75">
              {review.comment}
            </p>
          ) : (
            <p className="text-sm italic text-black/40">No written comment.</p>
          )}

          {photos.length > 0 ? (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-black/40">
                Attachments
                <span className="ml-1 font-medium normal-case tracking-normal text-black/35">
                  {photos.length} {photos.length === 1 ? "photo" : "photos"}
                </span>
              </p>
              <ReviewPhotoStrip photos={photos} altPrefix={`${guestName} review`} />
            </div>
          ) : (
            <p className="text-xs italic text-black/35">No photos attached.</p>
          )}
        </div>
      </LiquidGlassPanel>
    </div>,
    document.body,
  );
}
