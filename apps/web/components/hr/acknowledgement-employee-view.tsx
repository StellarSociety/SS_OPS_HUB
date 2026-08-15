"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  applyAcknowledgementPlaceholders,
  resolveAcknowledgementButtonLabel,
  type HrAcknowledgementPageSettings,
  type HrEmailAcknowledgementStatus,
} from "@/lib/hr/acknowledgement";
import { cn } from "@/lib/utils";

export type AcknowledgementEmployeeViewProps = {
  venueName: string;
  venueLogoUrl?: string | null;
  settings: HrAcknowledgementPageSettings;
  subject: string;
  employeeName: string;
  employeeEmail?: string | null;
  status: HrEmailAcknowledgementStatus;
  comments?: string;
  interactive?: boolean;
  submitting?: boolean;
  error?: string | null;
  onSubmit?: (input: {
    decision: "acknowledged" | "not_acknowledged";
    comments: string;
  }) => void;
};

export function AcknowledgementEmployeeView({
  venueName,
  venueLogoUrl,
  settings,
  subject,
  employeeName,
  employeeEmail = "",
  status,
  comments = "",
  interactive = true,
  submitting = false,
  error = null,
  onSubmit,
}: AcknowledgementEmployeeViewProps) {
  const [decision, setDecision] = useState<
    "acknowledged" | "not_acknowledged" | null
  >(null);
  const [commentDraft, setCommentDraft] = useState("");

  const intro = applyAcknowledgementPlaceholders(settings.intro, {
    employeeName,
    employeeEmail: employeeEmail ?? "",
    subject,
    venueName,
  });
  const isDone = status !== "pending";
  const showComments = decision === "not_acknowledged";

  function handleSubmit() {
    if (!interactive || !onSubmit || !decision || submitting) return;
    onSubmit({
      decision,
      comments: decision === "not_acknowledged" ? commentDraft : "",
    });
  }

  return (
    <div className="mx-auto w-full max-w-[520px] overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm">
      <div
        className="flex items-center justify-center px-6 py-6"
        style={{ backgroundColor: "var(--venue-secondary, #F0F3DD)" }}
      >
        {venueLogoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={venueLogoUrl}
            alt={venueName}
            className="h-12 w-auto max-w-[220px] object-contain"
          />
        ) : (
          <p className="font-serif text-lg text-[#3D421F]">{venueName}</p>
        )}
      </div>

      <div className="space-y-5 px-6 py-6">
        {isDone ? (
          <div className="space-y-2 text-center">
            <h1 className="font-serif text-2xl text-[#3D421F]">
              {settings.submittedHeading}
            </h1>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-black/65">
              {settings.submittedMessage}
            </p>
            <p className="pt-2 text-xs font-medium uppercase tracking-wide text-black/45">
              {status === "acknowledged"
                ? "You acknowledged"
                : "You did not acknowledge"}
            </p>
            {comments.trim() ? (
              <p className="rounded-lg border border-black/10 bg-[var(--venue-secondary,#F0F3DD)]/40 px-3 py-2 text-left text-sm text-[#3D421F]">
                {comments}
              </p>
            ) : null}
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <h1 className="font-serif text-2xl text-[#3D421F]">
                {settings.heading}
              </h1>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-black/65">
                {intro}
              </p>
            </div>

            <div className="rounded-xl border border-black/10 bg-[var(--venue-secondary,#F0F3DD)]/40 px-4 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-black/45">
                You are acknowledging
              </p>
              <p className="mt-1 text-sm font-medium text-[#3D421F]">
                {subject || "(No subject)"}
              </p>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                disabled={!interactive || submitting}
                onClick={() => setDecision("not_acknowledged")}
                className={cn(
                  "h-11 rounded-lg border px-3 text-sm font-medium transition",
                  decision === "not_acknowledged"
                    ? "border-rose-300 bg-rose-50 text-rose-900"
                    : "border-black/15 bg-white text-[#3D421F] hover:bg-black/5",
                )}
              >
                {settings.declineButtonLabel}
              </button>
              <button
                type="button"
                disabled={!interactive || submitting}
                onClick={() => setDecision("acknowledged")}
                className={cn(
                  "h-11 rounded-lg px-3 text-sm font-medium text-white transition hover:opacity-90",
                  decision === "acknowledged" ? "opacity-100" : "opacity-95",
                )}
                style={{ backgroundColor: "var(--venue-primary, #818a40)" }}
              >
                {settings.acknowledgeButtonLabel}
              </button>
            </div>

            {showComments ? (
              <div className="space-y-1.5">
                <label
                  htmlFor="ack-comments"
                  className="text-sm font-medium text-[#3D421F]"
                >
                  {settings.commentsPrompt}
                </label>
                <textarea
                  id="ack-comments"
                  rows={4}
                  value={commentDraft}
                  disabled={!interactive || submitting}
                  onChange={(e) => setCommentDraft(e.target.value)}
                  className="w-full resize-y rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-[#3D421F] outline-none focus:border-[var(--venue-primary,#818a40)]/50 focus:ring-2 focus:ring-[var(--venue-primary,#818a40)]/20"
                />
              </div>
            ) : null}

            {error ? (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </p>
            ) : null}

            <Button
              type="button"
              className="w-full"
              disabled={
                !interactive ||
                submitting ||
                !decision ||
                (decision === "not_acknowledged" && !commentDraft.trim())
              }
              onClick={handleSubmit}
            >
              {submitting ? "Submitting…" : "Submit"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export function AcknowledgementEmployeePreview({
  venueName,
  venueLogoUrl,
  settings,
  subject = "Your payslip — August 2026 — Venue",
  employeeName = "Alex Rivera",
  employeeEmail = "alex.rivera@example.com",
}: {
  venueName: string;
  venueLogoUrl?: string | null;
  settings: HrAcknowledgementPageSettings;
  subject?: string;
  employeeName?: string;
  employeeEmail?: string;
}) {
  const [status, setStatus] = useState<HrEmailAcknowledgementStatus>("pending");
  const [comments, setComments] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-6">
      <AcknowledgementEmailButtonPreview
        venueName={venueName}
        venueLogoUrl={venueLogoUrl}
        buttonLabel={settings.emailButtonLabel}
        employeeName={employeeName}
        employeeEmail={employeeEmail}
        subject={subject}
      />

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-black/45">
            Employee preview
          </p>
          {status !== "pending" ? (
            <button
              type="button"
              className="text-xs font-medium text-[#3D421F] underline-offset-2 hover:underline"
              onClick={() => {
                setStatus("pending");
                setComments("");
              }}
            >
              Reset preview
            </button>
          ) : null}
        </div>
        <AcknowledgementEmployeeView
          venueName={venueName}
          venueLogoUrl={venueLogoUrl}
          settings={settings}
          subject={subject}
          employeeName={employeeName}
          employeeEmail={employeeEmail}
          status={status}
          comments={comments}
          submitting={pending}
          onSubmit={(input) => {
            startTransition(() => {
              setStatus(input.decision);
              setComments(input.comments);
            });
          }}
        />
      </div>
    </div>
  );
}

function AcknowledgementEmailButtonPreview({
  venueName,
  venueLogoUrl,
  buttonLabel,
  employeeName,
  employeeEmail,
  subject,
}: {
  venueName: string;
  venueLogoUrl?: string | null;
  buttonLabel: string;
  employeeName: string;
  employeeEmail: string;
  subject: string;
}) {
  const label = resolveAcknowledgementButtonLabel(buttonLabel, {
    employeeName,
    employeeEmail,
    subject,
    venueName,
  });

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium uppercase tracking-wide text-black/45">
        Email button preview
      </p>
      <div className="mx-auto w-full max-w-[520px] overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm">
        <div
          className="flex items-center justify-center px-6 py-5"
          style={{ backgroundColor: "var(--venue-secondary, #F0F3DD)" }}
        >
          {venueLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={venueLogoUrl}
              alt={venueName}
              className="h-10 w-auto max-w-[200px] object-contain"
            />
          ) : (
            <p className="font-serif text-base text-[#3D421F]">{venueName}</p>
          )}
        </div>
        <div className="border-b border-black/8 px-6 py-2.5">
          <p className="truncate text-[11px] text-black/45">
            Subject:{" "}
            <span className="font-medium text-[#3D421F]">
              {subject || "(No subject)"}
            </span>
          </p>
        </div>
        <div className="space-y-4 px-6 py-5">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-black/65">
            {`Dear ${employeeName},\n\nThis is a sample of the email they receive. The verify button is added at the bottom when acknowledgement is required.`}
          </p>
          <div className="flex justify-center pt-2 pb-1">
            <span
              aria-hidden
              className="inline-block cursor-default rounded-lg px-[22px] py-3 text-center text-sm font-bold leading-tight text-white"
              style={{ backgroundColor: "var(--venue-primary, #818a40)" }}
            >
              {label}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
