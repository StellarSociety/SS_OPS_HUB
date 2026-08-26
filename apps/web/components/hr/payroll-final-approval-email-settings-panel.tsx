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
import { savePayrollFinalApprovalEmailSettings } from "@/lib/actions/hr-payroll-final-approval-email";
import {
  createFinalApprovalEmailTemplate,
  FINAL_APPROVAL_EMAIL_TEMPLATE_CODES,
  type HrPayrollFinalApprovalEmailSettings,
  type PayrollEmailTemplate,
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

export function PayrollFinalApprovalEmailSettingsPanel({
  settings,
  connectionFromEmail = "",
}: {
  settings: HrPayrollFinalApprovalEmailSettings;
  connectionFromEmail?: string;
}) {
  const [fromEmail, setFromEmail] = useState(settings.fromEmail);
  const [attachPdf, setAttachPdf] = useState(settings.attachPdf);
  const [attachExcel, setAttachExcel] = useState(settings.attachExcel);
  const [templates, setTemplates] = useState<PayrollEmailTemplate[]>(
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

  function updateActiveTemplate(patch: Partial<PayrollEmailTemplate>) {
    if (!activeTemplate) return;
    setTemplates((prev) =>
      prev.map((t) => (t.id === activeTemplate.id ? { ...t, ...patch } : t)),
    );
  }

  function addTemplate() {
    const created = createFinalApprovalEmailTemplate({
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
        fromEmail,
        attachPdf,
        attachExcel,
        templates,
        defaultTemplateId,
        activeTemplateId,
      }),
    [
      fromEmail,
      attachPdf,
      attachExcel,
      templates,
      defaultTemplateId,
      activeTemplateId,
    ],
  );

  async function handleSave(formData: FormData) {
    setStatusMessage(null);
    setStatusError(null);
    const result = await savePayrollFinalApprovalEmailSettings(formData);
    if (!result.ok) {
      setStatusError(result.error);
      return result;
    }
    setStatusMessage("Final Approval email settings saved.");
    return result;
  }

  return (
    <Card className="space-y-6 p-5">
      <div>
        <h2 className="font-serif text-lg text-[#3D421F]">
          Final Approval request
        </h2>
        <p className="mt-1 text-sm text-black/55">
          Template and default attachments for emails sent when requesting Final
          Approval. Delivery uses Venue Settings → Email config. Recipients are
          the approvers selected on the payroll run.
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
        <input
          type="hidden"
          name="attach_pdf"
          value={attachPdf ? "true" : "false"}
        />
        <input
          type="hidden"
          name="attach_excel"
          value={attachExcel ? "true" : "false"}
        />

        <div className="space-y-1.5">
          <Label htmlFor="final_approval_from_email">
            From email (optional)
          </Label>
          <Input
            id="final_approval_from_email"
            name="from_email"
            type="email"
            value={fromEmail}
            onChange={(e) => setFromEmail(e.target.value)}
            placeholder={
              connectionFromEmail.trim() ||
              "Set under Venue Settings → Email config"
            }
          />
          <p className="text-xs text-black/50">
            {fromEmail.trim()
              ? "Requests will send from this address."
              : connectionFromEmail.trim()
                ? `Leave blank to send from ${connectionFromEmail.trim()} (Email config).`
                : "Leave blank to use the From address under Venue Settings → Email config."}
          </p>
        </div>

        <section className="space-y-4 rounded-xl border border-black/10 bg-[var(--venue-secondary,#F0F3DD)]/25 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-[#3D421F]">
                Email templates
              </h3>
              <p className="mt-0.5 text-xs text-black/55">
                The default is used when sending a Final Approval request.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className={lightOutlineBtn}
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
                disabled={templates.length <= 1 || !activeTemplate}
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
                disabled={templates.length === 0}
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
                disabled={!activeTemplate}
                placeholder="e.g. Final Approval request"
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
                  disabled={!activeTemplate}
                  onClick={() => {
                    if (activeTemplate)
                      setDefaultTemplateId(activeTemplate.id);
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
            <Label htmlFor="email_subject_ui">Subject</Label>
            <Input
              id="email_subject_ui"
              value={activeTemplate?.subject ?? ""}
              onChange={(e) =>
                updateActiveTemplate({ subject: e.target.value })
              }
              disabled={!activeTemplate}
            />
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="email_message_ui">Message</Label>
              <button
                type="button"
                aria-expanded={messageHelpOpen}
                onClick={() => setMessageHelpOpen((open) => !open)}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#3D421F] underline-offset-2 hover:underline"
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
                  message. Codes are filled from the payroll run when the email
                  is sent.
                </p>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {FINAL_APPROVAL_EMAIL_TEMPLATE_CODES.map((item) => (
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
              id="email_message_ui"
              rows={16}
              value={activeTemplate?.message ?? ""}
              onChange={(message) => updateActiveTemplate({ message })}
              disabled={!activeTemplate}
              aria-label="Final Approval email message"
            />
          </div>
        </section>

        <div className="space-y-2">
          <p className="text-xs font-medium text-[#3D421F]">
            Default attachments
          </p>
          <p className="text-xs text-black/50">
            These are pre-selected in the Request Final Approval dialog. You
            can still change them when sending.
          </p>
          <label className="flex items-center gap-2 text-sm text-[#3D421F]">
            <input
              type="checkbox"
              className="size-4 rounded border-black/20"
              checked={attachPdf}
              onChange={(e) => setAttachPdf(e.target.checked)}
            />
            PDF
          </label>
          <label className="flex items-center gap-2 text-sm text-[#3D421F]">
            <input
              type="checkbox"
              className="size-4 rounded border-black/20"
              checked={attachExcel}
              onChange={(e) => setAttachExcel(e.target.checked)}
            />
            Excel
          </label>
        </div>

        {statusError ? (
          <p className="text-sm text-red-700">{statusError}</p>
        ) : null}
        {statusMessage ? (
          <p className="text-sm text-emerald-800">{statusMessage}</p>
        ) : null}

        <div className="flex justify-end pt-2">
          <SaveButton />
        </div>
      </GuardedSettingsForm>
    </Card>
  );
}
