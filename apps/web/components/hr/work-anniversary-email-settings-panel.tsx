"use client";

import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { EmailMessageEditor } from "@/components/hr/email-message-editor";
import { RequiresAcknowledgementCheckbox } from "@/components/hr/requires-acknowledgement-checkbox";
import { GuardedSettingsForm } from "@/components/settings/guarded-settings-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveWorkAnniversaryEmailSettings } from "@/lib/actions/hr-work-anniversary-email";
import {
  WORK_ANNIVERSARY_EMAIL_TEMPLATE_CODES,
  type HrWorkAnniversaryEmailSettings,
  type PayslipEmailRecipientField,
} from "@/lib/hr/types";
import { cn } from "@/lib/utils";

const selectClass =
  "flex h-9 w-full rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F] outline-none focus:border-[var(--venue-primary)]/50 focus:ring-2 focus:ring-[var(--venue-primary)]/20";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : "Save changes"}
    </Button>
  );
}

export function WorkAnniversaryEmailSettingsPanel({
  settings,
  connectionFromEmail = "",
}: {
  settings: HrWorkAnniversaryEmailSettings;
  connectionFromEmail?: string;
}) {
  const [enabled, setEnabled] = useState(settings.enabled);
  const [autoSendOnAnniversary, setAutoSendOnAnniversary] = useState(
    settings.autoSendOnAnniversary,
  );
  const [recipientField, setRecipientField] =
    useState<PayslipEmailRecipientField>(settings.recipientField);
  const [fromEmail, setFromEmail] = useState(settings.fromEmail);
  const [subject, setSubject] = useState(settings.subject);
  const [message, setMessage] = useState(settings.message);
  const [requiresAcknowledgement, setRequiresAcknowledgement] = useState(
    settings.requiresAcknowledgement === true,
  );
  const [messageHelpOpen, setMessageHelpOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  const watch = useMemo(
    () =>
      JSON.stringify({
        enabled,
        autoSendOnAnniversary,
        recipientField,
        fromEmail,
        subject,
        message,
        requiresAcknowledgement,
      }),
    [
      enabled,
      autoSendOnAnniversary,
      recipientField,
      fromEmail,
      subject,
      message,
      requiresAcknowledgement,
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
    const result = await saveWorkAnniversaryEmailSettings(formData);
    if (!result.ok) {
      setStatusError(result.error);
      return result;
    }
    setStatusMessage("Work anniversary email settings saved.");
    return result;
  }

  return (
    <Card className="space-y-6 p-5">
      <div>
        <h2 className="font-serif text-lg text-[#3D421F]">
          Work Anniversary
        </h2>
        <p className="mt-1 text-sm text-black/55">
          Congratulation message sent from Staff Insights when celebrating years
          of service. Delivery uses Venue Settings → Email config.
        </p>
      </div>

      <GuardedSettingsForm
        action={handleSave}
        className="space-y-6"
        watch={watch}
      >
        <label className="flex items-start gap-2 rounded-lg border border-black/10 bg-[var(--venue-secondary,#F0F3DD)]/35 px-3 py-2.5 text-sm text-[#3D421F]">
          <input
            type="checkbox"
            className="mt-0.5 size-4 rounded border-black/20"
            checked={enabled}
            onChange={(e) => {
              const next = e.target.checked;
              setEnabled(next);
              if (!next) setAutoSendOnAnniversary(false);
            }}
          />
          <span>
            <span className="block font-medium">
              Enable work anniversary emails
            </span>
            <span className="mt-0.5 block text-xs text-black/55">
              When off, the send icon on Insights stays unavailable.
            </span>
          </span>
        </label>
        <input
          type="hidden"
          name="enabled"
          value={enabled ? "true" : "false"}
        />

        <label className="flex items-start gap-2 rounded-lg border border-black/10 bg-[var(--venue-secondary,#F0F3DD)]/35 px-3 py-2.5 text-sm text-[#3D421F]">
          <input
            type="checkbox"
            className="mt-0.5 size-4 rounded border-black/20"
            checked={autoSendOnAnniversary}
            onChange={(e) => setAutoSendOnAnniversary(e.target.checked)}
            disabled={!enabled}
          />
          <span>
            <span className="block font-medium">
              Auto-send on the anniversary day
            </span>
            <span className="mt-0.5 block text-xs text-black/55">
              Sends congratulations to the employee automatically when their
              work anniversary falls today.
            </span>
          </span>
        </label>
        <input
          type="hidden"
          name="auto_send_on_anniversary"
          value={autoSendOnAnniversary ? "true" : "false"}
        />

        <RequiresAcknowledgementCheckbox
          checked={requiresAcknowledgement}
          onChange={setRequiresAcknowledgement}
          disabled={!enabled}
        />

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="recipient_field">Send to employee email</Label>
            <select
              id="recipient_field"
              name="recipient_field"
              className={selectClass}
              value={recipientField}
              onChange={(e) =>
                setRecipientField(e.target.value as PayslipEmailRecipientField)
              }
              disabled={!enabled}
            >
              <option value="work">Work email</option>
              <option value="personal">Personal email</option>
              <option value="work_then_personal">
                Work email, fall back to personal
              </option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wa_from_email">From email (optional)</Label>
            <Input
              id="wa_from_email"
              name="from_email"
              type="email"
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
              placeholder={
                connectionFromEmail.trim() || "Set under Venue Settings → Email config"
              }
              disabled={!enabled}
            />
            <p className="text-xs text-black/50">
              {fromEmail.trim()
                ? "Emails will send from this address."
                : connectionFromEmail.trim()
                  ? `Leave blank to send from ${connectionFromEmail.trim()} (Email config).`
                  : "Leave blank to use the From address under Venue Settings → Email config."}
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="wa_subject">Subject</Label>
          <Input
            id="wa_subject"
            name="subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={!enabled}
          />
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label htmlFor="wa_message">Message</Label>
            <button
              type="button"
              aria-expanded={messageHelpOpen}
              onClick={() => setMessageHelpOpen((open) => !open)}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#3D421F] underline-offset-2 hover:underline"
              disabled={!enabled}
            >
              Template codes
              <ChevronDown
                className={cn(
                  "size-3.5 transition-transform",
                  messageHelpOpen && "rotate-180",
                )}
              />
            </button>
          </div>

          {messageHelpOpen ? (
            <div className="space-y-3 rounded-lg border border-black/10 bg-white/70 p-3">
              <p className="text-xs text-black/55">
                Click a code to copy it, then paste into the subject or message.
                Codes are filled per employee when the email is sent.
              </p>
              <ul className="grid gap-2 sm:grid-cols-2">
                {WORK_ANNIVERSARY_EMAIL_TEMPLATE_CODES.map((item) => (
                  <li key={item.code}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full items-start gap-2 rounded-md border bg-white px-2.5 py-2 text-left transition hover:bg-white/80",
                        copiedCode === item.code
                          ? "border-emerald-300"
                          : "border-black/8",
                      )}
                      onClick={() => void copyTemplateCode(item.code)}
                      title={`Copy ${item.code}`}
                      disabled={!enabled}
                    >
                      <code className="shrink-0 rounded bg-[var(--venue-secondary,#F0F3DD)]/60 px-1.5 py-0.5 text-[11px] font-semibold text-[#3D421F]">
                        {item.code}
                      </code>
                      <span className="min-w-0 flex-1 text-[11px] leading-snug text-black/55">
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

          <input type="hidden" name="message" value={message} />
          <EmailMessageEditor
            id="wa_message"
            value={message}
            onChange={setMessage}
            disabled={!enabled}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <SaveButton />
          {statusMessage ? (
            <p className="text-sm text-emerald-700">{statusMessage}</p>
          ) : null}
          {statusError ? (
            <p className="text-sm text-red-700">{statusError}</p>
          ) : null}
        </div>
      </GuardedSettingsForm>
    </Card>
  );
}
