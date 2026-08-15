"use client";

import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  AcknowledgementEmailButtonPreview,
  AcknowledgementEmployeePreview,
} from "@/components/hr/acknowledgement-employee-view";
import { EmailMessageEditor } from "@/components/hr/email-message-editor";
import { GuardedSettingsForm } from "@/components/settings/guarded-settings-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveAcknowledgementPageSettings } from "@/lib/actions/hr-acknowledgements";
import {
  ACKNOWLEDGEMENT_PAGE_TEMPLATE_CODES,
  type HrAcknowledgementPageSettings,
} from "@/lib/hr/acknowledgement";
import { cn } from "@/lib/utils";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : "Save acknowledgement page"}
    </Button>
  );
}

export function AcknowledgementPageSettingsPanel({
  settings,
  venueName,
  venueLogoUrl,
}: {
  settings: HrAcknowledgementPageSettings;
  venueName: string;
  venueLogoUrl?: string | null;
}) {
  const [heading, setHeading] = useState(settings.heading);
  const [intro, setIntro] = useState(settings.intro);
  const [emailButtonLabel, setEmailButtonLabel] = useState(
    settings.emailButtonLabel,
  );
  const [acknowledgeButtonLabel, setAcknowledgeButtonLabel] = useState(
    settings.acknowledgeButtonLabel,
  );
  const [declineButtonLabel, setDeclineButtonLabel] = useState(
    settings.declineButtonLabel,
  );
  const [commentsPrompt, setCommentsPrompt] = useState(settings.commentsPrompt);
  const [submittedHeading, setSubmittedHeading] = useState(
    settings.submittedHeading,
  );
  const [submittedMessage, setSubmittedMessage] = useState(
    settings.submittedMessage,
  );
  const [codesOpen, setCodesOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  const watch = useMemo(
    () =>
      JSON.stringify({
        heading,
        intro,
        emailButtonLabel,
        acknowledgeButtonLabel,
        declineButtonLabel,
        commentsPrompt,
        submittedHeading,
        submittedMessage,
      }),
    [
      heading,
      intro,
      emailButtonLabel,
      acknowledgeButtonLabel,
      declineButtonLabel,
      commentsPrompt,
      submittedHeading,
      submittedMessage,
    ],
  );

  async function copyTemplateCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      window.setTimeout(() => {
        setCopiedCode((current) => (current === code ? null : current));
      }, 1500);
    } catch {
      // clipboard unavailable
    }
  }

  async function handleSave(formData: FormData) {
    setStatusMessage(null);
    setStatusError(null);
    const result = await saveAcknowledgementPageSettings(formData);
    if (!result.ok) {
      setStatusError(result.error);
      return result;
    }
    setStatusMessage("Acknowledgement page settings saved.");
    return result;
  }

  const previewSettings = {
    heading,
    intro,
    emailButtonLabel,
    acknowledgeButtonLabel,
    declineButtonLabel,
    commentsPrompt,
    submittedHeading,
    submittedMessage,
  };

  return (
    <GuardedSettingsForm
      action={handleSave}
      className="space-y-6"
      watch={watch}
    >
      <input type="hidden" name="intro" value={intro} />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
        <Card className="space-y-4 p-5">
          <div>
            <h2 className="font-serif text-lg text-[#3D421F]">Email button</h2>
            <p className="mt-1 text-sm text-black/55">
              Label on the verify button added to emails that require
              acknowledgement.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ack_email_button">Email button</Label>
            <Input
              id="ack_email_button"
              name="email_button_label"
              value={emailButtonLabel}
              onChange={(e) => setEmailButtonLabel(e.target.value)}
              className="h-9"
            />
            <p className="text-[11px] text-black/45">
              Use{" "}
              <code className="rounded bg-[var(--venue-secondary,#F0F3DD)]/60 px-1 py-0.5 font-semibold text-[#3D421F]">
                {"{{EMPLOYEE_NAME}}"}
              </code>{" "}
              to include the recipient’s name.
            </p>
          </div>
        </Card>
        <div className="xl:sticky xl:top-4 xl:self-start">
          <AcknowledgementEmailButtonPreview
            venueName={venueName}
            venueLogoUrl={venueLogoUrl}
            buttonLabel={emailButtonLabel}
            employeeName="Alex Rivera"
            employeeEmail="alex.rivera@example.com"
            subject="Your payslip — August 2026 — Venue"
          />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
        <Card className="space-y-6 p-5">
          <div>
            <h2 className="font-serif text-lg text-[#3D421F]">
              Acknowledgement page
            </h2>
            <p className="mt-1 text-sm text-black/55">
              The page the employee sees after they open the verify button.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ack_heading">Heading</Label>
            <Input
              id="ack_heading"
              name="heading"
              value={heading}
              onChange={(e) => setHeading(e.target.value)}
              className="h-9"
            />
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="ack_intro">Intro message</Label>
              <button
                type="button"
                aria-expanded={codesOpen}
                onClick={() => setCodesOpen((open) => !open)}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#3D421F] underline-offset-2 hover:underline"
              >
                Template codes
                <ChevronDown
                  className={cn(
                    "size-3.5 transition-transform",
                    codesOpen && "rotate-180",
                  )}
                />
              </button>
            </div>
            {codesOpen ? (
              <div className="space-y-3 rounded-lg border border-black/10 bg-[var(--venue-secondary,#F0F3DD)]/25 p-3">
                <p className="text-xs text-black/55">
                  Click a code to copy it, then paste into the intro or the
                  email button. The email subject is always shown separately on
                  the page.
                </p>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {ACKNOWLEDGEMENT_PAGE_TEMPLATE_CODES.map((item) => (
                    <li key={item.code}>
                      <button
                        type="button"
                        className={cn(
                          "flex w-full flex-col items-start gap-1 rounded-md border bg-white px-2.5 py-2 text-left transition hover:bg-white/80",
                          copiedCode === item.code
                            ? "border-emerald-300"
                            : "border-black/8",
                        )}
                        onClick={() => void copyTemplateCode(item.code)}
                        title={`Copy ${item.code}`}
                      >
                        <code className="rounded bg-[var(--venue-secondary,#F0F3DD)]/60 px-1.5 py-0.5 text-[11px] font-semibold text-[#3D421F]">
                          {item.code}
                        </code>
                        <span className="text-[11px] leading-snug text-black/55">
                          {copiedCode === item.code
                            ? "Copied"
                            : item.description}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <EmailMessageEditor
              id="ack_intro"
              rows={8}
              value={intro}
              onChange={setIntro}
              aria-label="Acknowledgement intro message"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ack_comments_prompt">Comments prompt</Label>
              <Input
                id="ack_comments_prompt"
                name="comments_prompt"
                value={commentsPrompt}
                onChange={(e) => setCommentsPrompt(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ack_decline">Do not acknowledge</Label>
              <Input
                id="ack_decline"
                name="decline_button_label"
                value={declineButtonLabel}
                onChange={(e) => setDeclineButtonLabel(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ack_accept">Acknowledge</Label>
              <Input
                id="ack_accept"
                name="acknowledge_button_label"
                value={acknowledgeButtonLabel}
                onChange={(e) => setAcknowledgeButtonLabel(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ack_thanks_heading">After submit heading</Label>
              <Input
                id="ack_thanks_heading"
                name="submitted_heading"
                value={submittedHeading}
                onChange={(e) => setSubmittedHeading(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ack_thanks_message">After submit message</Label>
              <textarea
                id="ack_thanks_message"
                name="submitted_message"
                rows={3}
                value={submittedMessage}
                onChange={(e) => setSubmittedMessage(e.target.value)}
                className="w-full resize-y rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-[#3D421F] outline-none focus:border-[var(--venue-primary,#818a40)]/50 focus:ring-2 focus:ring-[var(--venue-primary,#818a40)]/20"
              />
            </div>
          </div>

          {statusMessage ? (
            <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              {statusMessage}
            </p>
          ) : null}
          {statusError ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {statusError}
            </p>
          ) : null}

          <div className="flex justify-end pt-2">
            <SaveButton />
          </div>
        </Card>

        <div className="xl:sticky xl:top-4 xl:self-start">
          <AcknowledgementEmployeePreview
            venueName={venueName}
            venueLogoUrl={venueLogoUrl}
            settings={previewSettings}
          />
        </div>
      </div>
    </GuardedSettingsForm>
  );
}
