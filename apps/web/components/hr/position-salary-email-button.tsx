"use client";

import {
  CalendarClock,
  Check,
  Clock,
  Loader2,
  Mail,
  Send,
  X,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import {
  cancelScheduledPositionSalaryEmail,
  previewPositionSalaryEmail,
  schedulePositionSalaryEmail,
  sendPositionSalaryEmail,
  type PositionSalaryEmailDraft,
  type PositionSalaryEmailPreview,
} from "@/lib/actions/hr-position-salary-email";
import { formatDateOnly } from "@/lib/hr/derived";
import {
  POSITION_SALARY_EMAIL_KIND_HINTS,
  POSITION_SALARY_EMAIL_KIND_LABELS,
  type PositionSalaryEmailKind,
  type PositionSalaryEmailRecord,
} from "@/lib/hr/position-salary-email";
import { cn } from "@/lib/utils";

const SEND_STEPS = [
  "Preparing message…",
  "Connecting to mail…",
  "Delivering email…",
  "Confirming delivery…",
] as const;

type Phase =
  | "loading"
  | "compose"
  | "sending"
  | "scheduling"
  | "sent"
  | "scheduled"
  | "error";

type Delivery = "now" | "schedule";

function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Next morning at 09:00, the usual time to hand over a letter. */
function defaultScheduleLocal(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return toDatetimeLocalValue(d);
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-AE", {
    timeZone: "Asia/Dubai",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function PositionSalaryEmailButton({
  changeId,
  employeeName,
  suggestedKind,
  latest,
}: {
  changeId: string;
  employeeName: string;
  suggestedKind: PositionSalaryEmailKind;
  latest: PositionSalaryEmailRecord | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("loading");
  const [preview, setPreview] = useState<PositionSalaryEmailPreview | null>(
    null,
  );
  const [drafts, setDrafts] = useState<
    Partial<Record<PositionSalaryEmailKind, PositionSalaryEmailDraft>>
  >({});
  const [kind, setKind] = useState<PositionSalaryEmailKind>(suggestedKind);
  const [delivery, setDelivery] = useState<Delivery>("now");
  const [scheduledAtLocal, setScheduledAtLocal] = useState(defaultScheduleLocal);
  const [scheduleMin, setScheduleMin] = useState("");
  const [sendStepIndex, setSendStepIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PositionSalaryEmailRecord | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const busy = phase === "sending" || phase === "scheduling";
  const draft = drafts[kind];

  useEffect(() => {
    if (phase !== "sending") return;
    const timer = window.setInterval(() => {
      setSendStepIndex((prev) =>
        prev >= SEND_STEPS.length - 1 ? prev : prev + 1,
      );
    }, 700);
    return () => window.clearInterval(timer);
  }, [phase]);

  async function openDialog() {
    setOpen(true);
    setPhase("loading");
    setError(null);
    setResult(null);
    setKind(suggestedKind);
    setDelivery("now");
    setScheduledAtLocal(defaultScheduleLocal());
    setScheduleMin(toDatetimeLocalValue(new Date(Date.now() + 60_000)));
    setSendStepIndex(0);
    const res = await previewPositionSalaryEmail({ changeId });
    if (!res.ok) {
      setError(res.error);
      setPhase("error");
      return;
    }
    setPreview(res.preview);
    setDrafts(
      Object.fromEntries(res.preview.drafts.map((d) => [d.kind, d])),
    );
    setPhase("compose");
  }

  function close() {
    if (busy) return;
    setOpen(false);
  }

  function updateDraft(patch: Partial<PositionSalaryEmailDraft>) {
    setDrafts((prev) => {
      const current = prev[kind];
      return current ? { ...prev, [kind]: { ...current, ...patch } } : prev;
    });
  }

  async function submit() {
    if (!draft || busy) return;
    if (!draft.to.trim()) {
      setError("Enter a destination email address.");
      return;
    }
    if (!draft.subject.trim()) {
      setError("Enter an email subject.");
      return;
    }
    setError(null);
    const payload = {
      changeId,
      kind,
      to: draft.to,
      subject: draft.subject,
      body: draft.body,
    };

    if (delivery === "schedule") {
      setPhase("scheduling");
      const res = await schedulePositionSalaryEmail({
        ...payload,
        scheduledAt: new Date(scheduledAtLocal).toISOString(),
      });
      if (!res.ok) {
        setError(res.error);
        setPhase("compose");
        return;
      }
      setResult(res.record);
      setPhase("scheduled");
      router.refresh();
      return;
    }

    setSendStepIndex(0);
    setPhase("sending");
    try {
      const res = await sendPositionSalaryEmail(payload);
      if (!res.ok) {
        setError(res.error);
        setPhase("error");
        return;
      }
      setResult(res.record);
      setSendStepIndex(SEND_STEPS.length - 1);
      setPhase("sent");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send email.");
      setPhase("error");
    }
  }

  async function cancelScheduled() {
    if (!latest || cancelling) return;
    setCancelling(true);
    const res = await cancelScheduledPositionSalaryEmail({ emailId: latest.id });
    setCancelling(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.saved("Scheduled email cancelled.");
    router.refresh();
  }

  const title =
    phase === "sending"
      ? "Sending email…"
      : phase === "sent"
        ? "Email sent"
        : phase === "scheduled"
          ? "Email scheduled"
          : phase === "error" && preview
            ? "Email failed"
            : "Email letter";

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => void openDialog()}
        title={`Email a letter to ${employeeName}`}
        aria-label={`Email a letter to ${employeeName}`}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--venue-primary,#818a40)]/30 bg-white px-2.5 text-xs font-medium text-[#3D421F] transition hover:bg-[var(--venue-primary,#818a40)]/10"
      >
        <Mail className="size-3.5 text-[var(--venue-primary,#818a40)]" />
        Email
      </button>
      {latest?.status === "sent" ? (
        <span
          className="inline-flex items-center gap-1 text-[11px] text-green-700"
          title={`${POSITION_SALARY_EMAIL_KIND_LABELS[latest.kind]} sent to ${latest.to}`}
        >
          <Check className="size-3" strokeWidth={2.5} />
          Sent {formatDateOnly(latest.sentAt)}
        </span>
      ) : latest?.status === "scheduled" ? (
        <span
          className="inline-flex items-center gap-1 text-[11px] text-amber-700"
          title={`${POSITION_SALARY_EMAIL_KIND_LABELS[latest.kind]} to ${latest.to}, ${formatDateTime(latest.scheduledAt)}`}
        >
          <Clock className="size-3" />
          {formatDateOnly(latest.scheduledAt)}
          <button
            type="button"
            onClick={() => void cancelScheduled()}
            disabled={cancelling}
            className="rounded p-0.5 text-black/40 hover:bg-black/5 hover:text-red-700 disabled:opacity-50"
            title="Cancel scheduled email"
            aria-label="Cancel scheduled email"
          >
            {cancelling ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <X className="size-3" />
            )}
          </button>
        </span>
      ) : null}

      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
              role="presentation"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) close();
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="ps-email-title"
                className="flex max-h-[min(92dvh,48rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-black/10 bg-white shadow-xl"
              >
                <div className="border-b border-black/8 px-6 py-4">
                  <h2
                    id="ps-email-title"
                    className="font-serif text-xl text-[#3D421F]"
                  >
                    {title}
                  </h2>
                  {preview ? (
                    <p className="mt-1 text-sm text-black/55">
                      {preview.empNo
                        ? `${preview.empNo} — ${preview.employeeName}`
                        : preview.employeeName}{" "}
                      · effective {formatDateOnly(preview.effectiveDate)}
                    </p>
                  ) : null}
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
                  {phase === "loading" ? (
                    <p className="flex items-center gap-2 text-sm text-black/50">
                      <Loader2 className="size-4 animate-spin" />
                      Loading templates…
                    </p>
                  ) : null}

                  {phase === "compose" && draft ? (
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <Label>Template</Label>
                        <div
                          role="radiogroup"
                          aria-label="Template"
                          className="grid gap-2 sm:grid-cols-4"
                        >
                          {(Object.keys(drafts) as PositionSalaryEmailKind[]).map(
                            (k) => (
                              <button
                                key={k}
                                type="button"
                                role="radio"
                                aria-checked={k === kind}
                                onClick={() => {
                                  setKind(k);
                                  setError(null);
                                }}
                                className={cn(
                                  "rounded-lg border px-3 py-2 text-left transition",
                                  k === kind
                                    ? "border-[var(--venue-primary,#818a40)] bg-[var(--venue-primary,#818a40)]/10"
                                    : "border-black/10 hover:bg-black/[0.03]",
                                )}
                              >
                                <span className="block text-sm font-medium text-[#3D421F]">
                                  {POSITION_SALARY_EMAIL_KIND_LABELS[k]}
                                  {k === suggestedKind ? (
                                    <span className="ml-1 text-[10px] font-normal text-black/40">
                                      suggested
                                    </span>
                                  ) : null}
                                </span>
                                <span className="mt-0.5 block text-[11px] leading-snug text-black/50">
                                  {POSITION_SALARY_EMAIL_KIND_HINTS[k]}
                                </span>
                              </button>
                            ),
                          )}
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="ps-email-to">To</Label>
                        <Input
                          id="ps-email-to"
                          type="email"
                          value={draft.to}
                          onChange={(e) => updateDraft({ to: e.target.value })}
                          placeholder="No email on this staff record"
                          className="h-9"
                          autoComplete="email"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="ps-email-subject">Subject</Label>
                        <Input
                          id="ps-email-subject"
                          value={draft.subject}
                          onChange={(e) =>
                            updateDraft({ subject: e.target.value })
                          }
                          className="h-9"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="ps-email-body">Message</Label>
                        <textarea
                          id="ps-email-body"
                          value={draft.body}
                          onChange={(e) => updateDraft({ body: e.target.value })}
                          rows={12}
                          className="w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm leading-relaxed text-[#3D421F] outline-none transition focus:border-[var(--venue-primary,#818a40)]/50 focus:ring-2 focus:ring-[var(--venue-primary,#818a40)]/20"
                        />
                        <p className="text-[11px] text-black/45">
                          {draft.requiresAcknowledgement
                            ? "Includes an acknowledgement button for the employee. "
                            : ""}
                          Edits apply to this email only; change the template
                          under Settings → Emails → Other templates.
                        </p>
                      </div>

                      <div className="rounded-lg border border-black/10 bg-[#faf9f6] px-3 py-3">
                        <div
                          role="radiogroup"
                          aria-label="Delivery"
                          className="inline-flex rounded-md border border-black/10 bg-white p-0.5"
                        >
                          {(
                            [
                              ["now", "Send now", Send],
                              ["schedule", "Schedule", CalendarClock],
                            ] as const
                          ).map(([value, label, Icon]) => (
                            <button
                              key={value}
                              type="button"
                              role="radio"
                              aria-checked={delivery === value}
                              onClick={() => setDelivery(value)}
                              className={cn(
                                "inline-flex h-8 items-center gap-1.5 rounded px-3 text-sm",
                                delivery === value
                                  ? "bg-[var(--venue-secondary,#F0F3DD)] font-medium text-[#3D421F]"
                                  : "text-black/50 hover:text-[#3D421F]",
                              )}
                            >
                              <Icon className="size-3.5" />
                              {label}
                            </button>
                          ))}
                        </div>
                        {delivery === "schedule" ? (
                          <div className="mt-3">
                            <label
                              htmlFor="ps-email-scheduled-at"
                              className="mb-1 block text-xs font-medium text-[#3D421F]"
                            >
                              Send at
                            </label>
                            <input
                              id="ps-email-scheduled-at"
                              type="datetime-local"
                              value={scheduledAtLocal}
                              min={scheduleMin}
                              onChange={(e) =>
                                setScheduledAtLocal(e.target.value)
                              }
                              className="h-10 w-full max-w-xs rounded-lg border border-black/10 bg-white px-3 text-sm text-[#3D421F] outline-none focus:border-[var(--venue-primary,#818a40)]/50 focus:ring-2 focus:ring-[var(--venue-primary,#818a40)]/20"
                            />
                            <p className="mt-1 text-xs text-black/50">
                              Sent automatically at this time. Scheduling again
                              replaces any letter already waiting for this
                              change.
                            </p>
                          </div>
                        ) : (
                          <p className="mt-2 text-xs text-black/50">
                            The email goes out as soon as you confirm.
                          </p>
                        )}
                      </div>

                      {error ? (
                        <p className="text-sm text-red-700">{error}</p>
                      ) : null}
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
                            {SEND_STEPS[sendStepIndex]}
                          </p>
                          <p className="truncate text-xs text-black/50">
                            To {draft?.to}
                          </p>
                          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/10">
                            <div
                              className="h-full rounded-full bg-[var(--venue-primary,#818a40)] transition-[width] duration-500 ease-out"
                              style={{
                                width: `${Math.min(95, ((sendStepIndex + 1) / SEND_STEPS.length) * 100)}%`,
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
                      <p className="text-center text-xs text-black/45">
                        Please wait — this may take a few seconds.
                      </p>
                    </div>
                  ) : null}

                  {phase === "scheduling" ? (
                    <p className="flex items-center gap-2 text-sm text-black/50">
                      <Loader2 className="size-4 animate-spin" />
                      Scheduling email…
                    </p>
                  ) : null}

                  {phase === "sent" || phase === "scheduled" ? (
                    <div className="flex flex-col items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-5 text-center">
                      <span className="flex size-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                        {phase === "sent" ? (
                          <Check className="size-6" strokeWidth={2.5} />
                        ) : (
                          <CalendarClock className="size-6" />
                        )}
                      </span>
                      <div>
                        <p className="font-medium text-emerald-950">
                          {POSITION_SALARY_EMAIL_KIND_LABELS[kind]} letter{" "}
                          {phase === "sent" ? "delivered" : "scheduled"}
                        </p>
                        <p className="mt-1 text-sm text-emerald-900/80">
                          {phase === "sent"
                            ? `Sent to ${result?.to ?? draft?.to}`
                            : `To ${result?.to ?? draft?.to}, ${formatDateTime(result?.scheduledAt ?? null)}`}
                        </p>
                      </div>
                    </div>
                  ) : null}

                  {phase === "error" ? (
                    <div className="flex flex-col items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-5 text-center">
                      <span className="flex size-12 items-center justify-center rounded-full bg-red-100 text-red-700">
                        <XCircle className="size-6" />
                      </span>
                      <div>
                        <p className="font-medium text-red-950">
                          {preview ? "Could not send email" : "Could not open the letter"}
                        </p>
                        <p className="mt-1 text-sm text-red-900/80">
                          {error ?? "Unknown error"}
                        </p>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-wrap justify-end gap-2 border-t border-black/8 px-6 py-4">
                  {phase === "compose" ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="border border-black/15 bg-white text-[#3D421F] hover:bg-black/5"
                        onClick={close}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="gap-1.5 bg-[var(--venue-primary,#818a40)] text-white hover:opacity-90"
                        disabled={
                          !draft?.to.trim() ||
                          !draft?.subject.trim() ||
                          (delivery === "schedule" && !scheduledAtLocal)
                        }
                        onClick={() => void submit()}
                      >
                        {delivery === "schedule" ? (
                          <>
                            <CalendarClock className="size-3.5" />
                            Schedule
                          </>
                        ) : (
                          <>
                            <Send className="size-3.5" />
                            Send now
                          </>
                        )}
                      </Button>
                    </>
                  ) : null}
                  {phase === "sent" || phase === "scheduled" ? (
                    <Button
                      type="button"
                      size="sm"
                      className="bg-[var(--venue-primary,#818a40)] text-white hover:opacity-90"
                      onClick={close}
                    >
                      Done
                    </Button>
                  ) : null}
                  {phase === "error" || phase === "loading" ? (
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
                      {phase === "error" && preview ? (
                        <Button
                          type="button"
                          size="sm"
                          className="gap-1.5 bg-[var(--venue-primary,#818a40)] text-white hover:opacity-90"
                          onClick={() => {
                            setError(null);
                            setPhase("compose");
                          }}
                        >
                          Back to email
                        </Button>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
