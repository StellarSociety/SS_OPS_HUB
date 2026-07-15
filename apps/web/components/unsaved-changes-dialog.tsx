"use client";

type UnsavedChangesDialogProps = {
  open: boolean;
  saving?: boolean;
  onDontSave: () => void;
  onKeepEditing: () => void;
  onSave: () => void;
};

export function UnsavedChangesDialog({
  open,
  saving = false,
  onDontSave,
  onKeepEditing,
  onSave,
}: UnsavedChangesDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onKeepEditing();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="unsaved-changes-title"
        className="w-full max-w-md rounded-xl border border-black/10 bg-white p-6 shadow-xl"
      >
        <h2
          id="unsaved-changes-title"
          className="font-serif text-xl text-[#3D421F]"
        >
          Unsaved changes
        </h2>
        <p className="mt-2 text-sm text-black/60">
          You have unsaved changes. Leave without saving, keep editing, or save
          before you go.
        </p>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={onDontSave}
            className="inline-flex h-10 items-center justify-center rounded-md border border-black/10 bg-white px-4 text-sm font-medium text-[#3D421F] transition-colors hover:bg-black/5 disabled:opacity-50"
          >
            Don&apos;t save
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={onKeepEditing}
            className="inline-flex h-10 items-center justify-center rounded-md border border-black/10 bg-white px-4 text-sm font-medium text-[#3D421F] transition-colors hover:bg-[var(--venue-secondary)]/30 disabled:opacity-50"
          >
            Keep editing
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={onSave}
            className="inline-flex h-10 items-center justify-center rounded-md bg-[var(--venue-primary)] px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
