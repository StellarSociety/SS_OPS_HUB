"use client";

import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { AcknowledgementReminderEmailPreview } from "@/components/hr/acknowledgement-employee-view";
import { EmailMessageEditor } from "@/components/hr/email-message-editor";
import { GuardedSettingsForm } from "@/components/settings/guarded-settings-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveAcknowledgementReminderSettings } from "@/lib/actions/hr-acknowledgements";
import {
  ACKNOWLEDGEMENT_REMINDER_TEMPLATE_CODES,
  DEFAULT_HR_ACKNOWLEDGEMENT_REMINDER_SETTINGS,
  type HrAcknowledgementReminderSettings,
} from "@/lib/hr/acknowledgement";
import { cn } from "@/lib/utils";

function SaveButton({ label = "Save reminder email" }: { label?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

export function AcknowledgementReminderSettingsPanel({
  settings,
  section = "email",
  venueName = "Venue",
  venueLogoUrl = null,
  emailButtonLabel = "Click here to verify",
}: {
  settings: HrAcknowledgementReminderSettings;
  section?: "email" | "schedule";
  venueName?: string;
  venueLogoUrl?: string | null;
  emailButtonLabel?: string;
}) {
  const [firstReminderDay, setFirstReminderDay] = useState(
    String(settings.firstReminderDay),
  );
  const [secondReminderDay, setSecondReminderDay] = useState(
    String(settings.secondReminderDay),
  );
  const [dailyAfterSecond, setDailyAfterSecond] = useState(
    settings.dailyAfterSecond,
  );
  const [subject, setSubject] = useState(
    settings.subject || DEFAULT_HR_ACKNOWLEDGEMENT_REMINDER_SETTINGS.subject,
  );
  const [body, setBody] = useState(
    settings.body || DEFAULT_HR_ACKNOWLEDGEMENT_REMINDER_SETTINGS.body,
  );
  const [codesOpen, setCodesOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  const watch = useMemo(
    () =>
      JSON.stringify({
        firstReminderDay,
        secondReminderDay,
        dailyAfterSecond,
        subject,
        body,
      }),
    [body, dailyAfterSecond, firstReminderDay, secondReminderDay, subject],
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
    const result = await saveAcknowledgementReminderSettings({
      firstReminderDay: Number(formData.get("first_reminder_day")),
      secondReminderDay: Number(formData.get("second_reminder_day")),
      dailyAfterSecond: formData.get("daily_after_second") === "true",
      subject: String(formData.get("subject") ?? ""),
      body: String(formData.get("body") ?? ""),
    });
    if (!result.ok) {
      setStatusError(result.error);
      return result;
    }
    setFirstReminderDay(String(result.settings.firstReminderDay));
    setSecondReminderDay(String(result.settings.secondReminderDay));
    setDailyAfterSecond(result.settings.dailyAfterSecond);
    setSubject(result.settings.subject);
    setBody(result.settings.body);
    setStatusMessage("Acknowledgement reminder email saved.");
    return result;
  }

  if (section === "schedule") {
    return (
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
      <Card className="space-y-4 p-5">
        <div>
          <h2 className="font-serif text-lg text-[#3D421F]">
            Automatic Reminders
          </h2>
          <p className="mt-1 text-sm text-black/55">
            Days after the original send
          </p>
        </div>
        <GuardedSettingsForm
          action={handleSave}
          className="flex flex-wrap items-end justify-between gap-3"
          watch={watch}
        >
          <input
            type="hidden"
            name="first_reminder_day"
            value={firstReminderDay}
          />
          <input
            type="hidden"
            name="second_reminder_day"
            value={secondReminderDay}
          />
          <input
            type="hidden"
            name="daily_after_second"
            value={dailyAfterSecond ? "true" : "false"}
          />
          <input type="hidden" name="subject" value={subject} />
          <input type="hidden" name="body" value={body} />
          <div className="flex flex-wrap items-end gap-4">
            <label className="space-y-1">
              <span className="block text-xs font-medium text-[#3D421F]">
                1st
              </span>
              <Input
                type="number"
                min={1}
                max={365}
                inputMode="numeric"
                value={firstReminderDay}
                onChange={(event) => setFirstReminderDay(event.target.value)}
                className="h-8 w-16"
              />
            </label>
            <label className="space-y-1">
              <span className="block text-xs font-medium text-[#3D421F]">
                2nd
              </span>
              <Input
                type="number"
                min={1}
                max={365}
                inputMode="numeric"
                value={secondReminderDay}
                onChange={(event) => setSecondReminderDay(event.target.value)}
                className="h-8 w-16"
              />
            </label>
            <label className="flex items-center gap-2 pb-1 text-xs text-[#3D421F]">
              <input
                type="checkbox"
                className="size-3.5 rounded border-black/20"
                checked={dailyAfterSecond}
                onChange={(event) => setDailyAfterSecond(event.target.checked)}
              />
              Daily after the 2nd
            </label>
          </div>
          <SaveButton label="Save rule" />
        </GuardedSettingsForm>
        {statusError ? (
          <p className="mt-2 text-sm text-red-800">{statusError}</p>
        ) : null}
        {statusMessage ? (
          <p className="mt-2 text-sm text-emerald-900">{statusMessage}</p>
        ) : null}
      </Card>
      </div>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
    <Card className="space-y-6 p-5">
      <div>
        <h2 className="font-serif text-lg text-[#3D421F]">Reminder email</h2>
        <p className="mt-1 text-sm text-black/55">
          Subject and body used when sending a reminder that acknowledgement is
          still required. The original acknowledgement link is added
          automatically.
        </p>
      </div>

      <GuardedSettingsForm
        action={handleSave}
        className="space-y-6"
        watch={watch}
      >
        <input
          type="hidden"
          name="first_reminder_day"
          value={firstReminderDay}
        />
        <input
          type="hidden"
          name="second_reminder_day"
          value={secondReminderDay}
        />
        <input
          type="hidden"
          name="daily_after_second"
          value={dailyAfterSecond ? "true" : "false"}
        />
        <input type="hidden" name="subject" value={subject} />
        <input type="hidden" name="body" value={body} />

        <div className="space-y-1.5">
          <Label htmlFor="ack_reminder_subject">Subject</Label>
          <Input
            id="ack_reminder_subject"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            className="h-9"
          />
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label htmlFor="ack_reminder_body">Email body</Label>
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
                Click a code to copy it, then paste into the subject or
                message.
              </p>
              <ul className="grid gap-2 sm:grid-cols-2">
                {ACKNOWLEDGEMENT_REMINDER_TEMPLATE_CODES.map((item) => (
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
                        {copiedCode === item.code ? "Copied" : item.description}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <EmailMessageEditor
            id="ack_reminder_body"
            rows={10}
            value={body}
            onChange={setBody}
            aria-label="Acknowledgement reminder email body"
          />
        </div>

        {statusError ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {statusError}
          </p>
        ) : null}
        {statusMessage ? (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            {statusMessage}
          </p>
        ) : null}

        <div className="flex justify-end">
          <SaveButton />
        </div>
      </GuardedSettingsForm>
    </Card>
      <div className="xl:sticky xl:top-4 xl:self-start">
        <AcknowledgementReminderEmailPreview
          venueName={venueName}
          venueLogoUrl={venueLogoUrl}
          subjectTemplate={subject}
          bodyTemplate={body}
          buttonLabel={emailButtonLabel}
        />
      </div>
    </div>
  );
}
