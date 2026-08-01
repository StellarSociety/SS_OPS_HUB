"use client";

import { useEffect, useState } from "react";
import { Check, Clock, Loader2, Mail, X, XCircle } from "lucide-react";
import { EmailMessageEditor } from "@/components/hr/email-message-editor";
import { Button } from "@/components/ui/button";
import {
  previewBoardingNoticeEmail,
  saveBoardingNoticeEmailDraft,
  scheduleBoardingNoticeEmail,
  sendBoardingNoticeEmail,
} from "@/lib/actions/hr-boarding-email";
import type { OffboardingNoticeEmailDelivery } from "@/lib/hr/offboarding-process";
import type { BoardingEmailAction } from "@/lib/hr/types";
import { cn } from "@/lib/utils";

const SEND_STEPS = [
  "Preparing message…",
  "Connecting to mail…",
  "Delivering email…",
  "Confirming delivery…",
] as const;

type Phase = "loading" | "ready" | "sending" | "success" | "error";

function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultScheduleLocal(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  if (d.getTime() <= Date.now() + 60_000) {
    d.setHours(d.getHours() + 1);
  }
  return toDatetimeLocalValue(d);
}

type OffboardingNoticeEmailDialogProps = {
  open: boolean;
  onClose: () => void;
  staffId: string;
  processId?: string | null;
  action: BoardingEmailAction;
  notificationDate: string;
  terminationDate: string;
  /** When set, compose opens with this draft/schedule and updates it on save/send. */
  editingDraft?: OffboardingNoticeEmailDelivery | null;
  onSent: (delivery: OffboardingNoticeEmailDelivery) => void;
  onDraftSaved: (draft: OffboardingNoticeEmailDelivery) => void;
  onScheduled: (delivery: OffboardingNoticeEmailDelivery) => void;
};

export function OffboardingNoticeEmailDialog({
  open,
  onClose,
  staffId,
  processId = null,
  action,
  notificationDate,
  terminationDate,
  editingDraft = null,
  onSent,
  onDraftSaved,
  onScheduled,
}: OffboardingNoticeEmailDialogProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [stepIndex, setStepIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [templates, setTemplates] = useState<Array<{ id: string; name: string }>>(
    [],
  );
  const [to, setTo] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledAtLocal, setScheduledAtLocal] = useState(defaultScheduleLocal);
  const [delivery, setDelivery] =
    useState<OffboardingNoticeEmailDelivery | null>(null);

  const title =
    action === "termination_notice"
      ? editingDraft
        ? "Edit termination notice"
        : "Send termination notice email"
      : editingDraft
        ? "Edit resignation confirmation"
        : "Send resignation confirmation email";

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPhase("loading");
    setError(null);
    setDelivery(null);
    setStepIndex(0);
    setScheduling(false);
    setSavingDraft(false);

    const existingSchedule = editingDraft?.scheduledAt;
    if (existingSchedule) {
      setScheduleEnabled(true);
      setScheduledAtLocal(toDatetimeLocalValue(new Date(existingSchedule)));
    } else {
      setScheduleEnabled(false);
      setScheduledAtLocal(defaultScheduleLocal());
    }

    void previewBoardingNoticeEmail({
      staffId,
      action,
      templateId: editingDraft?.templateId,
      notificationDate,
      terminationDate,
    }).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
        setPhase("error");
        return;
      }
      const preview = result.preview;
      if (!preview.enabled) {
        setError(
          "Boarding emails are disabled. Enable them in Settings → Emails → Boarding email.",
        );
        setPhase("error");
        return;
      }
      setTo(preview.to);
      setTemplates(preview.templates);
      if (editingDraft) {
        setSubject(editingDraft.subject);
        setMessage(editingDraft.message);
        setTemplateId(editingDraft.templateId || preview.templateId);
        setTemplateName(editingDraft.templateName || preview.templateName);
      } else {
        setSubject(preview.subject);
        setMessage(preview.message);
        setTemplateId(preview.templateId);
        setTemplateName(preview.templateName);
      }
      setPhase("ready");
    });

    return () => {
      cancelled = true;
    };
  }, [
    open,
    staffId,
    action,
    notificationDate,
    terminationDate,
    editingDraft,
  ]);

  useEffect(() => {
    if (phase !== "sending") return;
    const timer = window.setInterval(() => {
      setStepIndex((prev) =>
        prev >= SEND_STEPS.length - 1 ? prev : prev + 1,
      );
    }, 700);
    return () => window.clearInterval(timer);
  }, [phase]);

  async function handleSend() {
    if (phase === "sending") return;
    setPhase("sending");
    setError(null);
    setStepIndex(0);
    try {
      const result = await sendBoardingNoticeEmail({
        id: editingDraft?.id,
        staffId,
        processId,
        action,
        templateId,
        notificationDate,
        terminationDate,
        subject,
        message,
      });
      if (!result.ok) {
        setError(result.error);
        setPhase("error");
        return;
      }
      setDelivery(result.delivery);
      setTemplateName(result.delivery.templateName);
      setPhase("success");
      onSent(result.delivery);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send email.");
      setPhase("error");
    }
  }

  async function handleSchedule() {
    if (phase !== "ready" || scheduling) return;
    setScheduling(true);
    setError(null);
    try {
      const result = await scheduleBoardingNoticeEmail({
        id: editingDraft?.id,
        staffId,
        processId,
        action,
        templateId,
        notificationDate,
        terminationDate,
        subject,
        message,
        to,
        scheduledAt: new Date(scheduledAtLocal).toISOString(),
      });
      if (!result.ok) {
        setError(result.error);
        setPhase("error");
        setScheduling(false);
        return;
      }
      onScheduled(result.delivery);
      setScheduling(false);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to schedule email.",
      );
      setPhase("error");
      setScheduling(false);
    }
  }

  async function handleSaveDraft() {
    if (phase !== "ready" || savingDraft) return;
    setSavingDraft(true);
    setError(null);
    try {
      const result = await saveBoardingNoticeEmailDraft({
        id: editingDraft?.id,
        staffId,
        processId,
        action,
        templateId,
        notificationDate,
        terminationDate,
        subject,
        message,
        to,
      });
      if (!result.ok) {
        setError(result.error);
        setPhase("error");
        setSavingDraft(false);
        return;
      }
      onDraftSaved(result.draft);
      setSavingDraft(false);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save draft.");
      setPhase("error");
      setSavingDraft(false);
    }
  }

  async function handleTemplateChange(nextId: string) {
    setTemplateId(nextId);
    setPhase("loading");
    setError(null);
    const result = await previewBoardingNoticeEmail({
      staffId,
      action,
      templateId: nextId,
      notificationDate,
      terminationDate,
    });
    if (!result.ok) {
      setError(result.error);
      setPhase("error");
      return;
    }
    setTo(result.preview.to);
    setSubject(result.preview.subject);
    setMessage(result.preview.message);
    setTemplateName(result.preview.templateName);
    setTemplates(result.preview.templates);
    setPhase("ready");
  }

  if (!open) return null;

  const busy = savingDraft || scheduling;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close"
        disabled={phase === "sending"}
        onClick={() => {
          if (phase !== "sending") onClose();
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ob-notice-email-title"
        className="relative z-10 flex max-h-[min(90vh,720px)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-black/10 bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-black/10 px-5 py-4">
          <div>
            <h2
              id="ob-notice-email-title"
              className="font-serif text-lg text-[#3D421F]"
            >
              {phase === "sending"
                ? "Sending email…"
                : phase === "success"
                  ? "Email sent"
                  : phase === "error"
                    ? "Email failed"
                    : title}
            </h2>
            <p className="mt-0.5 text-sm text-black/50">
              Review the template, save a draft, schedule, or send now.
            </p>
          </div>
          <button
            type="button"
            className="rounded-md p-1.5 text-black/45 transition hover:bg-black/5 hover:text-[#3D421F] disabled:opacity-40"
            onClick={onClose}
            disabled={phase === "sending"}
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {phase === "loading" ? (
            <div className="flex items-center gap-2 py-10 text-sm text-black/55">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Loading message template…
            </div>
          ) : null}

          {phase === "sending" || phase === "success" || phase === "error" ? (
            <div className="space-y-4">
              {phase === "success" && delivery ? (
                <div className="flex flex-col items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-5 text-center">
                  <span className="flex size-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                    <Check className="size-6" strokeWidth={2.5} />
                  </span>
                  <div>
                    <p className="font-medium text-emerald-950">
                      Message delivered
                    </p>
                    <p className="mt-1 text-sm text-emerald-900/80">
                      Sent to {delivery.to}
                    </p>
                  </div>
                  <dl className="w-full space-y-1.5 rounded-lg border border-emerald-200/80 bg-white/70 px-3 py-2.5 text-left text-xs text-emerald-950/80">
                    <MetaRow label="Subject" value={delivery.subject} />
                    <MetaRow label="Template" value={delivery.templateName} />
                    <MetaRow label="Provider" value={delivery.provider} />
                    <MetaRow
                      label="Sent at"
                      value={new Date(delivery.sentAt).toLocaleString("en-AE", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    />
                  </dl>
                </div>
              ) : null}

              {phase === "error" ? (
                <div className="flex flex-col items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-5 text-center">
                  <span className="flex size-12 items-center justify-center rounded-full bg-red-100 text-red-700">
                    <XCircle className="size-6" />
                  </span>
                  <div>
                    <p className="font-medium text-red-950">
                      Something went wrong
                    </p>
                    <p className="mt-1 text-sm text-red-900/80">
                      {error ?? "Unknown error"}
                    </p>
                  </div>
                </div>
              ) : null}

              {phase === "sending" ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 rounded-lg border border-black/8 bg-[var(--venue-secondary,#F0F3DD)]/50 px-3 py-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-[var(--venue-primary,#818a40)] shadow-sm">
                      <Mail className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[#3D421F]">
                        {SEND_STEPS[stepIndex]}
                      </p>
                      <p className="truncate text-xs text-black/50">
                        To {to ?? "employee"}
                      </p>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/10">
                        <div
                          className="h-full rounded-full bg-[var(--venue-primary,#818a40)] transition-[width] duration-500 ease-out"
                          style={{
                            width: `${Math.min(
                              95,
                              ((stepIndex + 1) / SEND_STEPS.length) * 100,
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                  <ul className="space-y-1.5 text-xs text-black/50">
                    {SEND_STEPS.map((label, index) => {
                      const done = index <= stepIndex;
                      return (
                        <li
                          key={label}
                          className={cn(
                            "flex items-center gap-2",
                            done ? "text-[#3D421F]" : "text-black/35",
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
                              <Check className="h-2.5 w-2.5" strokeWidth={3} />
                            ) : null}
                          </span>
                          {label}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

          {phase === "ready" ? (
            <div className="space-y-4">
              {error ? (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {error}
                </p>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#3D421F]">
                    To
                  </label>
                  <p className="rounded-lg border border-black/10 bg-[#faf9f6] px-3 py-2 text-sm text-[#3D421F]">
                    {to ?? (
                      <span className="text-rose-700">
                        No employee email on file
                      </span>
                    )}
                  </p>
                </div>
                <div>
                  <label
                    htmlFor="ob-notice-template"
                    className="mb-1 block text-xs font-medium text-[#3D421F]"
                  >
                    Template
                  </label>
                  <select
                    id="ob-notice-template"
                    value={templateId}
                    onChange={(e) => void handleTemplateChange(e.target.value)}
                    className="h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm text-[#3D421F] outline-none focus:border-[var(--venue-primary,#818a40)]/50 focus:ring-2 focus:ring-[var(--venue-primary,#818a40)]/20"
                  >
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label
                  htmlFor="ob-notice-subject"
                  className="mb-1 block text-xs font-medium text-[#3D421F]"
                >
                  Subject
                </label>
                <input
                  id="ob-notice-subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-sm text-[#3D421F] outline-none focus:border-[var(--venue-primary,#818a40)]/50 focus:ring-2 focus:ring-[var(--venue-primary,#818a40)]/20"
                />
              </div>

              <div>
                <label
                  htmlFor="ob-notice-message"
                  className="mb-1 block text-xs font-medium text-[#3D421F]"
                >
                  Message
                </label>
                <EmailMessageEditor
                  id="ob-notice-message"
                  rows={12}
                  value={message}
                  onChange={setMessage}
                  aria-label="Notice email message"
                />
                <p className="mt-1 text-[11px] text-black/45">
                  Template: {templateName}. Edit before sending if needed.
                </p>
              </div>

              <div className="rounded-lg border border-black/10 bg-[#faf9f6] px-3 py-3">
                <label className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={scheduleEnabled}
                    onChange={(e) => setScheduleEnabled(e.target.checked)}
                    className="mt-0.5 size-4 rounded border-black/25 text-[var(--venue-primary,#818a40)] focus:ring-[var(--venue-primary,#818a40)]/30"
                  />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 text-sm font-medium text-[#3D421F]">
                      <Clock className="size-3.5 shrink-0" aria-hidden />
                      Schedule send
                    </span>
                    <span className="mt-0.5 block text-xs text-black/50">
                      Send automatically at the chosen date and time (within ~5
                      minutes).
                    </span>
                  </span>
                </label>
                {scheduleEnabled ? (
                  <div className="mt-3">
                    <label
                      htmlFor="ob-notice-scheduled-at"
                      className="mb-1 block text-xs font-medium text-[#3D421F]"
                    >
                      Send at
                    </label>
                    <input
                      id="ob-notice-scheduled-at"
                      type="datetime-local"
                      value={scheduledAtLocal}
                      min={toDatetimeLocalValue(new Date(Date.now() + 60_000))}
                      onChange={(e) => setScheduledAtLocal(e.target.value)}
                      className="h-10 w-full max-w-xs rounded-lg border border-black/10 bg-white px-3 text-sm text-[#3D421F] outline-none focus:border-[var(--venue-primary,#818a40)]/50 focus:ring-2 focus:ring-[var(--venue-primary,#818a40)]/20"
                    />
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-black/10 bg-[var(--venue-secondary,#F0F3DD)]/50 px-5 py-3">
          {phase === "ready" ? (
            <>
              <Button
                type="button"
                variant="secondary"
                onClick={onClose}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={!subject.trim() || busy}
                onClick={() => void handleSaveDraft()}
              >
                {savingDraft ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Saving…
                  </>
                ) : (
                  "Save Draft"
                )}
              </Button>
              {scheduleEnabled ? (
                <Button
                  type="button"
                  disabled={
                    !to || !subject.trim() || !scheduledAtLocal || busy
                  }
                  onClick={() => void handleSchedule()}
                >
                  {scheduling ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      Scheduling…
                    </>
                  ) : (
                    <>
                      <Clock className="h-4 w-4" aria-hidden />
                      Schedule send
                    </>
                  )}
                </Button>
              ) : (
                <Button
                  type="button"
                  disabled={!to || !subject.trim() || busy}
                  onClick={() => void handleSend()}
                >
                  <Mail className="h-4 w-4" aria-hidden />
                  Confirm &amp; send
                </Button>
              )}
            </>
          ) : null}
          {phase === "success" || phase === "error" ? (
            <Button type="button" onClick={onClose}>
              {phase === "success" ? "Done" : "Close"}
            </Button>
          ) : null}
          {phase === "error" && to ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setError(null);
                setPhase("ready");
              }}
            >
              Edit &amp; retry
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-black/45">{label}</dt>
      <dd className="min-w-0 text-right break-words">{value}</dd>
    </div>
  );
}
