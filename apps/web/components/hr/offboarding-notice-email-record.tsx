"use client";

import { useState } from "react";
import { Clock, FileText, Loader2, Mail, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { emailTemplateBodyToSafeFragment } from "@/lib/hr/email-message-format";
import {
  boardingEmailActionLabel,
  type BoardingEmailAction,
} from "@/lib/hr/types";
import type { OffboardingNoticeEmailDelivery } from "@/lib/hr/offboarding-process";
import { cn } from "@/lib/utils";

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-AE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function OffboardingNoticeEmailRecordViewer({
  record,
  onClose,
  onEdit,
  onSend,
  onCancelSchedule,
  onDelete,
}: {
  record: OffboardingNoticeEmailDelivery;
  onClose: () => void;
  onEdit?: () => void;
  /** Send this draft/schedule now. Return the sent record on success. */
  onSend?: () => Promise<
    | { ok: true; delivery: OffboardingNoticeEmailDelivery }
    | { ok: false; error: string }
  >;
  /** Convert a scheduled email back to a draft. */
  onCancelSchedule?: () => Promise<
    | { ok: true; draft: OffboardingNoticeEmailDelivery }
    | { ok: false; error: string }
  >;
  /** Permanently delete a draft. */
  onDelete?: () => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const isDraft = record.status === "draft";
  const isScheduled = record.status === "scheduled";
  const canAct = isDraft || isScheduled;
  const [sending, setSending] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const actionLabel = boardingEmailActionLabel(
    record.action as BoardingEmailAction,
  );

  async function handleSend() {
    if (!onSend || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const result = await onSend();
      if (!result.ok) {
        setSendError(result.error);
        setSending(false);
      }
      // Parent closes / swaps to sent record on success.
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Failed to send.");
      setSending(false);
    }
  }

  async function handleCancelSchedule() {
    if (!onCancelSchedule || cancelling) return;
    setCancelling(true);
    setSendError(null);
    try {
      const result = await onCancelSchedule();
      if (!result.ok) {
        setSendError(result.error);
        setCancelling(false);
      }
      // Parent updates to draft on success.
    } catch (err) {
      setSendError(
        err instanceof Error ? err.message : "Failed to cancel schedule.",
      );
      setCancelling(false);
    }
  }

  async function handleDelete() {
    if (!onDelete || deleting) return;
    setDeleting(true);
    setSendError(null);
    try {
      const result = await onDelete();
      if (!result.ok) {
        setSendError(result.error);
        setDeleting(false);
      }
      // Parent removes the draft and closes on success.
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Failed to delete.");
      setDeleting(false);
    }
  }

  const busy = sending || cancelling || deleting;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close"
        disabled={busy}
        onClick={() => {
          if (!busy) onClose();
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ob-sent-email-title"
        className="relative z-10 flex max-h-[min(90vh,720px)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-black/10 bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-black/10 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-black/45">
              {isDraft
                ? "Draft email record"
                : isScheduled
                  ? "Scheduled email record"
                  : "Sent email record"}
            </p>
            <h2
              id="ob-sent-email-title"
              className="mt-0.5 font-serif text-lg text-[#3D421F]"
            >
              {actionLabel}
            </h2>
            <p className="mt-0.5 text-sm text-black/50">
              {sending
                ? "Sending…"
                : cancelling
                  ? "Cancelling schedule…"
                  : deleting
                    ? "Deleting draft…"
                    : isDraft
                      ? "Saved draft — not sent yet"
                      : isScheduled && record.scheduledAt
                        ? `Queued for ${formatWhen(record.scheduledAt)} — sends automatically when due`
                        : `Exact message delivered via ${record.provider}`}
            </p>
          </div>
          <button
            type="button"
            className="rounded-md p-1.5 text-black/45 transition hover:bg-black/5 hover:text-[#3D421F] disabled:opacity-40"
            onClick={onClose}
            disabled={busy}
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {sendError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {sendError}
            </p>
          ) : null}

          <dl className="grid gap-3 rounded-lg border border-black/10 bg-[#faf9f6] px-3 py-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-black/45">To</dt>
              <dd className="mt-0.5 break-all text-[#3D421F]">
                {record.to.trim() || (
                  <span className="text-black/40">No recipient yet</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-black/45">From</dt>
              <dd className="mt-0.5 break-all text-[#3D421F]">
                {record.fromEmail?.trim() ||
                  (canAct ? "—" : "Connection / Transport default")}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-black/45">
                {isDraft
                  ? "Saved at"
                  : isScheduled
                    ? "Scheduled for"
                    : "Sent at"}
              </dt>
              <dd className="mt-0.5 text-[#3D421F]">
                {isScheduled && record.scheduledAt
                  ? formatWhen(record.scheduledAt)
                  : formatWhen(record.sentAt)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-black/45">Template</dt>
              <dd className="mt-0.5 text-[#3D421F]">{record.templateName}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-black/45">Subject</dt>
              <dd className="mt-0.5 text-[#3D421F]">{record.subject}</dd>
            </div>
          </dl>

          <div>
            <p className="mb-1.5 text-xs font-medium text-[#3D421F]">Message</p>
            <div className="rounded-lg border border-black/10 bg-white px-3 py-3 text-sm leading-relaxed text-[#3D421F]">
              {record.message.trim() ? (
                <div
                  className="whitespace-pre-wrap"
                  dangerouslySetInnerHTML={{
                    __html: emailTemplateBodyToSafeFragment(record.message),
                  }}
                />
              ) : (
                <span className="text-black/40">No message body.</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-black/10 bg-[var(--venue-secondary,#F0F3DD)]/50 px-5 py-3">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={busy}
          >
            Close
          </Button>
          {canAct ? (
            <>
              {isDraft && onDelete ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void handleDelete()}
                  disabled={busy}
                  className="mr-auto text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                >
                  {deleting ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : null}
                  {deleting ? "Deleting…" : "Delete draft"}
                </Button>
              ) : null}
              {isScheduled ? (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void handleCancelSchedule()}
                  disabled={busy || !onCancelSchedule}
                >
                  {cancelling ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : null}
                  {cancelling ? "Cancelling…" : "Cancel schedule"}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="secondary"
                onClick={onEdit}
                disabled={busy || !onEdit}
              >
                Edit
              </Button>
              <Button
                type="button"
                onClick={() => void handleSend()}
                disabled={busy || !onSend || !record.to.trim()}
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Mail className="h-4 w-4" aria-hidden />
                )}
                {sending ? "Sending…" : isScheduled ? "Send now" : "Send"}
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function OffboardingNoticeEmailRecordCard({
  record,
  onOpen,
}: {
  record: OffboardingNoticeEmailDelivery;
  onOpen: () => void;
}) {
  const isDraft = record.status === "draft";
  const isScheduled = record.status === "scheduled";
  const title = boardingEmailActionLabel(record.action as BoardingEmailAction);

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition",
        isDraft
          ? "border-amber-200 bg-amber-50/80 hover:border-amber-300 hover:bg-amber-50"
          : isScheduled
            ? "border-sky-200 bg-sky-50/80 hover:border-sky-300 hover:bg-sky-50"
            : "border-emerald-200 bg-emerald-50/80 hover:border-emerald-300 hover:bg-emerald-50",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          isDraft
            ? "bg-amber-100 text-amber-900"
            : isScheduled
              ? "bg-sky-100 text-sky-900"
              : "bg-emerald-100 text-emerald-800",
        )}
      >
        {isDraft ? (
          <FileText className="h-4 w-4" aria-hidden />
        ) : isScheduled ? (
          <Clock className="h-4 w-4" aria-hidden />
        ) : (
          <Mail className="h-4 w-4" aria-hidden />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline justify-between gap-2">
          <span
            className={cn(
              "text-sm font-medium",
              isDraft
                ? "text-amber-950"
                : isScheduled
                  ? "text-sky-950"
                  : "text-emerald-950",
            )}
          >
            {title}
            {isDraft ? (
              <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
                Draft
              </span>
            ) : null}
            {isScheduled ? (
              <span className="ml-2 rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-900">
                Scheduled
              </span>
            ) : null}
          </span>
          <span
            className={cn(
              "text-[11px] font-medium",
              isDraft
                ? "text-amber-800/70"
                : isScheduled
                  ? "text-sky-800/70"
                  : "text-emerald-800/70",
            )}
          >
            View
          </span>
        </span>
        <span
          className={cn(
            "mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs",
            isDraft
              ? "text-amber-950/70"
              : isScheduled
                ? "text-sky-950/70"
                : "text-emerald-950/70",
          )}
        >
          <span className="shrink-0 tabular-nums">
            {isDraft
              ? "Saved"
              : isScheduled
                ? "Sends"
                : "Sent"}{" "}
            {formatWhen(
              isScheduled && record.scheduledAt
                ? record.scheduledAt
                : record.sentAt,
            )}
            {!isDraft && !isScheduled ? (
              <>
                {" · "}
                <span className="capitalize">{record.provider}</span>
              </>
            ) : null}
          </span>
          <span className="text-black/25" aria-hidden>
            ·
          </span>
          <span className="min-w-0 truncate">
            {record.to.trim() ? `To ${record.to}` : "No recipient yet"}
          </span>
          <span className="text-black/25" aria-hidden>
            ·
          </span>
          <span className="min-w-0 truncate">{record.subject}</span>
        </span>
      </span>
    </button>
  );
}
