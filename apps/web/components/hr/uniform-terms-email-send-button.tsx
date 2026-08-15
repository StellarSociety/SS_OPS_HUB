"use client";

import { Check, Mail, XCircle } from "lucide-react";
import { useEffect, useState, useTransition, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { EmailMessageEditor } from "@/components/hr/email-message-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  listUniformTermsEmailSends,
  previewUniformTermsEmail,
  sendUniformTermsEmail,
  type UniformTermsEmailPreview,
  type UniformTermsEmailSendRecord,
} from "@/lib/actions/hr-uniform-terms-email";
import { formatAed } from "@/lib/hr/derived";
import { cn } from "@/lib/utils";

const SEND_STEPS = [
  "Preparing message…",
  "Connecting to mail…",
  "Delivering email…",
  "Confirming delivery…",
] as const;

type DialogStep = "confirm" | "preview";
type SendPhase = "idle" | "sending" | "success" | "error";

type DraftFields = {
  to: string;
  subject: string;
  body: string;
};

function formatSendWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-AE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function UniformTermsEmailSendButton({
  staffId,
  fullName,
  empNo,
  sentCount = 0,
  disabled = false,
  className,
}: {
  staffId: string;
  fullName: string;
  empNo?: string;
  sentCount?: number;
  disabled?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [dialogStep, setDialogStep] = useState<DialogStep | null>(null);
  const [sendPhase, setSendPhase] = useState<SendPhase>("idle");
  const [sendStepIndex, setSendStepIndex] = useState(0);
  const [previewMeta, setPreviewMeta] =
    useState<UniformTermsEmailPreview | null>(null);
  const [draft, setDraft] = useState<DraftFields | null>(null);
  const [pending, startTransition] = useTransition();
  const [historyPending, startHistoryTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [sendHistory, setSendHistory] = useState<
    UniformTermsEmailSendRecord[] | null
  >(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [visibleSentCount, setVisibleSentCount] = useState(sentCount);

  const busy = pending || sendPhase === "sending";

  useEffect(() => {
    setVisibleSentCount(sentCount);
  }, [sentCount]);

  useEffect(() => {
    if (sendPhase !== "sending") return;
    const timer = window.setInterval(() => {
      setSendStepIndex((prev) =>
        prev >= SEND_STEPS.length - 1 ? prev : prev + 1,
      );
    }, 700);
    return () => window.clearInterval(timer);
  }, [sendPhase]);

  function loadSendHistory() {
    setHistoryError(null);
    startHistoryTransition(async () => {
      const result = await listUniformTermsEmailSends({ staffId });
      if (!result.ok) {
        setSendHistory([]);
        setHistoryError(result.error);
        return;
      }
      setSendHistory(result.sends);
    });
  }

  function close() {
    if (busy) return;
    setDialogStep(null);
    setSendPhase("idle");
    setSendStepIndex(0);
    setPreviewMeta(null);
    setDraft(null);
    setError(null);
    setSendHistory(null);
    setHistoryError(null);
  }

  function openConfirm(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    setError(null);
    setPreviewMeta(null);
    setDraft(null);
    setSendPhase("idle");
    setSendStepIndex(0);
    setSendHistory(null);
    setHistoryError(null);
    setDialogStep("confirm");
    loadSendHistory();
  }

  function openPreview() {
    setError(null);
    startTransition(async () => {
      const result = await previewUniformTermsEmail({ staffId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPreviewMeta(result.preview);
      setDraft({
        to: result.preview.to,
        subject: result.preview.subject,
        body: result.preview.body,
      });
      setSendPhase("idle");
      setDialogStep("preview");
    });
  }

  async function handleSend() {
    if (!draft || sendPhase === "sending") return;
    const to = draft.to.trim();
    const subject = draft.subject.trim();
    if (!to) {
      setError("Enter a destination email address.");
      return;
    }
    if (!subject) {
      setError("Enter an email subject.");
      return;
    }
    setError(null);
    setSentTo(to);
    setSendStepIndex(0);
    setSendPhase("sending");

    try {
      const result = await sendUniformTermsEmail({
        staffId,
        draft: {
          to,
          subject,
          body: draft.body,
        },
      });
      if (!result.ok) {
        setError(result.error);
        setSendPhase("error");
        return;
      }
      setSentTo(result.to);
      setSendStepIndex(SEND_STEPS.length - 1);
      setSendPhase("success");
      setVisibleSentCount((count) => count + 1);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not send uniform T&Cs email.",
      );
      setSendPhase("error");
    }
  }

  const employeeLabel = empNo
    ? `${empNo} — ${fullName}`
    : fullName || "Employee";

  const showSendStatus =
    dialogStep === "preview" &&
    (sendPhase === "sending" ||
      sendPhase === "success" ||
      sendPhase === "error");

  const dialogTitle = showSendStatus
    ? sendPhase === "sending"
      ? "Sending email…"
      : sendPhase === "success"
        ? "Email sent"
        : "Email failed"
    : dialogStep === "confirm"
      ? "Send uniform T&Cs"
      : "Review email";

  return (
    <>
      <button
        type="button"
        onClick={openConfirm}
        disabled={busy || disabled}
        title={
          disabled
            ? "Assign uniform pieces before sending T&Cs"
            : visibleSentCount > 0
              ? `${visibleSentCount} T&Cs email${visibleSentCount === 1 ? "" : "s"} sent — email ${fullName} again`
              : sentTo
                ? `Sent to ${sentTo}`
                : `Email ${fullName} uniforms on hand & T&Cs`
        }
        aria-label={`Send uniform T&Cs email to ${fullName}${
          visibleSentCount > 0
            ? `, ${visibleSentCount} previously sent`
            : ""
        }`}
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-sm font-semibold text-[var(--venue-primary,#6B7B3A)] transition hover:bg-[var(--venue-primary,#6B7B3A)]/15 disabled:cursor-not-allowed disabled:opacity-45",
          className,
        )}
      >
        <Mail className="h-5 w-5" strokeWidth={2} aria-hidden />
        <span>T&amp;C&apos;s</span>
      </button>

      {dialogStep && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
              role="presentation"
              onMouseDown={(event) => {
                if (!busy && event.target === event.currentTarget) {
                  close();
                }
              }}
            >
              {dialogStep === "confirm" ? (
                <div
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="send-uniform-terms-title"
                  className="w-full max-w-md rounded-xl border border-black/10 bg-white p-6 shadow-xl"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <h2
                    id="send-uniform-terms-title"
                    className="font-serif text-xl text-[#3D421F]"
                  >
                    {dialogTitle}
                  </h2>
                  <p className="mt-1 text-sm text-black/55">
                    Continue to review this employee&apos;s uniforms on hand
                    and the terms &amp; conditions before sending.
                  </p>

                  <div className="mt-4 rounded-lg border border-black/10 bg-black/[0.02] px-3 py-3 text-sm text-[#3D421F]">
                    <p className="font-medium">{employeeLabel}</p>
                    <div className="mt-3 border-t border-black/8 pt-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-black/45">
                        Previous sends
                      </p>
                      {historyPending && sendHistory === null ? (
                        <p className="mt-1.5 text-xs text-black/45">
                          Loading send history…
                        </p>
                      ) : historyError ? (
                        <p className="mt-1.5 text-xs text-red-700">
                          {historyError}
                        </p>
                      ) : sendHistory && sendHistory.length > 0 ? (
                        <ul className="mt-2 max-h-40 space-y-2 overflow-y-auto">
                          {sendHistory.map((send) => {
                            const metaParts: string[] = [];
                            if (send.to) metaParts.push(send.to);
                            if (send.itemCount != null) {
                              metaParts.push(
                                `${send.itemCount} piece${send.itemCount === 1 ? "" : "s"}`,
                              );
                            }
                            if (send.totalValue != null) {
                              metaParts.push(formatAed(send.totalValue));
                            }
                            return (
                              <li
                                key={send.id}
                                className="rounded-md border border-black/8 bg-white/70 px-2.5 py-2"
                              >
                                <p className="text-xs font-medium text-[#3D421F]">
                                  {formatSendWhen(send.sentAt)}
                                </p>
                                {metaParts.length > 0 ? (
                                  <p className="mt-0.5 truncate text-[11px] text-black/50">
                                    {metaParts.join(" · ")}
                                  </p>
                                ) : null}
                                {send.sentBy ? (
                                  <p className="mt-0.5 truncate text-[11px] text-black/40">
                                    Sent by {send.sentBy}
                                  </p>
                                ) : null}
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <p className="mt-1.5 text-xs text-black/45">
                          No uniform T&amp;Cs email has been sent to this
                          employee yet.
                        </p>
                      )}
                    </div>
                  </div>

                  {error ? (
                    <p className="mt-3 text-sm text-red-700">{error}</p>
                  ) : null}

                  <div className="mt-6 flex justify-end gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="border border-black/15 bg-white text-[#3D421F] hover:bg-black/5"
                      disabled={busy}
                      onClick={close}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="gap-1.5 bg-[var(--venue-primary,#818a40)] text-white hover:opacity-90"
                      disabled={busy}
                      onClick={openPreview}
                    >
                      <Mail className="size-3.5" strokeWidth={2} />
                      {pending ? "Loading…" : "Send email"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="preview-uniform-terms-email-title"
                  className="flex max-h-[min(92dvh,44rem)] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-black/10 bg-white shadow-xl"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <div className="border-b border-black/8 px-6 py-4">
                    <h2
                      id="preview-uniform-terms-email-title"
                      className="font-serif text-xl text-[#3D421F]"
                    >
                      {dialogTitle}
                    </h2>
                    {!showSendStatus ? (
                      <p className="mt-1 text-sm text-black/55">
                        Edit the fields below, then confirm to send.
                      </p>
                    ) : null}
                  </div>

                  <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
                    {showSendStatus ? (
                      <div className="space-y-4">
                        {sendPhase === "success" ? (
                          <div className="flex flex-col items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-5 text-center">
                            <span className="flex size-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                              <Check className="size-6" strokeWidth={2.5} />
                            </span>
                            <div>
                              <p className="font-medium text-emerald-950">
                                Uniform T&amp;Cs email delivered
                              </p>
                              <p className="mt-1 text-sm text-emerald-900/80">
                                Sent to {sentTo ?? draft?.to ?? "employee"}
                              </p>
                            </div>
                          </div>
                        ) : null}

                        {sendPhase === "error" ? (
                          <div className="flex flex-col items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-5 text-center">
                            <span className="flex size-12 items-center justify-center rounded-full bg-red-100 text-red-700">
                              <XCircle className="size-6" />
                            </span>
                            <div>
                              <p className="font-medium text-red-950">
                                Could not send email
                              </p>
                              <p className="mt-1 text-sm text-red-900/80">
                                {error ?? "Unknown error"}
                              </p>
                            </div>
                          </div>
                        ) : null}

                        {sendPhase === "sending" ? (
                          <div className="space-y-3">
                            <div className="flex items-center gap-3 rounded-lg border border-black/8 bg-[var(--venue-secondary,#F0F3DD)]/50 px-3 py-3">
                              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-[var(--venue-primary,#818a40)] shadow-sm">
                                <Mail className="size-5" />
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-[#3D421F]">
                                  {SEND_STEPS[sendStepIndex]}
                                </p>
                                <p className="truncate text-xs text-black/50">
                                  To {sentTo ?? draft?.to ?? "employee"}
                                </p>
                                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/10">
                                  <div
                                    className="h-full rounded-full bg-[var(--venue-primary,#818a40)] transition-[width] duration-500 ease-out"
                                    style={{
                                      width: `${Math.min(
                                        95,
                                        ((sendStepIndex + 1) /
                                          SEND_STEPS.length) *
                                          100,
                                      )}%`,
                                    }}
                                  />
                                </div>
                              </div>
                            </div>
                            <ul className="space-y-1.5 text-xs text-black/50">
                              {SEND_STEPS.map((label, index) => {
                                const done = index <= sendStepIndex;
                                return (
                                  <li
                                    key={label}
                                    className={cn(
                                      "flex items-center gap-2",
                                      done
                                        ? "text-[#3D421F]"
                                        : "text-black/35",
                                    )}
                                  >
                                    <span
                                      className={cn(
                                        "flex h-4 w-4 items-center justify-center rounded-full",
                                        done
                                          ? "bg-[var(--venue-primary,#818a40)] text-white"
                                          : "border border-black/15",
                                      )}
                                    >
                                      {done ? (
                                        <Check
                                          className="h-2.5 w-2.5"
                                          strokeWidth={3}
                                        />
                                      ) : null}
                                    </span>
                                    {label}
                                  </li>
                                );
                              })}
                            </ul>
                            <p className="text-center text-xs text-black/45">
                              Please wait — this may take a few seconds.
                            </p>
                          </div>
                        ) : null}
                      </div>
                    ) : draft && previewMeta ? (
                      <>
                        <div className="space-y-1.5">
                          <Label>Employee</Label>
                          <div className="rounded-md border border-black/10 bg-black/[0.02] px-3 py-2.5 text-sm text-[#3D421F]">
                            <p className="font-medium">
                              {previewMeta.empNo
                                ? `${previewMeta.empNo} — ${previewMeta.employeeName}`
                                : previewMeta.employeeName}
                            </p>
                            <p className="mt-0.5 text-xs text-black/45">
                              {previewMeta.itemCount} piece
                              {previewMeta.itemCount === 1 ? "" : "s"} on hand
                              {" · "}
                              {previewMeta.totalValueLabel}
                            </p>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <Label htmlFor="ute-email-to">To</Label>
                          <Input
                            id="ute-email-to"
                            type="email"
                            value={draft.to}
                            onChange={(e) =>
                              setDraft((prev) =>
                                prev ? { ...prev, to: e.target.value } : prev,
                              )
                            }
                            disabled={busy}
                            className="h-9"
                            autoComplete="email"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label htmlFor="ute-email-subject">Subject</Label>
                          <Input
                            id="ute-email-subject"
                            value={draft.subject}
                            onChange={(e) =>
                              setDraft((prev) =>
                                prev
                                  ? { ...prev, subject: e.target.value }
                                  : prev,
                              )
                            }
                            disabled={busy}
                            className="h-9"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label htmlFor="ute-email-body">Message</Label>
                          <EmailMessageEditor
                            id="ute-email-body"
                            value={draft.body}
                            onChange={(body) =>
                              setDraft((prev) =>
                                prev ? { ...prev, body } : prev,
                              )
                            }
                            disabled={busy}
                            rows={12}
                          />
                        </div>

                        {error ? (
                          <p className="text-sm text-red-700">{error}</p>
                        ) : null}
                      </>
                    ) : (
                      <p className="text-sm text-black/45">Loading preview…</p>
                    )}
                  </div>

                  <div className="flex flex-wrap justify-end gap-2 border-t border-black/8 px-6 py-4">
                    {sendPhase === "sending" ? null : sendPhase === "success" ? (
                      <Button
                        type="button"
                        size="sm"
                        className="bg-[var(--venue-primary,#818a40)] text-white hover:opacity-90"
                        onClick={close}
                      >
                        Done
                      </Button>
                    ) : sendPhase === "error" ? (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="border border-black/15 bg-white text-[#3D421F] hover:bg-black/5"
                          onClick={close}
                        >
                          Close
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="border border-black/15 bg-white text-[#3D421F] hover:bg-black/5"
                          onClick={() => {
                            setError(null);
                            setSendPhase("idle");
                            setSendStepIndex(0);
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className="gap-1.5 bg-[var(--venue-primary,#818a40)] text-white hover:opacity-90"
                          onClick={() => void handleSend()}
                        >
                          <Mail className="size-3.5" strokeWidth={2} />
                          Try again
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="border border-black/15 bg-white text-[#3D421F] hover:bg-black/5"
                          disabled={busy}
                          onClick={() => {
                            setError(null);
                            setDialogStep("confirm");
                          }}
                        >
                          Back
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="border border-black/15 bg-white text-[#3D421F] hover:bg-black/5"
                          disabled={busy}
                          onClick={close}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className="gap-1.5 bg-[var(--venue-primary,#818a40)] text-white hover:opacity-90"
                          disabled={busy || !draft}
                          onClick={() => void handleSend()}
                        >
                          <Mail className="size-3.5" strokeWidth={2} />
                          Confirm &amp; send
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
