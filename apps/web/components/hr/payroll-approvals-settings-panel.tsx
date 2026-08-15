"use client";

import { ChevronDown, Plus, Star, Trash2 } from "lucide-react";
import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useFormStatus } from "react-dom";
import { EmailMessageEditor } from "@/components/hr/email-message-editor";
import { RequiresAcknowledgementCheckbox } from "@/components/hr/requires-acknowledgement-checkbox";
import { GuardedSettingsForm } from "@/components/settings/guarded-settings-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  savePayrollApprovalsSettings,
  type PayrollApproverCandidate,
} from "@/lib/actions/hr-payroll-approvals";
import {
  createPayrollEmailTemplate,
  PAYROLL_EMAIL_TEMPLATE_CODES,
  type HrPayrollApprovalsSettings,
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

function ApproverPoolEditor({
  title,
  description,
  candidates,
  selected,
  onChange,
}: {
  title: string;
  description: string;
  candidates: PayrollApproverCandidate[];
  selected: Set<string>;
  onChange: Dispatch<SetStateAction<Set<string>>>;
}) {
  const [pickId, setPickId] = useState("");

  const byId = useMemo(() => {
    const map = new Map<string, PayrollApproverCandidate>();
    for (const c of candidates) map.set(c.id, c);
    return map;
  }, [candidates]);

  const assigned = useMemo(() => {
    return [...selected]
      .map((id) => {
        const c = byId.get(id);
        return (
          c ?? {
            id,
            fullName: "Unknown user",
            email: id,
          }
        );
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [selected, byId]);

  const availableOptions = useMemo(
    () =>
      candidates
        .filter((c) => !selected.has(c.id))
        .map((c) => ({
          value: c.id,
          label: `${c.fullName} (${c.email})`,
        })),
    [candidates, selected],
  );

  function addPerson() {
    if (!pickId || selected.has(pickId)) return;
    onChange((prev) => {
      const next = new Set(prev);
      next.add(pickId);
      return next;
    });
    setPickId("");
  }

  function removePerson(id: string) {
    onChange((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-[#3D421F]">{title}</h3>
          <p className="mt-0.5 text-xs text-black/55">{description}</p>
        </div>

        <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:max-w-md sm:flex-row sm:items-center">
          {candidates.length === 0 ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900/80">
              No active hub users found to add.
            </p>
          ) : availableOptions.length === 0 ? (
            <p className="whitespace-nowrap rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-black/45">
              Everyone available is already on this list.
            </p>
          ) : (
            <div className="min-w-0 flex-1 sm:w-64">
              <SearchableSelect
                value={pickId}
                onChange={setPickId}
                options={availableOptions}
                placeholder="Select a person…"
                searchPlaceholder="Search by name or email…"
              />
            </div>
          )}
          <Button
            type="button"
            size="sm"
            className="h-10 shrink-0 self-stretch sm:self-auto"
            disabled={!pickId}
            onClick={addPerson}
          >
            <Plus className="size-3.5" />
            Add
          </Button>
        </div>
      </div>

      {assigned.length === 0 ? (
        <p className="rounded-md border border-dashed border-black/15 bg-white/70 px-3 py-3 text-sm text-black/45">
          No one assigned yet. Add a person above.
        </p>
      ) : (
        <ul className="divide-y divide-black/5 overflow-hidden rounded-lg border border-black/10 bg-white">
          {assigned.map((person) => (
            <li
              key={person.id}
              className="flex items-center gap-3 px-3 py-2.5 text-sm"
            >
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-[#3D421F]">
                  {person.fullName}
                </span>
                <span className="block truncate text-xs text-black/45">
                  {person.email}
                </span>
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 shrink-0 border-black/10 text-red-700 hover:bg-red-50"
                onClick={() => removePerson(person.id)}
                aria-label={`Remove ${person.fullName}`}
              >
                <Trash2 className="size-3.5" />
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-black/40">
        {assigned.length} person{assigned.length === 1 ? "" : "s"} assigned
      </p>
    </section>
  );
}

export type PayrollApprovalsSettingsSection = "approvers" | "emails";

type PayrollApprovalsSettingsPanelProps = {
  settings: HrPayrollApprovalsSettings;
  candidates: PayrollApproverCandidate[];
  section: PayrollApprovalsSettingsSection;
};

export function PayrollApprovalsSettingsPanel({
  settings,
  candidates,
  section,
}: PayrollApprovalsSettingsPanelProps) {
  const [hrReview, setHrReview] = useState(
    () => new Set(settings.hrReviewApproverUserIds),
  );
  const [finalApproval, setFinalApproval] = useState(
    () => new Set(settings.finalApprovalApproverUserIds),
  );
  const [reopen, setReopen] = useState(() => new Set(settings.reopenUserIds));
  const [fromEmail, setFromEmail] = useState(settings.email.fromEmail);
  const [toEmails, setToEmails] = useState(settings.email.toEmails.join("\n"));
  const [templates, setTemplates] = useState<PayrollEmailTemplate[]>(
    settings.email.templates,
  );
  const [defaultTemplateId, setDefaultTemplateId] = useState(
    settings.email.defaultTemplateId,
  );
  const [activeTemplateId, setActiveTemplateId] = useState(
    settings.email.defaultTemplateId || settings.email.templates[0]?.id || "",
  );
  const [attachPayroll, setAttachPayroll] = useState(
    settings.email.attachPayrollExport,
  );
  const [attachGl, setAttachGl] = useState(settings.email.attachGlExport);
  const [attachOther, setAttachOther] = useState(settings.email.attachOther);
  const [autoSendOnFinalApproval, setAutoSendOnFinalApproval] = useState(
    settings.email.autoSendOnFinalApproval,
  );
  const [messageHelpOpen, setMessageHelpOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const activeTemplate =
    templates.find((t) => t.id === activeTemplateId) ?? templates[0] ?? null;

  function updateActiveTemplate(patch: Partial<PayrollEmailTemplate>) {
    if (!activeTemplate) return;
    setTemplates((prev) =>
      prev.map((t) => (t.id === activeTemplate.id ? { ...t, ...patch } : t)),
    );
  }

  function addTemplate() {
    const created = createPayrollEmailTemplate({
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
        hrReview: [...hrReview],
        finalApproval: [...finalApproval],
        reopen: [...reopen],
        fromEmail,
        toEmails,
        templates,
        defaultTemplateId,
        activeTemplateId,
        attachPayroll,
        attachGl,
        attachOther,
        autoSendOnFinalApproval,
      }),
    [
      hrReview,
      finalApproval,
      reopen,
      fromEmail,
      toEmails,
      templates,
      defaultTemplateId,
      activeTemplateId,
      attachPayroll,
      attachGl,
      attachOther,
      autoSendOnFinalApproval,
    ],
  );

  const isApprovers = section === "approvers";

  return (
    <Card className="space-y-6 p-5">
      <div>
        <h2 className="font-serif text-lg text-[#3D421F]">
          {isApprovers ? "Payroll Approvals" : "Payroll email"}
        </h2>
        <p className="mt-1 text-sm text-black/55">
          {isApprovers
            ? "Add or remove people for each payroll workflow step."
            : "Configure recipients, subject, message, and attachments for the payroll package. Delivery uses Venue Settings → Email config."}
        </p>
      </div>

      <GuardedSettingsForm
        action={savePayrollApprovalsSettings}
        className="space-y-6"
        watch={watch}
      >
        <input
          type="hidden"
          name="hr_review_approver_user_ids"
          value={[...hrReview].join(",")}
        />
        <input
          type="hidden"
          name="final_approval_approver_user_ids"
          value={[...finalApproval].join(",")}
        />
        <input
          type="hidden"
          name="reopen_user_ids"
          value={[...reopen].join(",")}
        />
        <input type="hidden" name="from_email" value={fromEmail} />
        <input type="hidden" name="to_emails" value={toEmails} />
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
          name="attach_payroll_export"
          value={attachPayroll ? "true" : "false"}
        />
        <input
          type="hidden"
          name="attach_gl_export"
          value={attachGl ? "true" : "false"}
        />
        <input
          type="hidden"
          name="attach_other"
          value={attachOther ? "true" : "false"}
        />
        <input
          type="hidden"
          name="auto_send_on_final_approval"
          value={autoSendOnFinalApproval ? "true" : "false"}
        />

        {isApprovers ? (
          <div className="space-y-8">
            <ApproverPoolEditor
              title="HR Review"
              description="People who can be asked to approve the HR Review step."
              candidates={candidates}
              selected={hrReview}
              onChange={setHrReview}
            />

            <ApproverPoolEditor
              title="Final Approval"
              description="People who can be asked to approve Final Approval."
              candidates={candidates}
              selected={finalApproval}
              onChange={setFinalApproval}
            />

            <ApproverPoolEditor
              title="Paid / Locked — reopen"
              description="People who can reopen a locked payroll run for alterations."
              candidates={candidates}
              selected={reopen}
              onChange={setReopen}
            />
          </div>
        ) : (
          <div className="space-y-4">
            <label className="flex items-start gap-2 rounded-lg border border-black/10 bg-[var(--venue-secondary,#F0F3DD)]/35 px-3 py-2.5 text-sm text-[#3D421F]">
              <input
                type="checkbox"
                className="mt-0.5 size-4 rounded border-black/20"
                checked={autoSendOnFinalApproval}
                onChange={(e) => setAutoSendOnFinalApproval(e.target.checked)}
              />
              <span>
                <span className="block font-medium">
                  Auto-send after Final Approval
                </span>
                <span className="mt-0.5 block text-xs text-black/55">
                  Sends this email package as soon as Final Approval is
                  approved. You can still resend from Payment Processing.
                </span>
              </span>
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="from_email_ui">Origin (from)</Label>
                <Input
                  id="from_email_ui"
                  type="email"
                  value={fromEmail}
                  onChange={(e) => setFromEmail(e.target.value)}
                  placeholder="people@orillarestaurant.com"
                />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="to_emails_ui">
                  Recipients (one email per line)
                </Label>
                <textarea
                  id="to_emails_ui"
                  rows={3}
                  value={toEmails}
                  onChange={(e) => setToEmails(e.target.value)}
                  className="flex w-full rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-[#3D421F] outline-none focus:border-[var(--venue-primary)]/50 focus:ring-2 focus:ring-[var(--venue-primary)]/20"
                  placeholder="admin@orillarestaurant.com"
                />
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
                    sending the payroll package.
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
                    placeholder="e.g. Paper Chase"
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
                      message. Codes are filled from the payroll run when the
                      email is sent.
                    </p>
                    <ul className="grid gap-2 sm:grid-cols-2">
                      {PAYROLL_EMAIL_TEMPLATE_CODES.map((item) => (
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
                  aria-label="Payroll email message"
                />
                {activeTemplate ? (
                  <RequiresAcknowledgementCheckbox
                    checked={activeTemplate.requiresAcknowledgement === true}
                    onChange={(next) =>
                      updateActiveTemplate({ requiresAcknowledgement: next })
                    }
                    includeHidden={false}
                  />
                ) : null}
              </div>
            </section>

            <div className="space-y-2">
              <p className="text-xs font-medium text-[#3D421F]">Attachments</p>
              <label className="flex items-center gap-2 text-sm text-[#3D421F]">
                <input
                  type="checkbox"
                  className="size-4 rounded border-black/20"
                  checked={attachPayroll}
                  onChange={(e) => setAttachPayroll(e.target.checked)}
                />
                Payroll export Excel file
              </label>
              <label className="flex items-center gap-2 text-sm text-[#3D421F]">
                <input
                  type="checkbox"
                  className="size-4 rounded border-black/20"
                  checked={attachGl}
                  onChange={(e) => setAttachGl(e.target.checked)}
                />
                GL file
              </label>
              <label className="flex items-center gap-2 text-sm text-[#3D421F]">
                <input
                  type="checkbox"
                  className="size-4 rounded border-black/20"
                  checked={attachOther}
                  onChange={(e) => setAttachOther(e.target.checked)}
                />
                Other (optional upload at send time)
              </label>
            </div>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <SaveButton />
        </div>
      </GuardedSettingsForm>
    </Card>
  );
}
