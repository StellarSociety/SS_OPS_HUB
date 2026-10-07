"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import { DateInput } from "@/components/ui/date-input";
import { toast } from "@/components/ui/toast";
import {
  createStaffPathNote,
  updateStaffPathNote,
  type StaffPathNoteItem,
} from "@/lib/actions/hr-staff-path-notes";
import { dubaiTodayIso } from "@/lib/hr/benefits/flight-ticket";

const fieldClass =
  "h-10 w-full rounded-md border border-black/10 bg-white px-3 text-sm text-[#3D421F] outline-none transition focus:border-[var(--venue-primary)]/50 focus:ring-2 focus:ring-[var(--venue-primary)]/20";

/**
 * Mount only while open so fields reset each time: today + empty for a new
 * note, or the note's own values when `editingNote` is set.
 */
export function StaffPathNoteDialog({
  staffId,
  editingNote = null,
  onClose,
  onSaved,
}: {
  staffId: string;
  editingNote?: StaffPathNoteItem | null;
  onClose: () => void;
  onSaved: (item: StaffPathNoteItem) => void;
}) {
  const isEdit = editingNote != null;
  const [noteDate, setNoteDate] = useState(
    () => editingNote?.noteDate ?? dubaiTodayIso(),
  );
  const [body, setBody] = useState(editingNote?.body ?? "");
  const [pending, startTransition] = useTransition();
  const canSubmit = Boolean(noteDate.trim() && body.trim());

  function submit() {
    if (!canSubmit) return;
    startTransition(async () => {
      const result = editingNote
        ? await updateStaffPathNote({
            staffId,
            noteId: editingNote.id,
            noteDate,
            body,
          })
        : await createStaffPathNote({ staffId, noteDate, body });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.saved(isEdit ? "Note updated." : "Note added.");
      onSaved(result.item);
      onClose();
    });
  }

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="staff-path-note-title"
        className="relative z-10 flex w-full max-w-lg flex-col overflow-hidden rounded-xl border border-black/10 bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-black/8 px-5 py-4">
          <div>
            <h3
              id="staff-path-note-title"
              className="font-serif text-lg text-[#3D421F]"
            >
              {isEdit ? "Edit note" : "Add note"}
            </h3>
            <p className="mt-0.5 text-sm text-black/50">
              The note appears on this employee&apos;s Employment path.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-black/45 transition hover:bg-black/5 hover:text-[#3D421F]"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <label className="block space-y-1 text-sm">
            <span className="text-xs font-medium text-black/55">
              Date <span className="text-red-600">*</span>
            </span>
            <DateInput
              value={noteDate}
              onChange={setNoteDate}
              className="w-full"
              inputClassName={fieldClass}
            />
          </label>

          <label className="block space-y-1 text-sm">
            <span className="text-xs font-medium text-black/55">
              Notes <span className="text-red-600">*</span>
            </span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              autoFocus
              onFocus={(e) => {
                // Edit mode: put the caret after the existing text.
                const end = e.currentTarget.value.length;
                e.currentTarget.setSelectionRange(end, end);
              }}
              placeholder="Write a note about this employee…"
              className={`${fieldClass} h-auto resize-y py-2 leading-relaxed`}
            />
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-black/8 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="inline-flex h-9 items-center rounded-md border border-black/10 bg-white px-3 text-sm font-medium text-[#3D421F] hover:bg-black/5 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending || !canSubmit}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[var(--venue-primary)] px-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : null}
            {isEdit ? "Save changes" : "Save note"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
