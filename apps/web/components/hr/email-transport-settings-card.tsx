"use client";

import { useMemo, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { GuardedSettingsForm } from "@/components/settings/guarded-settings-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  saveEmailTransportSettings,
  sendTestEmailTransport,
} from "@/lib/actions/hr-email-transport";
import {
  EMAIL_TRANSPORT_PRESETS,
  type EmailTransportProvider,
  type HrEmailTransportPublicSettings,
} from "@/lib/hr/types";

const selectClass =
  "flex h-9 w-full rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F] outline-none focus:border-[var(--venue-primary)]/50 focus:ring-2 focus:ring-[var(--venue-primary)]/20";

function SaveTransportButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : "Save connection"}
    </Button>
  );
}

function formatVerified(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function EmailTransportSettingsCard({
  settings,
  connectionId = null,
  mode = "edit",
  onCancel,
  onSaved,
}: {
  settings: HrEmailTransportPublicSettings;
  /** Existing connection id when editing; omit/null when adding. */
  connectionId?: string | null;
  mode?: "edit" | "add";
  onCancel?: () => void;
  onSaved?: (connectionId: string) => void;
}) {
  const [provider, setProvider] = useState<EmailTransportProvider>(
    settings.provider,
  );
  const [smtpHost, setSmtpHost] = useState(settings.smtp.host);
  const [smtpPort, setSmtpPort] = useState(String(settings.smtp.port));
  const [secure, setSecure] = useState(settings.smtp.secure);
  const [username, setUsername] = useState(settings.smtp.username);
  const [password, setPassword] = useState("");
  const [fromName, setFromName] = useState(settings.smtp.fromName);
  const [fromEmail, setFromEmail] = useState(settings.smtp.fromEmail);
  const [replyTo, setReplyTo] = useState(settings.smtp.replyTo);
  const [imapEnabled, setImapEnabled] = useState(settings.imap.enabled);
  const [imapHost, setImapHost] = useState(settings.imap.host);
  const [imapPort, setImapPort] = useState(String(settings.imap.port));
  const [sentFolder, setSentFolder] = useState(settings.imap.sentFolder);
  const [hasPassword, setHasPassword] = useState(settings.hasPassword);

  const [testTo, setTestTo] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(
    settings.lastError ?? null,
  );
  const [lastVerifiedAt, setLastVerifiedAt] = useState(settings.lastVerifiedAt);
  const [testPending, startTestTransition] = useTransition();

  const isResend = provider === "resend";

  const watch = useMemo(
    () =>
      [
        provider,
        smtpHost,
        smtpPort,
        String(secure),
        username,
        password,
        fromName,
        fromEmail,
        replyTo,
        String(imapEnabled),
        imapHost,
        imapPort,
        sentFolder,
      ].join("|"),
    [
      provider,
      smtpHost,
      smtpPort,
      secure,
      username,
      password,
      fromName,
      fromEmail,
      replyTo,
      imapEnabled,
      imapHost,
      imapPort,
      sentFolder,
    ],
  );

  function applyPreset(next: EmailTransportProvider) {
    setProvider(next);
    const preset = EMAIL_TRANSPORT_PRESETS[next];
    if (next === "resend") return;
    setSmtpHost(preset.smtp.host);
    setSmtpPort(String(preset.smtp.port));
    setSecure(preset.smtp.secure);
    setImapHost(preset.imap.host);
    setImapPort(String(preset.imap.port));
    setSentFolder("Sent");
    if (next === "zoho") setImapEnabled(true);
  }

  function onSecurityChange(value: string) {
    const nextSecure = value === "ssl";
    setSecure(nextSecure);
    setSmtpPort(nextSecure ? "465" : "587");
  }

  async function handleSave(formData: FormData) {
    setStatusMessage(null);
    setStatusError(null);
    if (connectionId) {
      formData.set("connection_id", connectionId);
    }
    const result = await saveEmailTransportSettings(formData);
    if (!result.ok) {
      setStatusError(result.error);
      return result;
    }
    if (password.trim()) {
      setHasPassword(true);
      setPassword("");
    }
    setStatusMessage("Connection settings saved.");
    onSaved?.(result.connectionId);
    return result;
  }

  function handleTest() {
    startTestTransition(async () => {
      setStatusMessage(null);
      setStatusError(null);
      const fd = new FormData();
      fd.set("test_to", testTo);
      if (connectionId) fd.set("connection_id", connectionId);
      const result = await sendTestEmailTransport(fd);
      if (!result.ok) {
        setStatusError(result.error);
        return;
      }
      setLastVerifiedAt(new Date().toISOString());
      setStatusMessage(result.message);
    });
  }

  const verifiedLabel = formatVerified(lastVerifiedAt);

  return (
    <Card className="space-y-6 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-lg text-[#3D421F]">
            {mode === "add" ? "Add email connection" : "Edit email connection"}
          </h2>
          <p className="mt-1 text-sm text-black/55">
            Send from your mailbox over SMTP and optionally append a copy to Sent
            via IMAP. Change hosts here — no code changes needed.
          </p>
        </div>
        {onCancel ? (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>

      <GuardedSettingsForm
        action={handleSave}
        className="space-y-6"
        watch={watch}
      >
        {connectionId ? (
          <input type="hidden" name="connection_id" value={connectionId} />
        ) : null}
        <div className="space-y-1.5">
          <Label htmlFor="provider">Provider preset</Label>
          <select
            id="provider"
            name="provider"
            className={selectClass}
            value={provider}
            onChange={(e) =>
              applyPreset(e.target.value as EmailTransportProvider)
            }
          >
            {(
              Object.keys(EMAIL_TRANSPORT_PRESETS) as EmailTransportProvider[]
            ).map((key) => (
              <option key={key} value={key}>
                {EMAIL_TRANSPORT_PRESETS[key].label}
              </option>
            ))}
          </select>
          <p className="text-xs text-black/45">
            Presets only fill host/port — every field stays editable.
          </p>
        </div>

        {isResend ? (
          <p className="rounded-lg border border-black/10 bg-[var(--venue-secondary,#F0F3DD)]/40 px-3 py-2.5 text-sm text-[#3D421F]">
            Resend uses <code className="text-xs">RESEND_API_KEY</code> and{" "}
            <code className="text-xs">RESEND_FROM_EMAIL</code> from the server
            environment. Messages will not appear in a Zoho Sent folder.
          </p>
        ) : (
          <>
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-[#3D421F]">
                Outgoing (SMTP)
              </h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="smtp_host">SMTP host</Label>
                  <Input
                    id="smtp_host"
                    name="smtp_host"
                    value={smtpHost}
                    onChange={(e) => setSmtpHost(e.target.value)}
                    placeholder="smtppro.zoho.com"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="smtp_port">SMTP port</Label>
                  <Input
                    id="smtp_port"
                    name="smtp_port"
                    type="number"
                    value={smtpPort}
                    onChange={(e) => setSmtpPort(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="smtp_security">Security</Label>
                  <select
                    id="smtp_security"
                    name="smtp_security"
                    className={selectClass}
                    value={secure ? "ssl" : "starttls"}
                    onChange={(e) => onSecurityChange(e.target.value)}
                  >
                    <option value="ssl">SSL (465)</option>
                    <option value="starttls">STARTTLS (587)</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="smtp_username">Username</Label>
                  <Input
                    id="smtp_username"
                    name="smtp_username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="people@orillarestaurant.com"
                    autoComplete="username"
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="smtp_password">
                    Password / App password
                  </Label>
                  <Input
                    id="smtp_password"
                    name="smtp_password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={
                      hasPassword
                        ? "••••• (saved — leave blank to keep)"
                        : "Mailbox password (or app password if TFA is on)"
                    }
                    autoComplete="new-password"
                  />
                  <p className="text-xs text-black/45">
                    Write-only and encrypted at rest. Leave blank to keep the
                    saved password. With TFA off, use the mailbox password; with
                    TFA on, use an app-specific password.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="from_name">From name</Label>
                  <Input
                    id="from_name"
                    name="from_name"
                    value={fromName}
                    onChange={(e) => setFromName(e.target.value)}
                    placeholder="Orilla People"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="transport_from_email">From email</Label>
                  <Input
                    id="transport_from_email"
                    name="from_email"
                    type="email"
                    value={fromEmail}
                    onChange={(e) => setFromEmail(e.target.value)}
                    placeholder="people@orillarestaurant.com"
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="reply_to">Reply-To (optional)</Label>
                  <Input
                    id="reply_to"
                    name="reply_to"
                    type="email"
                    value={replyTo}
                    onChange={(e) => setReplyTo(e.target.value)}
                    placeholder="Optional"
                  />
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-[#3D421F]">
                Save to Sent (IMAP)
              </h3>
              <label className="flex items-start gap-2 rounded-lg border border-black/10 bg-[var(--venue-secondary,#F0F3DD)]/35 px-3 py-2.5 text-sm text-[#3D421F]">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 rounded border-black/20"
                  checked={imapEnabled}
                  onChange={(e) => setImapEnabled(e.target.checked)}
                />
                <span>
                  <span className="block font-medium">
                    Save a copy to Sent folder
                  </span>
                  <span className="mt-0.5 block text-xs text-black/55">
                    SMTP alone does not put mail in Sent. IMAP APPEND copies the
                    exact message after sending. Uses the same username/password
                    as SMTP.
                  </span>
                </span>
              </label>
              <input
                type="hidden"
                name="imap_enabled"
                value={imapEnabled ? "true" : "false"}
              />
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="imap_host">IMAP host</Label>
                  <Input
                    id="imap_host"
                    name="imap_host"
                    value={imapHost}
                    onChange={(e) => setImapHost(e.target.value)}
                    placeholder="imappro.zoho.com"
                    disabled={!imapEnabled}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="imap_port">IMAP port</Label>
                  <Input
                    id="imap_port"
                    name="imap_port"
                    type="number"
                    value={imapPort}
                    onChange={(e) => setImapPort(e.target.value)}
                    disabled={!imapEnabled}
                  />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="sent_folder">Sent folder name</Label>
                  <Input
                    id="sent_folder"
                    name="sent_folder"
                    value={sentFolder}
                    onChange={(e) => setSentFolder(e.target.value)}
                    placeholder="Sent"
                    disabled={!imapEnabled}
                  />
                </div>
              </div>
            </section>
          </>
        )}

        {/* Hidden fields so Resend save still posts a complete shape */}
        {isResend ? (
          <>
            <input type="hidden" name="smtp_host" value="" />
            <input type="hidden" name="smtp_port" value="465" />
            <input type="hidden" name="smtp_security" value="ssl" />
            <input type="hidden" name="smtp_username" value="" />
            <input type="hidden" name="smtp_password" value="" />
            <input type="hidden" name="from_name" value={fromName} />
            <input type="hidden" name="from_email" value={fromEmail} />
            <input type="hidden" name="reply_to" value={replyTo} />
            <input type="hidden" name="imap_enabled" value="false" />
            <input type="hidden" name="imap_host" value="" />
            <input type="hidden" name="imap_port" value="993" />
            <input type="hidden" name="sent_folder" value="Sent" />
          </>
        ) : null}

        <div className="flex justify-end pt-1">
          <SaveTransportButton />
        </div>
      </GuardedSettingsForm>

      <div className="space-y-3 border-t border-black/8 pt-5">
        <h3 className="text-sm font-semibold text-[#3D421F]">Send test email</h3>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Label htmlFor="test_to">Recipient</Label>
            <Input
              id="test_to"
              type="email"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <Button
            type="button"
            size="sm"
            className="h-9 shrink-0"
            disabled={testPending || !testTo.trim()}
            onClick={handleTest}
          >
            {testPending ? "Sending…" : "Send test email"}
          </Button>
        </div>
        <p className="text-xs text-black/45">
          {verifiedLabel
            ? `Last verified: ${verifiedLabel}`
            : "Not verified yet — send a test after saving connection settings."}
        </p>
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
      </div>
    </Card>
  );
}
