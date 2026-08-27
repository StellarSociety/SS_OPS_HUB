"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { ReviewCard } from "@/components/sentiment/review-card";
import { ScopedLink } from "@/components/layout/scoped-link";
import { LiquidGlassPanel, LiquidGlassScrim } from "@/components/ui/liquid-glass";
import type {
  SentimentReplyTemplate,
  SentimentReview,
  SentimentReviewAction,
} from "@/lib/sentiment/types";

export function DashboardReviewsDialog({
  open,
  title,
  description,
  empty,
  footerHref,
  footerLabel,
  reviews,
  actionsByReviewId,
  canEdit,
  canEditActions,
  googleCanPost,
  venueName,
  templates,
  compactAction,
  onClose,
}: {
  open: boolean;
  title: string;
  description: string;
  empty: string;
  footerHref: string;
  footerLabel: string;
  reviews: SentimentReview[];
  actionsByReviewId: Record<string, SentimentReviewAction>;
  canEdit: boolean;
  canEditActions: boolean;
  googleCanPost: boolean;
  venueName: string;
  templates: SentimentReplyTemplate[];
  compactAction: boolean;
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

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <LiquidGlassScrim onClose={onClose} />
      <LiquidGlassPanel
        labelledBy="dashboard-reviews-dialog-title"
        className="flex max-h-[min(92vh,880px)] w-full max-w-3xl flex-col rounded-2xl"
      >
        <div className="relative flex items-start justify-between gap-3 border-b border-white/35 px-5 py-4">
          <div>
            <h2
              id="dashboard-reviews-dialog-title"
              className="font-serif text-xl text-[#3D421F]"
            >
              {title}
            </h2>
            <p className="mt-0.5 text-sm text-black/50">{description}</p>
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
        <div className="relative min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {reviews.length === 0 ? (
            <p className="py-8 text-center text-sm text-black/50">{empty}</p>
          ) : (
            reviews.map((review) => (
              <ReviewCard
                key={review.id}
                review={review}
                canEdit={canEdit}
                googleCanPost={googleCanPost}
                venueName={venueName}
                templates={templates}
                action={actionsByReviewId[review.id] ?? null}
                canEditActions={canEditActions}
                compactAction={compactAction}
              />
            ))
          )}
        </div>
        <div className="relative border-t border-white/35 px-5 py-3">
          <ScopedLink
            href={footerHref}
            className="text-sm font-medium text-[var(--venue-primary,#818a40)] hover:underline"
          >
            {footerLabel}
          </ScopedLink>
        </div>
      </LiquidGlassPanel>
    </div>,
    document.body,
  );
}
