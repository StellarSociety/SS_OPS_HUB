"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { EmailMessageEditor } from "@/components/hr/email-message-editor";
import { EmailStaffDocumentsPicker } from "@/components/hr/email-staff-documents-picker";
import { GuardedSettingsForm } from "@/components/settings/guarded-settings-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveInsuranceRequestEmailSettings } from "@/lib/actions/hr-insurance";
import {
  INSURANCE_REQUEST_EMAIL_TEMPLATE_CODES,
  type HrEmailStaffDocumentKey,
  type HrInsuranceRequestEmailSettings,
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

function TemplateCodesHelp({
  open,
  onToggle,
  copiedCode,
  onCopy,
  disabled,
}: {
  open: boolean;
  onToggle: () => void;
  copiedCode: string | null;
  onCopy: (code: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="inline-flex items-center gap-1 text-xs font-medium text-[#3D421F] underline-offset-2 hover:underline"
        disabled={disabled}
      >
        Template codes
        <ChevronDown
          className={cn(
            "size-3.5 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open ? (
        <div className="space-y-3 rounded-lg border border-black/10 bg-white/70 p-3">
          <p className="text-xs text-black/55">
            Click a code to copy it, then paste into the subject or message.
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {INSURANCE_REQUEST_EMAIL_TEMPLATE_CODES.map((item) => (
              <li key={item.code}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full items-start gap-2 rounded-md border bg-white px-2.5 py-2 text-left transition hover:bg-white/80",
                    copiedCode === item.code
                      ? "border-emerald-300"
                      : "border-black/8",
                  )}
                  onClick={() => onCopy(item.code)}
                  title={`Copy ${item.code}`}
                  disabled={disabled}
                >
                  <code className="shrink-0 rounded bg-[var(--venue-secondary,#F0F3DD)]/60 px-1.5 py-0.5 text-[11px] font-semibold text-[#3D421F]">
                    {item.code}
                  </code>
                  <span className="min-w-0 flex-1 text-[11px] leading-snug text-black/55">
                    {copiedCode === item.code ? "Copied" : item.description}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function InsuranceRequestEmailSettingsPanel({
  settings,
  connectionFromEmail = "",
}: {
  settings: HrInsuranceRequestEmailSettings;
  connectionFromEmail?: string;
}) {
  const [enabled, setEnabled] = useState(settings.enabled);
  const [fromEmail, setFromEmail] = useState(settings.fromEmail);
  const [issueSubject, setIssueSubject] = useState(settings.issueSubject);
  const [issueMessage, setIssueMessage] = useState(settings.issueMessage);
  const [renewSubject, setRenewSubject] = useState(settings.renewSubject);
  const [renewMessage, setRenewMessage] = useState(settings.renewMessage);
  const [issueAttachDocuments, setIssueAttachDocuments] = useState<
    HrEmailStaffDocumentKey[]
  >(settings.issueAttachDocuments);
  const [renewAttachDocuments, setRenewAttachDocuments] = useState<
    HrEmailStaffDocumentKey[]
  >(settings.renewAttachDocuments);
  const [issueRequireAttachments, setIssueRequireAttachments] = useState(
    settings.issueRequireAttachments !== false,
  );
  const [renewRequireAttachments, setRenewRequireAttachments] = useState(
    settings.renewRequireAttachments !== false,
  );
  const [issueHelpOpen, setIssueHelpOpen] = useState(false);
  const [renewHelpOpen, setRenewHelpOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  useEffect(() => {
    setEnabled(settings.enabled);
    setFromEmail(settings.fromEmail);
    setIssueSubject(settings.issueSubject);
    setIssueMessage(settings.issueMessage);
    setRenewSubject(settings.renewSubject);
    setRenewMessage(settings.renewMessage);
    setIssueAttachDocuments(settings.issueAttachDocuments);
    setRenewAttachDocuments(settings.renewAttachDocuments);
    setIssueRequireAttachments(settings.issueRequireAttachments !== false);
    setRenewRequireAttachments(settings.renewRequireAttachments !== false);
  }, [settings]);

  const watch = useMemo(
    () =>
      JSON.stringify({
        enabled,
        fromEmail,
        issueSubject,
        issueMessage,
        renewSubject,
        renewMessage,
        issueAttachDocuments,
        renewAttachDocuments,
        issueRequireAttachments,
        renewRequireAttachments,
      }),
    [
      enabled,
      fromEmail,
      issueSubject,
      issueMessage,
      renewSubject,
      renewMessage,
      issueAttachDocuments,
      renewAttachDocuments,
      issueRequireAttachments,
      renewRequireAttachments,
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
    const result = await saveInsuranceRequestEmailSettings(formData);
    if (!result.ok) {
      setStatusError(result.error);
      return result;
    }
    setStatusMessage("Insurance request email settings saved.");
    return result;
  }

  return (
    <Card className="space-y-6 p-5">
      <div>
        <h2 className="font-serif text-lg text-[#3D421F]">
          Insurance request email
        </h2>
        <p className="mt-1 text-sm text-black/55">
          Separate templates for issue and renew requests sent to insurance
          providers from Staff Compliance → Insurance → Employees. Delivery uses
          Venue Settings → Email config.
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
              Enable insurance request emails
            </span>
            <span className="mt-0.5 block text-xs text-black/55">
              When off, Email request on the Insurance employees page cannot
              send.
            </span>
          </span>
        </label>
        <input
          type="hidden"
          name="enabled"
          value={enabled ? "true" : "false"}
        />

        <div className="space-y-1.5">
          <Label htmlFor="ins_req_from_email">From email (optional)</Label>
          <Input
            id="ins_req_from_email"
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
            Recipients are taken from each provider&apos;s contact email
            (Insurance → Provider).
          </p>
        </div>

        <div className="space-y-4 rounded-lg border border-black/10 bg-[var(--venue-secondary,#F0F3DD)]/25 p-4">
          <div>
            <p className="text-sm font-medium text-[#3D421F]">Issue template</p>
            <p className="mt-0.5 text-xs text-black/45">
              Used when the request type is Issue (new policy).
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ins_req_issue_subject">Subject</Label>
            <Input
              id="ins_req_issue_subject"
              name="issue_subject"
              value={issueSubject}
              onChange={(e) => setIssueSubject(e.target.value)}
              disabled={!enabled}
            />
          </div>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="ins_req_issue_message">Message</Label>
              <TemplateCodesHelp
                open={issueHelpOpen}
                onToggle={() => setIssueHelpOpen((o) => !o)}
                copiedCode={copiedCode}
                onCopy={(code) => void copyTemplateCode(code)}
                disabled={!enabled}
              />
            </div>
            <input type="hidden" name="issue_message" value={issueMessage} />
            <EmailMessageEditor
              id="ins_req_issue_message"
              value={issueMessage}
              onChange={setIssueMessage}
              disabled={!enabled}
            />
          </div>
          <EmailStaffDocumentsPicker
            name="issue_attach_documents"
            selected={issueAttachDocuments}
            onChange={setIssueAttachDocuments}
            requireAttachments={issueRequireAttachments}
            onRequireAttachmentsChange={setIssueRequireAttachments}
            disabled={!enabled}
            description="Attached from WorkDrive when sending Issue emails."
          />
        </div>

        <div className="space-y-4 rounded-lg border border-black/10 bg-[var(--venue-secondary,#F0F3DD)]/25 p-4">
          <div>
            <p className="text-sm font-medium text-[#3D421F]">Renew template</p>
            <p className="mt-0.5 text-xs text-black/45">
              Used when the request type is Renew (existing policy).
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ins_req_renew_subject">Subject</Label>
            <Input
              id="ins_req_renew_subject"
              name="renew_subject"
              value={renewSubject}
              onChange={(e) => setRenewSubject(e.target.value)}
              disabled={!enabled}
            />
          </div>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="ins_req_renew_message">Message</Label>
              <TemplateCodesHelp
                open={renewHelpOpen}
                onToggle={() => setRenewHelpOpen((o) => !o)}
                copiedCode={copiedCode}
                onCopy={(code) => void copyTemplateCode(code)}
                disabled={!enabled}
              />
            </div>
            <input type="hidden" name="renew_message" value={renewMessage} />
            <EmailMessageEditor
              id="ins_req_renew_message"
              value={renewMessage}
              onChange={setRenewMessage}
              disabled={!enabled}
            />
          </div>
          <EmailStaffDocumentsPicker
            name="renew_attach_documents"
            selected={renewAttachDocuments}
            onChange={setRenewAttachDocuments}
            requireAttachments={renewRequireAttachments}
            onRequireAttachmentsChange={setRenewRequireAttachments}
            disabled={!enabled}
            description="Attached from WorkDrive when sending Renew emails."
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
