"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import {
  removeGuestFeedbackQuestion,
  saveGuestFeedbackQuestion,
} from "@/lib/actions/guest-feedback";
import {
  GUEST_FEEDBACK_QUESTION_TYPE_LABELS,
  GUEST_FEEDBACK_QUESTION_TYPES,
  isSystemQuestionKey,
  type GuestFeedbackQuestion,
  type GuestFeedbackQuestionType,
} from "@/lib/sentiment/guest-feedback/types";
import { cn } from "@/lib/utils";

const selectClass =
  "flex h-10 w-full rounded-md border border-black/10 bg-white px-3 text-[16px] text-[#3D421F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#818a40] md:text-sm";

export function GuestFeedbackQuestionnaireEditor({
  questions,
  canEdit,
}: {
  questions: GuestFeedbackQuestion[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-4">
      <p className="text-sm text-black/55">
        These questions appear on the guest page. Star ratings for food, service,
        and atmosphere are shown with the review on the Reviews page.
      </p>
      <ul className="space-y-3">
        {questions.map((question, index) => (
          <li key={question.id}>
            <QuestionRow
              question={question}
              canEdit={canEdit}
              busy={pending}
              sortOrder={(index + 1) * 10}
              onChanged={() => router.refresh()}
            />
          </li>
        ))}
      </ul>
      {canEdit && adding ? (
        <QuestionForm
          sortOrder={(questions.length + 1) * 10}
          busy={pending}
          onCancel={() => setAdding(false)}
          onSave={(formData) => {
            startTransition(async () => {
              const result = await saveGuestFeedbackQuestion(formData);
              if (!result.ok) {
                toast.error(result.error);
                return;
              }
              toast.saved("Question added.");
              setAdding(false);
              router.refresh();
            });
          }}
        />
      ) : null}
      {canEdit && !adding ? (
        <Button type="button" onClick={() => setAdding(true)}>
          Add question
        </Button>
      ) : null}
    </div>
  );
}

function QuestionRow({
  question,
  canEdit,
  busy,
  sortOrder,
  onChanged,
}: {
  question: GuestFeedbackQuestion;
  canEdit: boolean;
  busy: boolean;
  sortOrder: number;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const system = isSystemQuestionKey(question.question_key);

  if (editing) {
    return (
      <QuestionForm
        question={question}
        sortOrder={sortOrder}
        busy={pending}
        onCancel={() => setEditing(false)}
        onSave={(formData) => {
          startTransition(async () => {
            const result = await saveGuestFeedbackQuestion(formData);
            if (!result.ok) {
              toast.error(result.error);
              return;
            }
            toast.saved("Question saved.");
            setEditing(false);
            onChanged();
          });
        }}
      />
    );
  }

  return (
    <Card className={cn("p-5", !question.enabled && "opacity-60")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-serif text-xl text-[#3D421F]">{question.label}</p>
          <p className="mt-1 text-sm text-black/55">
            {GUEST_FEEDBACK_QUESTION_TYPE_LABELS[question.question_type]}
            {question.required ? " · Required" : ""}
            {!question.enabled ? " · Hidden" : ""}
            {system ? " · Built-in" : ""}
          </p>
          {question.helper_text ? (
            <p className="mt-2 text-sm text-black/60">{question.helper_text}</p>
          ) : null}
        </div>
        {canEdit ? (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={busy || pending}
              onClick={() => setEditing(true)}
            >
              Edit
            </Button>
            {!system ? (
              <Button
                type="button"
                variant="secondary"
                disabled={busy || pending}
                onClick={() => {
                  startTransition(async () => {
                    const result = await removeGuestFeedbackQuestion(question.id);
                    if (!result.ok) {
                      toast.error(result.error);
                      return;
                    }
                    toast.saved("Question removed.");
                    onChanged();
                  });
                }}
              >
                Delete
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function QuestionForm({
  question,
  sortOrder,
  busy,
  onCancel,
  onSave,
}: {
  question?: GuestFeedbackQuestion;
  sortOrder: number;
  busy: boolean;
  onCancel: () => void;
  onSave: (formData: FormData) => void;
}) {
  const [type, setType] = useState<GuestFeedbackQuestionType>(
    question?.question_type ?? "text",
  );
  const system = question ? isSystemQuestionKey(question.question_key) : false;

  return (
    <Card className="space-y-4 p-5">
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(new FormData(event.currentTarget));
        }}
      >
        {question ? <input type="hidden" name="id" value={question.id} /> : null}
        <input
          type="hidden"
          name="question_key"
          value={question?.question_key ?? ""}
        />
        <input type="hidden" name="sort_order" value={sortOrder} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={`q-label-${question?.id ?? "new"}`}>Label</Label>
            <Input
              id={`q-label-${question?.id ?? "new"}`}
              name="label"
              defaultValue={question?.label ?? ""}
              disabled={busy}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`q-type-${question?.id ?? "new"}`}>Type</Label>
            <select
              id={`q-type-${question?.id ?? "new"}`}
              name="question_type"
              className={selectClass}
              value={type}
              disabled={busy || system}
              onChange={(event) =>
                setType(event.target.value as GuestFeedbackQuestionType)
              }
            >
              {GUEST_FEEDBACK_QUESTION_TYPES.map((value) => (
                <option key={value} value={value}>
                  {GUEST_FEEDBACK_QUESTION_TYPE_LABELS[value]}
                </option>
              ))}
            </select>
            {system ? (
              <input type="hidden" name="question_type" value={type} />
            ) : null}
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={`q-help-${question?.id ?? "new"}`}>Helper text</Label>
            <Input
              id={`q-help-${question?.id ?? "new"}`}
              name="helper_text"
              defaultValue={question?.helper_text ?? ""}
              disabled={busy}
            />
          </div>
          {type === "choice" ? (
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor={`q-choices-${question?.id ?? "new"}`}>
                Choices (one per line)
              </Label>
              <Textarea
                id={`q-choices-${question?.id ?? "new"}`}
                name="choices"
                defaultValue={(question?.choices ?? []).join("\n")}
                disabled={busy}
                rows={4}
              />
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-4 text-sm text-[#3D421F]">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="required"
              defaultChecked={question?.required}
              disabled={busy}
            />
            Required
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="enabled"
              defaultChecked={question?.enabled ?? true}
              value="on"
              disabled={busy}
            />
            Visible on guest page
          </label>
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
          <Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
