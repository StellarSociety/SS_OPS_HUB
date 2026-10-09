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
import { savePositionSalaryEmailSettings } from "@/lib/actions/hr-position-salary-email";
import {
  DEFAULT_POSITION_SALARY_EMAIL_TEMPLATES,
  POSITION_SALARY_EMAIL_KIND_HINTS,
  POSITION_SALARY_EMAIL_KIND_LABELS,
  POSITION_SALARY_EMAIL_KINDS,
  POSITION_SALARY_EMAIL_TEMPLATE_CODES,
  type HrPositionSalaryEmailSettings,
  type PositionSalaryEmailKind,
  type PositionSalaryEmailTemplate,
} from "@/lib/hr/position-salary-email";
import type { PayslipEmailRecipientField } from "@/lib/hr/types";
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

export function PositionSalaryEmailSettingsPanel({
  settings,
  connectionFromEmail = "",
  defaultCompanyName,
}: {
  settings: HrPositionSalaryEmailSettings;
  connectionFromEmail?: string;
  /** Legal entity (or venue) name used when the field is left blank. */
  defaultCompanyName: string;
}) {
  const [enabled, setEnabled] = useState(settings.enabled);
  const [recipientField, setRecipientField] =
    useState<PayslipEmailRecipientField>(settings.recipientField);
  const [fromEmail, setFromEmail] = useState(settings.fromEmail);
  const [companyName, setCompanyName] = useState(settings.companyName);
  const [templates, setTemplates] = useState(settings.templates);
  const [active, setActive] = useState<PositionSalaryEmailKind>("promotion");
  const [codesOpen, setCodesOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  const template = templates[active];

  const watch = useMemo(
    () =>
      JSON.stringify({
        enabled,
        recipientField,
        fromEmail,
        companyName,
        templates,
      }),
    [enabled, recipientField, fromEmail, companyName, templates],
  );

  function updateTemplate(patch: Partial<PositionSalaryEmailTemplate>) {
    setTemplates((prev) => ({ ...prev, [active]: { ...prev[active], ...patch } }));
  }

  async function copyCode(code: string) {
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
    const result = await savePositionSalaryEmailSettings(formData);
    if (!result.ok) {
      setStatusError(result.error);
      return result;
    }
    setStatusMessage("Position and salary letter settings saved.");
    return result;
  }

  return (
    <Card className="space-y-6 p-5">
      <div>
        <h2 className="font-serif text-lg text-[#3D421F]">
          Position &amp; Salary Letters
        </h2>
        <p className="mt-1 text-sm text-black/55">
          Letters emailed from Staff → Promotions for a position or salary
          change. Pick the template per employee, then send now or schedule.
          Delivery uses Venue Settings → Email config.
        </p>
      </div>

      <GuardedSettingsForm action={handleSave} className="space-y-6" watch={watch}>
        <input type="hidden" name="enabled" value={enabled ? "true" : "false"} />
        <input type="hidden" name="templates_json" value={JSON.stringify(templates)} />

        <label className="flex items-start gap-2 rounded-lg border border-black/10 bg-[var(--venue-secondary,#F0F3DD)]/35 px-3 py-2.5 text-sm text-[#3D421F]">
          <input
            type="checkbox"
            className="mt-0.5 size-4 rounded border-black/20"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span>
            <span className="block font-medium">
              Enable position and salary letters
            </span>
            <span className="mt-0.5 block text-xs text-black/55">
              When off, the Email action on Promotions shows an error instead of
              the letter.
            </span>
          </span>
        </label>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="ps_recipient_field">Send to employee email</Label>
            <select
              id="ps_recipient_field"
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
            <Label htmlFor="ps_from_email">From email (optional)</Label>
            <Input
              id="ps_from_email"
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
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ps_company_name">Company name</Label>
            <Input
              id="ps_company_name"
              name="company_name"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder={defaultCompanyName}
              disabled={!enabled}
            />
            <p className="text-xs text-black/50">
              Fills {"{{COMPANY_NAME}}"}. Leave blank to use{" "}
              {defaultCompanyName}.
            </p>
          </div>
        </div>

        <div className="space-y-4 rounded-lg border border-black/10 p-4">
          <div
            role="tablist"
            aria-label="Letter templates"
            className="flex flex-wrap gap-1 rounded-lg border border-black/10 bg-white/60 p-1"
          >
            {POSITION_SALARY_EMAIL_KINDS.map((kind) => (
              <button
                key={kind}
                type="button"
                role="tab"
                aria-selected={kind === active}
                onClick={() => setActive(kind)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm transition-colors",
                  kind === active
                    ? "bg-[var(--venue-secondary)] font-medium text-[#3D421F]"
                    : "text-black/55 hover:bg-black/5",
                )}
              >
                {POSITION_SALARY_EMAIL_KIND_LABELS[kind]}
              </button>
            ))}
          </div>
          <p className="text-xs text-black/55">
            {POSITION_SALARY_EMAIL_KIND_HINTS[active]}.
          </p>

          <RequiresAcknowledgementCheckbox
            checked={template.requiresAcknowledgement}
            onChange={(checked) =>
              updateTemplate({ requiresAcknowledgement: checked })
            }
            disabled={!enabled}
            includeHidden={false}
          />

          <div className="space-y-1.5">
            <Label htmlFor="ps_subject">Subject</Label>
            <Input
              id="ps_subject"
              value={template.subject}
              onChange={(e) => updateTemplate({ subject: e.target.value })}
              disabled={!enabled}
            />
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="ps_message">Message</Label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() =>
                    updateTemplate(DEFAULT_POSITION_SALARY_EMAIL_TEMPLATES[active])
                  }
                  className="text-xs font-medium text-black/50 underline-offset-2 hover:text-[#3D421F] hover:underline"
                  disabled={!enabled}
                >
                  Reset to default
                </button>
                <button
                  type="button"
                  aria-expanded={codesOpen}
                  onClick={() => setCodesOpen((value) => !value)}
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
            </div>

            {codesOpen ? (
              <div className="space-y-3 rounded-lg border border-black/10 bg-white/70 p-3">
                <p className="text-xs text-black/55">
                  Click a code to copy it, then paste into the subject or
                  message. Codes are filled per employee from the change.
                </p>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {POSITION_SALARY_EMAIL_TEMPLATE_CODES.map((item) => (
                    <li key={item.code}>
                      <button
                        type="button"
                        className={cn(
                          "flex w-full items-start gap-2 rounded-md border bg-white px-2.5 py-2 text-left transition hover:bg-white/80",
                          copiedCode === item.code
                            ? "border-emerald-300"
                            : "border-black/8",
                        )}
                        onClick={() => void copyCode(item.code)}
                        title={`Copy ${item.code}`}
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

            <EmailMessageEditor
              key={active}
              id="ps_message"
              value={template.message}
              onChange={(message) => updateTemplate({ message })}
              disabled={!enabled}
            />
          </div>
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
