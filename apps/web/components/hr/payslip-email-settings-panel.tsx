"use client";

import { ChevronDown, Plus, Star, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { EmailMessageEditor } from "@/components/hr/email-message-editor";
import { GuardedSettingsForm } from "@/components/settings/guarded-settings-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { savePayslipEmailSettings } from "@/lib/actions/hr-payslip-email";
import {
  createPayslipEmailTemplate,
  PAYSLIP_EMAIL_TEMPLATE_CODES,
  type HrPayslipEmailSettings,
  type PayslipEmailRecipientField,
  type PayslipEmailTemplate,
} from "@/lib/hr/types";
import { cn } from "@/lib/utils";

const selectClass =
  "flex h-9 w-full rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F] outline-none focus:border-[var(--venue-primary)]/50 focus:ring-2 focus:ring-[var(--venue-primary)]/20";

const lightOutlineBtn =
  "h-8 border-black/15 text-[#3D421F] hover:bg-black/5 hover:text-[#3D421F]";

function SaveButton({ label = "Save changes" }: { label?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

export function PayslipEmailSettingsPanel({
  settings,
  connectionFromEmail = "",
}: {
  settings: HrPayslipEmailSettings;
  /** From address configured under Emails → Connection. */
  connectionFromEmail?: string;
}) {
  const [enabled, setEnabled] = useState(settings.enabled);
  const [recipientField, setRecipientField] =
    useState<PayslipEmailRecipientField>(settings.recipientField);
  const [fromEmail, setFromEmail] = useState(settings.fromEmail);
  const [attachPdf, setAttachPdf] = useState(settings.attachPdf);
  const [autoSendOnPaid, setAutoSendOnPaid] = useState(settings.autoSendOnPaid);
  const [templates, setTemplates] = useState<PayslipEmailTemplate[]>(
    settings.templates,
  );
  const [defaultTemplateId, setDefaultTemplateId] = useState(
    settings.defaultTemplateId,
  );
  const [activeTemplateId, setActiveTemplateId] = useState(
    settings.defaultTemplateId || settings.templates[0]?.id || "",
  );
  const [messageHelpOpen, setMessageHelpOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  const activeTemplate =
    templates.find((t) => t.id === activeTemplateId) ?? templates[0] ?? null;

  function updateActiveTemplate(patch: Partial<PayslipEmailTemplate>) {
    if (!activeTemplate) return;
    setTemplates((prev) =>
      prev.map((t) => (t.id === activeTemplate.id ? { ...t, ...patch } : t)),
    );
  }

  function addTemplate() {
    const created = createPayslipEmailTemplate({
      name: `Template ${templates.length + 1}`,
      subject: activeTemplate?.subject,
      message: activeTemplate?.message,
    });
    setTemplates((prev) => [...prev, created]);
    setActiveTemplateId(created.id);
  }

  function deleteActiveTemplate() {
    if (!activeTemplate || templates.length <= 1) return;
    if (
      !window.confirm(
        `Delete template “${activeTemplate.name}”? This cannot be undone until you save.`,
      )
    ) {
      return;
    }
    const remaining = templates.filter((t) => t.id !== activeTemplate.id);
    setTemplates(remaining);
    const nextDefault =
      defaultTemplateId === activeTemplate.id
        ? remaining[0]!.id
        : defaultTemplateId;
    setDefaultTemplateId(nextDefault);
    setActiveTemplateId(
      remaining.find((t) => t.id === nextDefault)?.id ?? remaining[0]!.id,
    );
  }

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

  const watch = useMemo(
    () =>
      JSON.stringify({
        enabled,
        recipientField,
        fromEmail,
        attachPdf,
        autoSendOnPaid,
        templates,
        defaultTemplateId,
        activeTemplateId,
      }),
    [
      enabled,
      recipientField,
      fromEmail,
      attachPdf,
      autoSendOnPaid,
      templates,
      defaultTemplateId,
      activeTemplateId,
    ],
  );

  async function handleSave(formData: FormData) {
    setStatusMessage(null);
    setStatusError(null);
    const result = await savePayslipEmailSettings(formData);
    if (!result.ok) {
      setStatusError(result.error);
      return result;
    }
    setStatusMessage("Payslip email settings saved.");
    return result;
  }

  return (
    <Card className="space-y-6 p-5">
      <div>
        <h2 className="font-serif text-lg text-[#3D421F]">Payslips</h2>
        <p className="mt-1 text-sm text-black/55">
          Configure how individual payslip emails are sent to employees. Delivery
          uses Connection / Transport.
        </p>
      </div>

      <GuardedSettingsForm
        action={handleSave}
        className="space-y-6"
        watch={watch}
      >
        <input
          type="hidden"
          name="templates_json"
          value={JSON.stringify(templates)}
        />
        <input
          type="hidden"
          name="default_template_id"
          value={defaultTemplateId}
        />

        <label className="flex items-start gap-2 rounded-lg border border-black/10 bg-[var(--venue-secondary,#F0F3DD)]/35 px-3 py-2.5 text-sm text-[#3D421F]">
          <input
            type="checkbox"
            className="mt-0.5 size-4 rounded border-black/20"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span>
            <span className="block font-medium">Enable payslip emails</span>
            <span className="mt-0.5 block text-xs text-black/55">
              When off, send actions stay unavailable until this is enabled.
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
            checked={autoSendOnPaid}
            onChange={(e) => setAutoSendOnPaid(e.target.checked)}
            disabled={!enabled}
          />
          <span>
            <span className="block font-medium">
              Auto-send when payroll is marked Paid
            </span>
            <span className="mt-0.5 block text-xs text-black/55">
              Sends each employee their payslip after the run is marked paid.
            </span>
          </span>
        </label>
        <input
          type="hidden"
          name="auto_send_on_paid"
          value={autoSendOnPaid ? "true" : "false"}
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
            <Label htmlFor="payslip_from_email">From email (optional)</Label>
            <Input
              id="payslip_from_email"
              name="from_email"
              type="email"
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
              placeholder={
                connectionFromEmail.trim() || "Set under Emails → Connection"
              }
              disabled={!enabled}
            />
            <p className="text-xs text-black/50">
              {fromEmail.trim()
                ? "Payslips will send from this address."
                : connectionFromEmail.trim()
                  ? `Leave blank to send from ${connectionFromEmail.trim()} (Connection).`
                  : "Leave blank to use the From address under Emails → Connection."}
            </p>
          </div>
        </div>

        <section className="space-y-4 rounded-xl border border-black/10 bg-[var(--venue-secondary,#F0F3DD)]/25 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-[#3D421F]">
                Email templates
              </h3>
              <p className="mt-0.5 text-xs text-black/55">
                Create and edit message templates. The default is used when
                sending payslips.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className={lightOutlineBtn}
                disabled={!enabled}
                onClick={addTemplate}
              >
                <Plus className="size-3.5" />
                New template
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className={lightOutlineBtn}
                disabled={!enabled || templates.length <= 1 || !activeTemplate}
                onClick={deleteActiveTemplate}
              >
                <Trash2 className="size-3.5" />
                Delete
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1 space-y-1.5">
              <Label htmlFor="active_template">Template</Label>
              <select
                id="active_template"
                className={selectClass}
                value={activeTemplate?.id ?? ""}
                onChange={(e) => setActiveTemplateId(e.target.value)}
                disabled={!enabled || templates.length === 0}
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.id === defaultTemplateId ? " (default)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              <Label htmlFor="template_name">Template name</Label>
              <Input
                id="template_name"
                value={activeTemplate?.name ?? ""}
                onChange={(e) =>
                  updateActiveTemplate({ name: e.target.value })
                }
                disabled={!enabled || !activeTemplate}
                placeholder="e.g. Standard payslip"
                className="h-9"
              />
            </div>
            <div className="flex shrink-0 items-center gap-2 pb-0.5">
              {activeTemplate?.id === defaultTemplateId ? (
                <span className="inline-flex h-9 items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-medium text-emerald-900">
                  <Star className="size-3.5 fill-current" />
                  Default
                </span>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className={cn(lightOutlineBtn, "h-9")}
                  disabled={!enabled || !activeTemplate}
                  onClick={() => {
                    if (activeTemplate) setDefaultTemplateId(activeTemplate.id);
                  }}
                >
                  <Star className="size-3.5" />
                  Mark default
                </Button>
              )}
              <SaveButton label="Save" />
            </div>
          </div>

          <hr className="border-black/10" />

          <div className="space-y-1.5">
            <Label htmlFor="payslip_subject">Subject</Label>
            <Input
              id="payslip_subject"
              value={activeTemplate?.subject ?? ""}
              onChange={(e) =>
                updateActiveTemplate({ subject: e.target.value })
              }
              disabled={!enabled || !activeTemplate}
            />
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="payslip_message">Message</Label>
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
                  Click a code to copy it, then paste into the subject or
                  message. Codes are filled per employee when the email is sent.
                </p>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {PAYSLIP_EMAIL_TEMPLATE_CODES.map((item) => (
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

            <EmailMessageEditor
              id="payslip_message"
              rows={12}
              value={activeTemplate?.message ?? ""}
              onChange={(message) => updateActiveTemplate({ message })}
              disabled={!enabled || !activeTemplate}
              aria-label="Payslip email message"
            />
          </div>
        </section>

        <label className="flex items-center gap-2 text-sm text-[#3D421F]">
          <input
            type="checkbox"
            className="size-4 rounded border-black/20"
            checked={attachPdf}
            onChange={(e) => setAttachPdf(e.target.checked)}
            disabled={!enabled}
          />
          Attach payslip PDF
        </label>
        <input
          type="hidden"
          name="attach_pdf"
          value={attachPdf ? "true" : "false"}
        />

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
      </GuardedSettingsForm>
    </Card>
  );
}
