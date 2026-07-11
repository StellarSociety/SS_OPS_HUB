"use client";

export type SalesImportResult = {
  inserted?: number;
  updated?: number;
  total?: number;
  errors?: string[];
  error?: string;
};

type SalesImportResultDialogProps = {
  open: boolean;
  result: SalesImportResult | null;
  onClose: () => void;
};

export function SalesImportResultDialog({
  open,
  result,
  onClose,
}: SalesImportResultDialogProps) {
  if (!open || !result) return null;

  const isSuccess = result.inserted != null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sales-import-result-title"
        className="w-full max-w-md rounded-xl border border-black/10 bg-white p-6 shadow-xl"
      >
        <h2
          id="sales-import-result-title"
          className="font-serif text-xl text-[#3D421F]"
        >
          {isSuccess ? "Import complete" : "Import failed"}
        </h2>

        {isSuccess ? (
          <div className="mt-3 space-y-2 text-sm text-black/70">
            <p>
              <span className="font-medium text-emerald-800">
                {result.inserted} new
              </span>{" "}
              row{result.inserted === 1 ? "" : "s"} added.
            </p>
            <p>
              <span className="font-medium text-[#3D421F]">
                {result.updated} updated
              </span>{" "}
              of {result.total} row{result.total === 1 ? "" : "s"} processed.
            </p>
            {result.errors?.length ? (
              <div className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-amber-900">
                <p className="font-medium">
                  {result.errors.length} row
                  {result.errors.length === 1 ? "" : "s"} skipped or had issues:
                </p>
                <ul className="mt-2 max-h-40 list-disc space-y-1 overflow-y-auto pl-4 text-amber-800">
                  {result.errors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-sm text-red-600">
            {result.error ?? "The import could not be completed."}
          </p>
        )}

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center justify-center rounded-md bg-[var(--venue-primary)] px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
