"use client";

import { Pencil, Plus, Star, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { BoardingEmailTemplateDialog } from "@/components/hr/boarding-email-template-dialog";
import { GuardedSettingsForm } from "@/components/settings/guarded-settings-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveBoardingEmailSettings } from "@/lib/actions/hr-boarding-email";
import { OFFBOARDING_CHECKLIST_STEPS } from "@/lib/hr/offboarding-process";
import {
  BOARDING_EMAIL_SETTINGS_STEPS,
  boardingEmailActionLabel,
  boardingEmailUsesFixedRecipients,
  createBoardingEmailTemplate,
  parseBoardingTemplateToEmails,
  templatesForBoardingEmailStep,
  type BoardingEmailSettingsStepId,
  type BoardingEmailTemplate,
  type HrBoardingEmailSettings,
  type PayslipEmailRecipientField,
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

type TemplateDialogState = {
  mode: "create" | "edit";
  stepId: BoardingEmailSettingsStepId;
  template: BoardingEmailTemplate;
};

export function BoardingEmailSettingsPanel({
  settings,
}: {
  settings: HrBoardingEmailSettings;
}) {
  const [enabled, setEnabled] = useState(settings.enabled);
  const [recipientField, setRecipientField] =
    useState<PayslipEmailRecipientField>(settings.recipientField);
  const [fromEmail, setFromEmail] = useState(settings.fromEmail);
  const [templates, setTemplates] = useState<BoardingEmailTemplate[]>(
    settings.templates,
  );
  const [defaultTemplateByAction, setDefaultTemplateByAction] = useState(
    settings.defaultTemplateByAction,
  );
  const [dialog, setDialog] = useState<TemplateDialogState | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  const stages = useMemo(
    () =>
      BOARDING_EMAIL_SETTINGS_STEPS.map((step) => {
        const meta = OFFBOARDING_CHECKLIST_STEPS.find((s) => s.id === step.id);
        return {
          ...step,
          number: meta?.number ?? 0,
          label: meta?.label ?? step.id,
          description: meta?.description ?? "",
          templates: templatesForBoardingEmailStep(templates, step.id),
        };
      }),
    [templates],
  );

  function openCreate(stepId: BoardingEmailSettingsStepId) {
    const step = BOARDING_EMAIL_SETTINGS_STEPS.find((s) => s.id === stepId);
    if (!step) return;
    const action = step.defaultAddAction;
    const count = templates.filter((t) => t.action === action).length;
    const created = createBoardingEmailTemplate({
      action,
      name: `${boardingEmailActionLabel(action)} ${count + 1}`,
    });
    setDialog({ mode: "create", stepId, template: created });
  }

  function openEdit(
    stepId: BoardingEmailSettingsStepId,
    template: BoardingEmailTemplate,
  ) {
    setDialog({ mode: "edit", stepId, template: { ...template } });
  }

  function handleDialogSave(next: BoardingEmailTemplate) {
    if (!dialog) return;
    if (dialog.mode === "create") {
      setTemplates((prev) => [...prev, next]);
      setDefaultTemplateByAction((prev) => {
        if (prev[next.action]) return prev;
        return { ...prev, [next.action]: next.id };
      });
    } else {
      const previous = dialog.template;
      setTemplates((prev) =>
        prev.map((t) => (t.id === next.id ? next : t)),
      );
      if (previous.action !== next.action) {
        setDefaultTemplateByAction((prev) => {
          const updated = { ...prev };
          if (prev[previous.action] === previous.id) {
            const replacement = templates.find(
              (t) => t.id !== previous.id && t.action === previous.action,
            );
            if (replacement) {
              updated[previous.action] = replacement.id;
            }
          }
          const defaultId = prev[next.action];
          const defaultStillValid =
            defaultId === next.id ||
            templates.some(
              (t) =>
                t.id === defaultId &&
                t.id !== previous.id &&
                t.action === next.action,
            );
          if (!defaultStillValid) {
            updated[next.action] = next.id;
          }
          return updated;
        });
      }
    }
    setDialog(null);
  }

  function setDefault(template: BoardingEmailTemplate) {
    setDefaultTemplateByAction((prev) => ({
      ...prev,
      [template.action]: template.id,
    }));
  }

  function deleteTemplate(template: BoardingEmailTemplate) {
    if (templates.length <= 1) {
      window.alert("Keep at least one email template.");
      return;
    }
    if (
      !window.confirm(
        `Delete template “${template.name}”? This cannot be undone until you save.`,
      )
    ) {
      return;
    }
    const remaining = templates.filter((t) => t.id !== template.id);
    setTemplates(remaining);
    setDefaultTemplateByAction((prev) => {
      if (prev[template.action] !== template.id) return prev;
      const replacement = remaining.find((t) => t.action === template.action);
      return {
        ...prev,
        [template.action]: replacement?.id ?? remaining[0]!.id,
      };
    });
  }

  const watch = useMemo(
    () =>
      JSON.stringify({
        enabled,
        recipientField,
        fromEmail,
        templates,
        defaultTemplateByAction,
      }),
    [enabled, recipientField, fromEmail, templates, defaultTemplateByAction],
  );

  async function handleSave(formData: FormData) {
    setStatusMessage(null);
    setStatusError(null);
    const result = await saveBoardingEmailSettings(formData);
    if (!result.ok) {
      setStatusError(result.error);
      return result;
    }
    setStatusMessage("Boarding email settings saved.");
    return result;
  }

  const dialogStep = dialog
    ? BOARDING_EMAIL_SETTINGS_STEPS.find((s) => s.id === dialog.stepId)
    : null;

  return (
    <Card className="space-y-6 p-5">
      <div>
        <h2 className="font-serif text-lg text-[#3D421F]">Off-Boarding email</h2>
        <p className="mt-1 text-sm text-black/55">
          Templates grouped by offboarding checklist stage. Delivery uses
          Connection / Transport.
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
          name="default_template_by_action_json"
          value={JSON.stringify(defaultTemplateByAction)}
        />

        <label className="flex items-start gap-2 rounded-lg border border-black/10 bg-[var(--venue-secondary,#F0F3DD)]/35 px-3 py-2.5 text-sm text-[#3D421F]">
          <input
            type="checkbox"
            className="mt-0.5 size-4 rounded border-black/20"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span>
            <span className="block font-medium">Enable boarding emails</span>
            <span className="mt-0.5 block text-xs text-black/55">
              When off, send actions from offboarding stay unavailable.
            </span>
          </span>
        </label>
        <input
          type="hidden"
          name="enabled"
          value={enabled ? "true" : "false"}
        />

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="boarding_recipient_field">
              Send to employee email
            </Label>
            <select
              id="boarding_recipient_field"
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
            <Label htmlFor="boarding_from_email">From email (optional)</Label>
            <Input
              id="boarding_from_email"
              name="from_email"
              type="email"
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
              placeholder="Uses Connection / Transport if blank"
              disabled={!enabled}
            />
          </div>
        </div>

        <section className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-[#3D421F]">
              Email templates by checklist stage
            </h3>
            <p className="mt-0.5 text-xs text-black/55">
              Add or edit templates per stage. Set one default per email action
              for offboarding sends.
            </p>
          </div>

          <div className="space-y-4">
            {stages.map((stage) => (
              <div
                key={stage.id}
                className="space-y-3 rounded-xl border border-black/10 bg-[var(--venue-secondary,#F0F3DD)]/25 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-black/45">
                      Stage {stage.number}
                    </p>
                    <h4 className="mt-0.5 text-sm font-semibold text-[#3D421F]">
                      {stage.label}
                    </h4>
                    {stage.description ? (
                      <p className="mt-0.5 text-xs text-black/55">
                        {stage.description}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className={lightOutlineBtn}
                    disabled={!enabled}
                    onClick={() => openCreate(stage.id)}
                  >
                    <Plus className="size-3.5" />
                    Add template
                  </Button>
                </div>

                {stage.templates.length === 0 ? (
                  <p className="rounded-md border border-dashed border-black/15 bg-white/50 px-3 py-4 text-center text-sm text-black/45">
                    No templates for this stage yet.
                  </p>
                ) : (
                  <ul className="divide-y divide-black/8 overflow-hidden rounded-lg border border-black/10 bg-white/80">
                    {stage.templates.map((template) => {
                      const isDefault =
                        defaultTemplateByAction[template.action] ===
                        template.id;
                      return (
                        <li
                          key={template.id}
                          className="flex flex-wrap items-center gap-3 px-3 py-2.5"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-sm font-medium text-[#3D421F]">
                                {template.name}
                              </p>
                              {isDefault ? (
                                <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-900">
                                  <Star className="size-3 fill-current" />
                                  Default
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-0.5 text-xs text-black/50">
                              {boardingEmailActionLabel(template.action)}
                              {template.subject
                                ? ` · ${template.subject}`
                                : ""}
                            </p>
                            {boardingEmailUsesFixedRecipients(
                              template.action,
                            ) ? (
                              <p className="mt-0.5 text-xs text-black/50">
                                {(() => {
                                  const emails = parseBoardingTemplateToEmails(
                                    template.toEmails,
                                  );
                                  return emails.length > 0
                                    ? `To: ${emails.join(", ")}`
                                    : "To: not set — edit template to add recipients";
                                })()}
                              </p>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className={cn(lightOutlineBtn, "h-8 px-2.5")}
                              disabled={!enabled}
                              onClick={() => openEdit(stage.id, template)}
                            >
                              <Pencil className="size-3.5" />
                              Edit
                            </Button>
                            {!isDefault ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className={cn(lightOutlineBtn, "h-8 px-2.5")}
                                disabled={!enabled}
                                onClick={() => setDefault(template)}
                              >
                                <Star className="size-3.5" />
                                Set default
                              </Button>
                            ) : null}
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className={cn(
                                lightOutlineBtn,
                                "h-8 px-2.5 text-red-800 hover:bg-red-50 hover:text-red-900",
                              )}
                              disabled={!enabled || templates.length <= 1}
                              onClick={() => deleteTemplate(template)}
                            >
                              <Trash2 className="size-3.5" />
                              Delete
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </section>

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

      <BoardingEmailTemplateDialog
        open={dialog != null}
        mode={dialog?.mode ?? "edit"}
        template={dialog?.template ?? null}
        allowedActions={dialogStep?.allowedActions ?? []}
        onClose={() => setDialog(null)}
        onSave={handleDialogSave}
      />
    </Card>
  );
}
