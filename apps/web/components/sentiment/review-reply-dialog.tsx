"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { GoogleStars } from "@/components/sentiment/google-stars";
import { Button } from "@/components/ui/button";
import { LiquidGlassPanel, LiquidGlassScrim } from "@/components/ui/liquid-glass";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { ScopedLink } from "@/components/layout/scoped-link";
import {
  deleteReviewReply,
  saveReviewReply,
} from "@/lib/actions/sentiment-reviews";
import { applyReplyTemplate } from "@/lib/sentiment/reply-templates";
import type { SentimentReplyTemplate, SentimentReview } from "@/lib/sentiment/types";
import { MAX_REVIEW_REPLY_LENGTH } from "@/lib/sentiment/types";
import { cn } from "@/lib/utils";

function replyHint(review: SentimentReview, googleCanPost: boolean): string {
  if (review.is_practice) {
    return "Practice review — replies stay in the app and are not sent to Google.";
  }
  if (review.channel === "tripadvisor") {
    return "TripAdvisor replies stay in the app. They are not posted back to TripAdvisor.";
  }
  if (review.channel === "guest") {
    return "Guest feedback replies stay in the app. They are not sent to the guest.";
  }
  if (googleCanPost) {
    return "This reply will be posted on your Google Business Profile.";
  }
  return "Saved in the app for now. Connect Google Business Profile in Settings to post live.";
}

export function ReviewReplyDialog({
  open,
  review,
  templates,
  venueName,
  googleCanPost,
  onClose,
  onSaved,
}: {
  open: boolean;
  review: SentimentReview;
  templates: SentimentReplyTemplate[];
  venueName: string;
  googleCanPost: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [reply, setReply] = useState(review.reply_text ?? "");
  const [pending, startTransition] = useTransition();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setReply(review.reply_text ?? "");
  }, [open, review.id, review.reply_text]);

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

  const remaining = MAX_REVIEW_REPLY_LENGTH - reply.length;

  function applyTemplate(template: SentimentReplyTemplate) {
    setReply(applyReplyTemplate(template.body, review, venueName));
  }

  function runSave() {
    const formData = new FormData();
    formData.set("reviewId", review.id);
    formData.set("reply", reply);
    startTransition(async () => {
      const result = await saveReviewReply(formData);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if ("warning" in result && result.warning) {
        toast.alert(result.warning);
      } else if (result.postedToGoogle) {
        toast.saved("Reply posted to Google.");
      } else {
        toast.saved(
          review.is_practice
            ? "Practice reply saved in the app."
            : "Reply saved in the app.",
        );
      }
      onSaved();
      onClose();
    });
  }

  function runDelete() {
    const formData = new FormData();
    formData.set("reviewId", review.id);
    startTransition(async () => {
      const result = await deleteReviewReply(formData);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setReply("");
      toast.saved("Reply removed.");
      onSaved();
      onClose();
    });
  }

  return createPortal(
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4">
      <LiquidGlassScrim onClose={onClose} />
      <LiquidGlassPanel
        labelledBy="review-reply-title"
        className="flex max-h-[min(92vh,720px)] w-full max-w-2xl flex-col rounded-2xl"
      >
        <div className="relative flex items-start justify-between gap-3 border-b border-white/35 px-5 py-4">
          <div>
            <h2
              id="review-reply-title"
              className="font-serif text-xl text-[#3D421F]"
            >
              {review.reply_text ? "Edit reply" : "Reply to review"}
            </h2>
            <p className="mt-0.5 text-sm text-black/50">
              {review.author_name || "Google user"}
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
          <div className="rounded-xl border border-white/40 bg-white/30 px-3 py-2 backdrop-blur-md">
            <GoogleStars rating={review.rating} size="sm" />
            <p className="mt-1 line-clamp-3 text-sm text-black/65">
              {review.comment || "No written comment."}
            </p>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-black/40">
              Templates
            </p>
            <p className="mt-1 text-xs text-black/45">
              Insert a starting reply, then edit it. Manage wording in{" "}
              <ScopedLink
                href="/sentiment/settings/templates"
                className="font-medium text-[#3D421F] underline-offset-2 hover:underline"
              >
                Settings → Reply templates
              </ScopedLink>
              .
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {templates.length === 0 ? (
                <p className="text-xs text-black/40">No templates yet.</p>
              ) : (
                templates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    disabled={pending}
                    onClick={() => applyTemplate(template)}
                    className="rounded-full border border-white/50 bg-white/35 px-3 py-1 text-xs font-medium text-[#3D421F] backdrop-blur-md hover:border-[var(--venue-primary)]/40 hover:bg-[var(--venue-primary)]/18"
                  >
                    {template.name}
                  </button>
                ))
              )}
            </div>
          </div>

          <div>
            <label
              htmlFor={`reply-dialog-${review.id}`}
              className="text-[11px] font-semibold uppercase tracking-wide text-black/40"
            >
              Your reply
            </label>
            <Textarea
              id={`reply-dialog-${review.id}`}
              value={reply}
              onChange={(event) => setReply(event.target.value)}
              maxLength={MAX_REVIEW_REPLY_LENGTH}
              disabled={pending}
              placeholder="Thank you for dining with us…"
              className="mt-1 min-h-[140px] border-white/50 bg-white/45 backdrop-blur-md focus-visible:ring-offset-0"
            />
            <div className="mt-1 flex items-center justify-between gap-2">
              <p className="text-xs text-black/45">
                {replyHint(review, googleCanPost)}
              </p>
              <p className="shrink-0 text-xs text-black/35">{remaining} left</p>
            </div>
          </div>
        </div>

        <div className="relative flex flex-wrap items-center justify-between gap-2 border-t border-white/35 bg-white/20 px-5 py-3">
          {review.reply_text ? (
            <button
              type="button"
              disabled={pending}
              onClick={runDelete}
              className={cn(
                "text-sm text-black/45 hover:text-[#3D421F]",
                pending && "opacity-50",
              )}
            >
              Remove reply
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              className="text-[#3D421F] hover:bg-white/40"
              disabled={pending}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={pending || !reply.trim()}
              onClick={runSave}
            >
              {review.reply_text ? "Update reply" : "Post reply"}
            </Button>
          </div>
        </div>
      </LiquidGlassPanel>
    </div>,
    document.body,
  );
}
