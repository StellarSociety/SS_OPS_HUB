"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ScopedLink } from "@/components/layout/scoped-link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { saveReviewAction } from "@/lib/actions/sentiment-reviews";
import { SENTIMENT_ACTION_STATUS_OPTIONS } from "@/lib/sentiment/types";
import type {
  SentimentActionStatus,
  SentimentReview,
  SentimentReviewAction,
} from "@/lib/sentiment/types";
import { SENTIMENT_RECOVERY_TAGS } from "@/lib/sentiment/types";
import { cn } from "@/lib/utils";

const SELECT_CLASS =
  "flex h-9 w-full rounded-md border border-black/10 bg-white px-2 text-sm text-[#3D421F] outline-none focus:border-[var(--venue-primary)]/50 focus:ring-2 focus:ring-[var(--venue-primary)]/20 disabled:opacity-50";

const INLINE_SELECT_CLASS =
  "h-8 w-full min-w-[7.5rem] rounded-md border border-black/10 bg-white px-2 text-xs text-[#3D421F] outline-none focus:border-[var(--venue-primary)]/50 focus:ring-2 focus:ring-[var(--venue-primary)]/20 disabled:opacity-50";

type TriggerValue = "none" | "follow_up";

function defaultStatus(review: SentimentReview): SentimentActionStatus {
  if (typeof review.rating === "number" && review.rating <= 3) return "open";
  return "not_required";
}

function triggerFromStatus(status: SentimentActionStatus): TriggerValue {
  return status === "not_required" ? "none" : "follow_up";
}

export function ReviewActionsPanel({
  review,
  action,
  canEdit,
  mode = "full",
}: {
  review: SentimentReview;
  action: SentimentReviewAction | null;
  canEdit: boolean;
  /** Reviews: trigger + status only. Actions page: full recovery log. */
  mode?: "trigger" | "full";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<SentimentActionStatus>(
    action?.status ?? defaultStatus(review),
  );
  const [whatHappened, setWhatHappened] = useState(action?.what_happened ?? "");
  const [actionPlan, setActionPlan] = useState(action?.action_plan ?? "");
  const [tags, setTags] = useState<string[]>(action?.recovery_tags ?? []);

  useEffect(() => {
    setStatus(action?.status ?? defaultStatus(review));
    setWhatHappened(action?.what_happened ?? "");
    setActionPlan(action?.action_plan ?? "");
    setTags(action?.recovery_tags ?? []);
  }, [action, review.id, review.rating]);

  const needsFollowUp =
    typeof review.rating === "number" && review.rating <= 3;
  const openLike = status === "open" || status === "in_progress";
  const trigger = triggerFromStatus(status);
  const hasFollowUp = Boolean(action) && action.status !== "not_required";

  function toggleTag(id: string) {
    setTags((current) =>
      current.includes(id)
        ? current.filter((tag) => tag !== id)
        : [...current, id],
    );
  }

  function setTrigger(next: TriggerValue) {
    if (next === "none") {
      setStatus("not_required");
      return;
    }
    if (status === "not_required") setStatus("open");
  }

  function runSave() {
    const formData = new FormData();
    formData.set("reviewId", review.id);
    formData.set("status", status);
    if (mode === "full") {
      formData.set("whatHappened", whatHappened);
      formData.set("actionPlan", actionPlan);
      formData.set("recoveryTags", tags.join(","));
    }
    startTransition(async () => {
      const result = await saveReviewAction(formData);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.saved(
        mode === "trigger" && trigger === "follow_up" && !hasFollowUp
          ? "Follow-up started."
          : "Action saved.",
      );
      router.refresh();
    });
  }

  return (
    <Card
      className={cn(
        "flex h-full flex-col p-4",
        needsFollowUp && openLike && !action
          ? "border-[var(--venue-primary)]/35"
          : "",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-black/40">
            Actions
          </p>
          <p className="mt-0.5 text-xs text-black/50">
            {mode === "trigger"
              ? "Trigger a follow-up. Details are completed on Actions."
              : needsFollowUp
                ? "Log what happened and how you recovered this guest."
                : "Optional follow-up if something still needs handling."}
          </p>
        </div>
        {needsFollowUp && (!action || openLike) ? (
          <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
            Needs follow-up
          </span>
        ) : null}
      </div>

      {mode === "trigger" ? (
        <label className="mt-3 text-[11px] font-medium text-black/45">
          Action
          <select
            className={cn("mt-1", SELECT_CLASS)}
            value={trigger}
            disabled={!canEdit || pending}
            onChange={(event) =>
              setTrigger(event.target.value as TriggerValue)
            }
          >
            <option value="none">No action</option>
            <option value="follow_up">Follow up</option>
          </select>
        </label>
      ) : null}

      <label className="mt-3 text-[11px] font-medium text-black/45">
        Status
        <select
          className={cn("mt-1", SELECT_CLASS)}
          value={status}
          disabled={!canEdit || pending || (mode === "trigger" && trigger === "none")}
          onChange={(event) =>
            setStatus(event.target.value as SentimentActionStatus)
          }
        >
          {(mode === "trigger"
            ? trigger === "none"
              ? SENTIMENT_ACTION_STATUS_OPTIONS.filter((option) => option.id === "not_required")
              : SENTIMENT_ACTION_STATUS_OPTIONS.filter((option) => option.id !== "not_required")
            : SENTIMENT_ACTION_STATUS_OPTIONS
          ).map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {mode === "full" ? (
        <>
          <label className="mt-3 text-[11px] font-medium text-black/45">
            What actually happened
            <Textarea
              className="mt-1 min-h-[72px]"
              value={whatHappened}
              disabled={!canEdit || pending}
              placeholder="Manager report: shift, table, what went wrong…"
              onChange={(event) => setWhatHappened(event.target.value)}
            />
          </label>

          <p className="mt-3 text-[11px] font-medium text-black/45">Recovery</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {SENTIMENT_RECOVERY_TAGS.map((tag) => {
              const active = tags.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  disabled={!canEdit || pending}
                  onClick={() => toggleTag(tag.id)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px] font-medium",
                    active
                      ? "border-[var(--venue-primary)]/40 bg-[var(--venue-primary)]/15 text-[#3D421F]"
                      : "border-black/10 bg-white text-black/55 hover:bg-black/[0.03]",
                  )}
                >
                  {tag.label}
                </button>
              );
            })}
          </div>

          <label className="mt-3 text-[11px] font-medium text-black/45">
            Action taken
            <Textarea
              className="mt-1 min-h-[72px]"
              value={actionPlan}
              disabled={!canEdit || pending}
              placeholder="Invite back, discount offered, who you spoke to…"
              onChange={(event) => setActionPlan(event.target.value)}
            />
          </label>
        </>
      ) : null}

      {canEdit ? (
        <Button
          type="button"
          className="mt-4"
          disabled={pending}
          onClick={runSave}
        >
          {mode === "trigger" && trigger === "follow_up" && !hasFollowUp
            ? "Start action"
            : "Save"}
        </Button>
      ) : (
        <p className="mt-3 text-xs text-black/40">View only</p>
      )}

      {mode === "trigger" ? (
        <ScopedLink
          href="/sentiment/actions"
          className="mt-3 text-xs font-medium text-[#3D421F] hover:underline"
        >
          Open Actions
        </ScopedLink>
      ) : null}
    </Card>
  );
}

/** Compact Action + Status cells for the reviews table. Saves on change. */
export function ReviewActionTableCells({
  review,
  action,
  canEdit,
}: {
  review: SentimentReview;
  action: SentimentReviewAction | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<SentimentActionStatus>(
    action?.status ?? defaultStatus(review),
  );

  useEffect(() => {
    setStatus(action?.status ?? defaultStatus(review));
  }, [action, review.id, review.rating]);

  const trigger = triggerFromStatus(status);

  function persist(next: SentimentActionStatus) {
    setStatus(next);
    const formData = new FormData();
    formData.set("reviewId", review.id);
    formData.set("status", next);
    startTransition(async () => {
      const result = await saveReviewAction(formData);
      if (!result.ok) {
        toast.error(result.error);
        setStatus(action?.status ?? defaultStatus(review));
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      <td className="px-3 py-2.5 align-middle">
        <select
          aria-label="Action"
          className={INLINE_SELECT_CLASS}
          value={trigger}
          disabled={!canEdit || pending}
          onChange={(event) => {
            const next = event.target.value as TriggerValue;
            persist(
              next === "none"
                ? "not_required"
                : status === "not_required"
                  ? "open"
                  : status,
            );
          }}
        >
          <option value="none">No action</option>
          <option value="follow_up">Follow up</option>
        </select>
      </td>
      <td className="px-3 py-2.5 align-middle">
        <select
          aria-label="Action status"
          className={INLINE_SELECT_CLASS}
          value={status}
          disabled={!canEdit || pending || trigger === "none"}
          onChange={(event) =>
            persist(event.target.value as SentimentActionStatus)
          }
        >
          {(trigger === "none"
            ? SENTIMENT_ACTION_STATUS_OPTIONS.filter((option) => option.id === "not_required")
            : SENTIMENT_ACTION_STATUS_OPTIONS.filter((option) => option.id !== "not_required")
          ).map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </td>
    </>
  );
}
