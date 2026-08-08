"use client";

import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { EmailMessageEditor } from "@/components/hr/email-message-editor";
import { EmailStaffDocumentsPicker } from "@/components/hr/email-staff-documents-picker";
import { GuardedSettingsForm } from "@/components/settings/guarded-settings-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveCertificationRequestEmailSettings } from "@/lib/actions/hr-certifications";
import {
  CERTIFICATION_REQUEST_EMAIL_TEMPLATE_CODES,
  type HrEmailStaffDocumentKey,
  type HrCertificationRequestEmailSettings,
} from "@/lib/hr/types";
import { cn } from "@/lib/utils";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : "Save changes"}
    </Button>
  );
}

export function CertificationRequestEmailSettingsPanel({
  settings,
  connectionFromEmail = "",
}: {
  settings: HrCertificationRequestEmailSettings;
  connectionFromEmail?: string;
}) {
  const [enabled, setEnabled] = useState(settings.enabled);
  const [fromEmail, setFromEmail] = useState(settings.fromEmail);
  const [subject, setSubject] = useState(settings.subject);
  const [message, setMessage] = useState(settings.message);
  const [attachDocuments, setAttachDocuments] = useState<
    HrEmailStaffDocumentKey[]
  >(settings.attachDocuments);
  const [requireAttachments, setRequireAttachments] = useState(
    settings.requireAttachments !== false,
  );
  const [messageHelpOpen, setMessageHelpOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  const watch = useMemo(
    () =>
      JSON.stringify({
        enabled,
        fromEmail,
        subject,
        message,
        attachDocuments,
        requireAttachments,
      }),
    [enabled, fromEmail, subject, message, attachDocuments, requireAttachments],
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
    const result = await saveCertificationRequestEmailSettings(formData);
    if (!result.ok) {
      setStatusError(result.error);
      return result;
    }
    setStatusMessage("Certification request email settings saved.");
    return result;
  }

  return (
    <Card className="space-y-6 p-5">
      <div>
        <h2 className="font-serif text-lg text-[#3D421F]">
          Certification request email
        </h2>
        <p className="mt-1 text-sm text-black/55">
          Template for requests sent to certification providers from Staff
          Compliance → Certifications → Employees. Each email goes to the
          provider contact on the certification type and attaches the employee
          documents you select below from WorkDrive. Delivery uses Venue
          Settings → Email config.
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
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span>
            <span className="block font-medium">
              Enable certification request emails
            </span>
            <span className="mt-0.5 block text-xs text-black/55">
              When off, Email request on the Certifications employees page
              cannot send.
            </span>
          </span>
        </label>
        <input
          type="hidden"
          name="enabled"
          value={enabled ? "true" : "false"}
        />

        <div className="space-y-1.5">
          <Label htmlFor="cert_req_from_email">From email (optional)</Label>
          <Input
            id="cert_req_from_email"
            name="from_email"
            type="email"
            value={fromEmail}
            onChange={(e) => setFromEmail(e.target.value)}
            placeholder={
              connectionFromEmail.trim() ||
              "Set under Venue Settings → Email config"
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
          <p className="text-xs text-black/50">
            Recipients are taken from each certification type&apos;s provider
            contact email (Certifications → Details).
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="cert_req_subject">Subject</Label>
          <Input
            id="cert_req_subject"
            name="subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={!enabled}
          />
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label htmlFor="cert_req_message">Message</Label>
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
                Placeholders are filled when the provider email is composed —
                one email per employee per provider contact.
              </p>
              <ul className="grid gap-2 sm:grid-cols-2">
                {CERTIFICATION_REQUEST_EMAIL_TEMPLATE_CODES.map((item) => (
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
            id="cert_req_message"
            value={message}
            onChange={setMessage}
            disabled={!enabled}
          />
        </div>

        <EmailStaffDocumentsPicker
          name="attach_documents"
          selected={attachDocuments}
          onChange={setAttachDocuments}
          requireAttachments={requireAttachments}
          onRequireAttachmentsChange={setRequireAttachments}
          disabled={!enabled}
          description="Attached from WorkDrive when sending certification request emails."
        />

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
