"use client";

import { ChevronDown, X } from "lucide-react";
import { useEffect, useState } from "react";
import { EmailMessageEditor } from "@/components/hr/email-message-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  BOARDING_EMAIL_ACTIONS,
  BOARDING_EMAIL_TEMPLATE_CODES,
  boardingEmailActionLabel,
  boardingEmailUsesFixedRecipients,
  formatBoardingTemplateToEmails,
  parseBoardingTemplateToEmails,
  type BoardingEmailAction,
  type BoardingEmailTemplate,
} from "@/lib/hr/types";
import { cn } from "@/lib/utils";

const selectClass =
  "flex h-9 w-full rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F] outline-none focus:border-[var(--venue-primary)]/50 focus:ring-2 focus:ring-[var(--venue-primary)]/20";

type BoardingEmailTemplateDialogProps = {
  open: boolean;
  mode: "create" | "edit";
  template: BoardingEmailTemplate | null;
  allowedActions: BoardingEmailAction[];
  onClose: () => void;
  onSave: (template: BoardingEmailTemplate) => void;
};

export function BoardingEmailTemplateDialog({
  open,
  mode,
  template,
  allowedActions,
  onClose,
  onSave,
}: BoardingEmailTemplateDialogProps) {
  const [draft, setDraft] = useState<BoardingEmailTemplate | null>(null);
  const [messageHelpOpen, setMessageHelpOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !template) {
      setDraft(null);
      setMessageHelpOpen(false);
      setCopiedCode(null);
      return;
    }
    setDraft({
      ...template,
      toEmails: template.toEmails ?? "",
    });
    setMessageHelpOpen(false);
    setCopiedCode(null);
  }, [open, template]);

  if (!open || !draft) return null;

  const actionOptions = BOARDING_EMAIL_ACTIONS.filter((row) =>
    allowedActions.includes(row.value),
  );
  const actionLocked = allowedActions.length <= 1;
  const usesFixedRecipients = boardingEmailUsesFixedRecipients(draft.action);
  const parsedRecipients = parseBoardingTemplateToEmails(draft.toEmails);
  const canSave =
    Boolean(draft.name.trim()) &&
    Boolean(draft.subject.trim()) &&
    (!usesFixedRecipients || parsedRecipients.length > 0);

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

  function handleSave() {
    if (!draft || !canSave) return;
    const current = draft;
    const action = allowedActions.includes(current.action)
      ? current.action
      : allowedActions[0]!;
    onSave({
      id: current.id,
      name: current.name.trim(),
      subject: current.subject.trim(),
      message: current.message,
      action,
      toEmails: boardingEmailUsesFixedRecipients(action)
        ? formatBoardingTemplateToEmails(
            parseBoardingTemplateToEmails(current.toEmails),
          )
        : "",
    });
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="boarding-tpl-dialog-title"
        className="relative z-10 flex max-h-[min(92vh,760px)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-black/10 bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-black/10 px-5 py-4">
          <div>
            <h2
              id="boarding-tpl-dialog-title"
              className="font-serif text-lg text-[#3D421F]"
            >
              {mode === "create" ? "New email template" : "Edit email template"}
            </h2>
            <p className="mt-0.5 text-sm text-black/50">
              Changes apply when you save this dialog; use Save changes on the
              page to persist settings.
            </p>
          </div>
          <button
            type="button"
            className="rounded-md p-1.5 text-black/45 transition hover:bg-black/5 hover:text-[#3D421F]"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="boarding_tpl_name">Template name</Label>
              <Input
                id="boarding_tpl_name"
                value={draft.name}
                onChange={(e) =>
                  setDraft((prev) =>
                    prev ? { ...prev, name: e.target.value } : prev,
                  )
                }
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="boarding_tpl_action">Action</Label>
              {actionLocked ? (
                <div className="flex h-9 items-center rounded-md border border-black/10 bg-black/[0.03] px-3 text-sm text-[#3D421F]">
                  {boardingEmailActionLabel(draft.action)}
                </div>
              ) : (
                <select
                  id="boarding_tpl_action"
                  className={selectClass}
                  value={draft.action}
                  onChange={(e) => {
                    const action = e.target.value as BoardingEmailAction;
                    setDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            action,
                            toEmails: boardingEmailUsesFixedRecipients(action)
                              ? prev.toEmails
                              : "",
                          }
                        : prev,
                    );
                  }}
                >
                  {actionOptions.map((row) => (
                    <option key={row.value} value={row.value}>
                      {row.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {usesFixedRecipients ? (
            <div className="space-y-1.5">
              <Label htmlFor="boarding_tpl_to">Recipient emails</Label>
              <textarea
                id="boarding_tpl_to"
                rows={3}
                value={draft.toEmails}
                onChange={(e) =>
                  setDraft((prev) =>
                    prev ? { ...prev, toEmails: e.target.value } : prev,
                  )
                }
                placeholder={"one@example.com\nanother@example.com"}
                className="w-full resize-y rounded-md border border-black/10 bg-white px-3 py-2 text-sm text-[#3D421F] outline-none focus:border-[var(--venue-primary)]/50 focus:ring-2 focus:ring-[var(--venue-primary)]/20"
              />
              <p className="text-[11px] text-black/50">
                One email per line (or comma-separated). This template is not
                sent to the employee.
              </p>
              {parsedRecipients.length === 0 ? (
                <p className="text-[11px] text-rose-700">
                  Add at least one recipient email.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="boarding_tpl_subject">Subject</Label>
            <Input
              id="boarding_tpl_subject"
              value={draft.subject}
              onChange={(e) =>
                setDraft((prev) =>
                  prev ? { ...prev, subject: e.target.value } : prev,
                )
              }
            />
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="boarding_tpl_message">Message</Label>
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
              <div className="space-y-3 rounded-lg border border-black/10 bg-[var(--venue-secondary,#F0F3DD)]/25 p-3">
                <p className="text-xs text-black/55">
                  Click a code to copy it, then paste into the subject or
                  message. Codes are filled when the email is sent.
                </p>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {BOARDING_EMAIL_TEMPLATE_CODES.map((item) => (
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
              id="boarding_tpl_message"
              rows={10}
              value={draft.message}
              onChange={(message) =>
                setDraft((prev) => (prev ? { ...prev, message } : prev))
              }
              aria-label="Boarding email message"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-black/10 px-5 py-3">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!canSave}
            onClick={handleSave}
          >
            Save template
          </Button>
        </div>
      </div>
    </div>
  );
}
