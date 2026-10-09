"use client";

import { ChevronDown, Loader2 } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { RichTextEditor } from "@/components/hr/rich-text-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { savePolicy } from "@/lib/actions/hr-policies";
import {
  DEFAULT_POLICY_MESSAGE,
  POLICY_TEMPLATE_CODES,
  type PolicyTemplate,
} from "@/lib/hr/policies";
import { cn } from "@/lib/utils";

export function PolicyEditorDialog({
  policy,
  onClose,
  onSaved,
}: {
  /** Null creates a new policy. */
  policy: PolicyTemplate | null;
  onClose: () => void;
  onSaved: (policy: PolicyTemplate) => void;
}) {
  const [title, setTitle] = useState(policy?.title ?? "");
  const [description, setDescription] = useState(policy?.description ?? "");
  const [subject, setSubject] = useState(
    policy?.subject ?? "{{POLICY_TITLE}} — please read and acknowledge",
  );
  const [message, setMessage] = useState(policy?.message ?? DEFAULT_POLICY_MESSAGE);
  const [codesOpen, setCodesOpen] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wordingChanged =
    policy != null && (policy.subject !== subject || policy.message !== message);

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

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    const result = await savePolicy({
      id: policy?.id ?? null,
      title,
      description,
      subject,
      message,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved(result.policy);
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (!saving && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="policy-editor-title"
        className="flex max-h-[min(94dvh,60rem)] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-black/10 bg-white shadow-xl"
      >
        <div className="border-b border-black/8 px-6 py-4">
          <h2 id="policy-editor-title" className="font-serif text-xl text-[#3D421F]">
            {policy ? "Edit policy" : "New policy"}
          </h2>
          <p className="mt-1 text-sm text-black/55">
            Employees receive this as an email with an acknowledgement button.
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="policy-title">Policy title</Label>
              <Input
                id="policy-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Grooming & Uniform Policy"
                className="h-9"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="policy-description">Summary (internal)</Label>
              <Input
                id="policy-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Shown on the policy card"
                className="h-9"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="policy-subject">Email subject</Label>
            <Input
              id="policy-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="h-9"
            />
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor="policy-message">Policy text</Label>
              <button
                type="button"
                aria-expanded={codesOpen}
                onClick={() => setCodesOpen((value) => !value)}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#3D421F] underline-offset-2 hover:underline"
              >
                Template codes
                <ChevronDown
                  className={cn("size-3.5 transition-transform", codesOpen && "rotate-180")}
                />
              </button>
            </div>
            {codesOpen ? (
              <ul className="grid gap-2 rounded-lg border border-black/10 bg-white/70 p-3 sm:grid-cols-2">
                {POLICY_TEMPLATE_CODES.map((item) => (
                  <li key={item.code}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full items-start gap-2 rounded-md border bg-white px-2.5 py-2 text-left transition hover:bg-white/80",
                        copiedCode === item.code ? "border-emerald-300" : "border-black/8",
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
            ) : null}
            <RichTextEditor id="policy-message" value={message} onChange={setMessage} />
            <p className="text-[11px] text-black/45">
              Paste from Word keeps headings and lists. For text pasted from a
              PDF, use “Tidy pasted text” to rebuild the bullets. An
              acknowledgement button is added below the text automatically.
            </p>
          </div>

          {wordingChanged ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Changing the wording of a policy that has already been sent starts
              version {policy.version + 1}. Earlier acknowledgements stay on
              record, and employees need to acknowledge the new version.
            </p>
          ) : null}

          {error ? <p className="text-sm text-red-700">{error}</p> : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-black/8 px-6 py-4">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="border border-black/15 bg-white text-[#3D421F] hover:bg-black/5"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            className="gap-1.5 bg-[var(--venue-primary,#818a40)] text-white hover:opacity-90"
            onClick={() => void save()}
            disabled={saving || !title.trim() || !subject.trim()}
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {policy ? "Save changes" : "Create policy"}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
