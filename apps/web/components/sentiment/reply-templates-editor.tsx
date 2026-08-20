"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import {
  deleteReplyTemplate,
  saveReplyTemplate,
} from "@/lib/actions/sentiment-reviews";
import type { SentimentReplyTemplate } from "@/lib/sentiment/types";
import { MAX_REVIEW_REPLY_LENGTH } from "@/lib/sentiment/types";

type Draft = {
  id: string | null;
  name: string;
  body: string;
};

function toDraft(template: SentimentReplyTemplate): Draft {
  return { id: template.id, name: template.name, body: template.body };
}

export function ReplyTemplatesEditor({
  templates,
  canEdit,
}: {
  templates: SentimentReplyTemplate[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [drafts, setDrafts] = useState<Draft[]>(templates.map(toDraft));
  const [creating, setCreating] = useState<Draft>({
    id: null,
    name: "",
    body: "",
  });

  useEffect(() => {
    setDrafts(templates.map(toDraft));
  }, [templates]);

  function updateDraft(id: string, patch: Partial<Draft>) {
    setDrafts((current) =>
      current.map((draft) =>
        draft.id === id ? { ...draft, ...patch } : draft,
      ),
    );
  }

  function runSave(draft: Draft) {
    const formData = new FormData();
    if (draft.id) formData.set("templateId", draft.id);
    formData.set("name", draft.name);
    formData.set("body", draft.body);
    startTransition(async () => {
      const result = await saveReplyTemplate(formData);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.saved("Template saved.");
      if (!draft.id) {
        setCreating({ id: null, name: "", body: "" });
      }
      router.refresh();
    });
  }

  function runDelete(templateId: string) {
    const formData = new FormData();
    formData.set("templateId", templateId);
    startTransition(async () => {
      const result = await deleteReplyTemplate(formData);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.saved("Template removed.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-black/55">
        These appear when you reply to a review. Use{" "}
        <code className="rounded bg-black/5 px-1 py-0.5 text-xs">
          {"{first_name}"}
        </code>
        ,{" "}
        <code className="rounded bg-black/5 px-1 py-0.5 text-xs">{"{name}"}</code>
        ,{" "}
        <code className="rounded bg-black/5 px-1 py-0.5 text-xs">{"{venue}"}</code>
        , and{" "}
        <code className="rounded bg-black/5 px-1 py-0.5 text-xs">
          {"{rating}"}
        </code>
        .
        {!canEdit
          ? " You can view templates; admin or reviews edit access is required to change them."
          : null}
      </p>

      {drafts.map((draft) => (
        <TemplateCard
          key={draft.id}
          draft={draft}
          canEdit={canEdit}
          pending={pending}
          onChange={(patch) => updateDraft(draft.id!, patch)}
          onSave={() => runSave(draft)}
          onDelete={() => (draft.id ? runDelete(draft.id) : undefined)}
        />
      ))}

      {canEdit ? (
        <Card className="border-dashed p-5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-black/40">
            New template
          </p>
          <label className="mt-3 block text-sm font-medium text-[#3D421F]">
            Name
            <Input
              className="mt-1"
              value={creating.name}
              disabled={pending}
              placeholder="e.g. Terrace thanks"
              onChange={(event) =>
                setCreating((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
            />
          </label>
          <label className="mt-3 block text-sm font-medium text-[#3D421F]">
            Reply
            <Textarea
              className="mt-1 min-h-[120px]"
              value={creating.body}
              disabled={pending}
              maxLength={MAX_REVIEW_REPLY_LENGTH}
              placeholder="Thank you for dining with us, {first_name}…"
              onChange={(event) =>
                setCreating((current) => ({
                  ...current,
                  body: event.target.value,
                }))
              }
            />
          </label>
          <Button
            type="button"
            className="mt-4"
            disabled={pending || !creating.name.trim() || !creating.body.trim()}
            onClick={() => runSave(creating)}
          >
            <Plus className="h-4 w-4" />
            Add template
          </Button>
        </Card>
      ) : null}
    </div>
  );
}

function TemplateCard({
  draft,
  canEdit,
  pending,
  onChange,
  onSave,
  onDelete,
}: {
  draft: Draft;
  canEdit: boolean;
  pending: boolean;
  onChange: (patch: Partial<Draft>) => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <label className="min-w-0 flex-1 text-sm font-medium text-[#3D421F]">
          Name
          <Input
            className="mt-1"
            value={draft.name}
            disabled={!canEdit || pending}
            onChange={(event) => onChange({ name: event.target.value })}
          />
        </label>
        {canEdit ? (
          <button
            type="button"
            className="mt-6 rounded-md p-2 text-black/35 hover:bg-black/5 hover:text-[#3D421F]"
            aria-label={`Delete ${draft.name}`}
            disabled={pending}
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      <label className="mt-3 block text-sm font-medium text-[#3D421F]">
        Reply
        <Textarea
          className="mt-1 min-h-[120px]"
          value={draft.body}
          disabled={!canEdit || pending}
          maxLength={MAX_REVIEW_REPLY_LENGTH}
          onChange={(event) => onChange({ body: event.target.value })}
        />
      </label>
      {canEdit ? (
        <Button
          type="button"
          className="mt-4"
          disabled={pending || !draft.name.trim() || !draft.body.trim()}
          onClick={onSave}
        >
          Save template
        </Button>
      ) : null}
    </Card>
  );
}
