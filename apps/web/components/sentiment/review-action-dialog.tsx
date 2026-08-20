"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { GoogleStars } from "@/components/sentiment/google-stars";
import { Button } from "@/components/ui/button";
import { LiquidGlassPanel, LiquidGlassScrim } from "@/components/ui/liquid-glass";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import {
  listJustificationAssignees,
  requestReviewJustification,
  saveReviewAction,
  submitReviewJustification,
} from "@/lib/actions/sentiment-reviews";
import {
  SENTIMENT_ACTION_STATUS_META,
  SENTIMENT_ACTION_STATUS_OPTIONS,
  SENTIMENT_RECOVERY_TAGS,
  sentimentActionStatusMeta,
  type SentimentActionStatus,
  type SentimentJustificationAssignee,
  type SentimentReview,
  type SentimentReviewAction,
} from "@/lib/sentiment/types";
import { cn } from "@/lib/utils";

function defaultStatus(review: SentimentReview, action: SentimentReviewAction | null) {
  if (action?.status) return action.status;
  if (typeof review.rating === "number" && review.rating <= 3) return "open";
  return "not_required";
}

export function ReviewActionDialog({
  open,
  review,
  action,
  canEdit,
  currentUserId,
  onClose,
  onSaved,
}: {
  open: boolean;
  review: SentimentReview;
  action: SentimentReviewAction | null;
  canEdit: boolean;
  currentUserId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<SentimentActionStatus>(
    defaultStatus(review, action),
  );
  const [whatHappened, setWhatHappened] = useState(action?.what_happened ?? "");
  const [actionPlan, setActionPlan] = useState(action?.action_plan ?? "");
  const [tags, setTags] = useState<string[]>(action?.recovery_tags ?? []);
  const [assignees, setAssignees] = useState<SentimentJustificationAssignee[]>(
    [],
  );
  const [assigneeId, setAssigneeId] = useState(
    action?.justification_requested_user_id ?? "",
  );

  const isAssignee =
    Boolean(currentUserId) &&
    action?.justification_requested_user_id === currentUserId;
  const canWriteReport = canEdit || isAssignee;
  const requestPending =
    Boolean(action?.justification_requested_user_id) &&
    !action?.justification_submitted_at;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setStatus(defaultStatus(review, action));
    setWhatHappened(action?.what_happened ?? "");
    setActionPlan(action?.action_plan ?? "");
    setTags(action?.recovery_tags ?? []);
    setAssigneeId(action?.justification_requested_user_id ?? "");
  }, [open, action, review]);

  useEffect(() => {
    if (!open || !canEdit) return;
    let cancelled = false;
    void listJustificationAssignees().then((result) => {
      if (cancelled || !result.ok) return;
      setAssignees(result.assignees);
    });
    return () => {
      cancelled = true;
    };
  }, [open, canEdit]);

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

  function toggleTag(id: string) {
    setTags((current) =>
      current.includes(id)
        ? current.filter((tag) => tag !== id)
        : [...current, id],
    );
  }

  function runRequest() {
    const formData = new FormData();
    formData.set("reviewId", review.id);
    formData.set("assigneeUserId", assigneeId);
    formData.set("status", status);
    startTransition(async () => {
      const result = await requestReviewJustification(formData);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.saved(`Report requested from ${result.assigneeName}.`);
      onSaved();
    });
  }

  function runSubmitReport() {
    const formData = new FormData();
    formData.set("reviewId", review.id);
    formData.set("whatHappened", whatHappened);
    startTransition(async () => {
      const result = await submitReviewJustification(formData);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.saved("Report submitted.");
      onSaved();
      onClose();
    });
  }

  function runSave() {
    const formData = new FormData();
    formData.set("reviewId", review.id);
    formData.set("status", status);
    formData.set("whatHappened", whatHappened);
    formData.set("actionPlan", actionPlan);
    formData.set("recoveryTags", tags.join(","));
    startTransition(async () => {
      const result = await saveReviewAction(formData);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.saved("Action saved.");
      onSaved();
      onClose();
    });
  }

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4">
      <LiquidGlassScrim onClose={onClose} />
      <LiquidGlassPanel
        labelledBy="review-action-title"
        className="flex max-h-[min(92vh,720px)] w-full max-w-2xl flex-col rounded-2xl"
      >
        <div className="relative flex items-start justify-between gap-3 border-b border-white/35 px-5 py-4">
          <div>
            <h2
              id="review-action-title"
              className="font-serif text-xl text-[#3D421F]"
            >
              Log action
              {isAssignee && !canEdit ? " — your report" : ""}
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

          {canEdit ? (
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-black/40">
            Status
            <select
              className={cn(
                "mt-1 flex h-9 w-full rounded-md border px-2 text-sm font-medium outline-none backdrop-blur-md focus:ring-2 disabled:opacity-50",
                sentimentActionStatusMeta(status).fieldClassName,
              )}
              value={status}
              disabled={!canEdit || pending}
              onChange={(event) =>
                setStatus(event.target.value as SentimentActionStatus)
              }
            >
              {SENTIMENT_ACTION_STATUS_OPTIONS.map((option) => (
                <option
                  key={option.id}
                  value={option.id}
                  className={SENTIMENT_ACTION_STATUS_META[option.id].className}
                >
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          ) : null}

          <label className="block text-[11px] font-semibold uppercase tracking-wide text-black/40">
            What actually happened
            <Textarea
              className="mt-1 min-h-[88px] border-white/50 bg-white/45 backdrop-blur-md focus-visible:ring-offset-0"
              value={whatHappened}
              disabled={!canWriteReport || pending}
              placeholder={
                isAssignee
                  ? "Explain what happened on this shift…"
                  : requestPending
                    ? `Waiting for ${action?.justification_requested_name ?? "the employee"}'s report…`
                    : "Manager report: shift, table, what went wrong…"
              }
              onChange={(event) => setWhatHappened(event.target.value)}
            />
          </label>

          {canEdit ? (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-black/40">
                Request from employee
              </p>
              <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center">
                <SearchableSelect
                  className="min-w-0 flex-1"
                  value={assigneeId}
                  onChange={setAssigneeId}
                  options={assignees.map((person) => ({
                    value: person.id,
                    label: person.label,
                    searchText: person.searchText,
                  }))}
                  placeholder="Select an employee"
                  searchPlaceholder="Search staff…"
                  disabled={pending}
                />
                <Button
                  type="button"
                  size="sm"
                  className="h-10 shrink-0"
                  disabled={pending || !assigneeId}
                  onClick={runRequest}
                >
                  Request report
                </Button>
              </div>
              {action?.justification_requested_user_id ? (
                <p className="mt-1.5 text-xs text-black/50">
                  {action.justification_submitted_at
                    ? `Submitted by ${action.justification_requested_name ?? "the employee"}.`
                    : `Notification sent to ${action.justification_requested_name ?? "the employee"}. They can submit from the bell.`}
                </p>
              ) : (
                <p className="mt-1.5 text-xs text-black/40">
                  They’ll get a notification to write this report.
                </p>
              )}
            </div>
          ) : isAssignee && requestPending ? (
            <p className="text-xs text-black/50">
              A manager asked you to submit this report.
            </p>
          ) : null}

          {canEdit ? (
            <>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-black/40">
                  Recovery
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {SENTIMENT_RECOVERY_TAGS.map((tag) => {
                    const active = tags.includes(tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        disabled={pending}
                        onClick={() => toggleTag(tag.id)}
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-[11px] font-medium backdrop-blur-md",
                          active
                            ? "border-[var(--venue-primary)]/40 bg-[var(--venue-primary)]/20 text-[#3D421F]"
                            : "border-white/50 bg-white/35 text-black/55 hover:bg-white/50",
                        )}
                      >
                        {tag.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <label className="block text-[11px] font-semibold uppercase tracking-wide text-black/40">
                Action taken
                <Textarea
                  className="mt-1 min-h-[88px] border-white/50 bg-white/45 backdrop-blur-md focus-visible:ring-offset-0"
                  value={actionPlan}
                  disabled={pending}
                  placeholder="Invite back, discount offered, who you spoke to…"
                  onChange={(event) => setActionPlan(event.target.value)}
                />
              </label>
            </>
          ) : null}
        </div>

        <div className="relative flex items-center justify-end gap-2 border-t border-white/35 bg-white/20 px-5 py-3">
          <Button
            type="button"
            variant="ghost"
            className="text-[#3D421F] hover:bg-white/40"
            disabled={pending}
            onClick={onClose}
          >
            Cancel
          </Button>
          {canEdit ? (
            <Button type="button" disabled={pending} onClick={runSave}>
              Save action
            </Button>
          ) : isAssignee ? (
            <Button
              type="button"
              disabled={pending || !whatHappened.trim()}
              onClick={runSubmitReport}
            >
              Submit report
            </Button>
          ) : null}
        </div>
      </LiquidGlassPanel>
    </div>,
    document.body,
  );
}
