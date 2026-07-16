"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SalesImportProgressBar } from "@/components/sales/sales-import-progress-bar";
import {
  SalesImportResultDialog,
  type SalesImportResult,
} from "@/components/sales/sales-import-result-dialog";
import { importAttendanceFromFile } from "@/lib/actions/hr-attendance";

const lightOutlineButtonClass =
  "border-black/10 bg-white text-[#3D421F] hover:bg-[var(--venue-secondary)]/30";

type CoverageSummary = {
  minWorkDate: string | null;
  maxWorkDate: string | null;
  distinctDayCount: number;
  recordCount: number;
};

type ImportBatchRow = {
  id: string;
  filename: string | null;
  row_count: number;
  day_count: number;
  imported_at: string;
  minWorkDate: string | null;
  maxWorkDate: string | null;
  distinctDayCount: number;
};

type Props = {
  canEdit: boolean;
  coverage: CoverageSummary;
  batches: ImportBatchRow[];
};

function formatImportWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function AttendanceImportPanel({
  canEdit,
  coverage,
  batches,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [importStage, setImportStage] = useState<"reading" | "importing" | null>(
    null,
  );
  const [result, setResult] = useState<SalesImportResult | null>(null);
  const [resultDialogOpen, setResultDialogOpen] = useState(false);

  async function handleImport(file: File) {
    if (!canEdit) return;
    setLoading(true);
    setImportStage("reading");
    setResult(null);
    setResultDialogOpen(false);

    try {
      const formData = new FormData();
      formData.set("file", file);

      setImportStage("importing");
      const importResult = await importAttendanceFromFile(formData);

      if ("error" in importResult && importResult.error) {
        setResult({ error: importResult.error });
      } else if ("total" in importResult) {
        setResult({
          inserted: importResult.inserted,
          updated: importResult.updated,
          total: importResult.total,
          errors: importResult.errors,
        });
      } else {
        setResult({ error: "Import failed." });
      }
      setResultDialogOpen(true);
    } catch (err) {
      console.error("[hr] attendance import:", err);
      setResult({
        error:
          "Import failed. Use the fingerprint InOutData export (.xls) — column C = employee ID, column D = timestamp.",
      });
      setResultDialogOpen(true);
    } finally {
      setLoading(false);
      setImportStage(null);
    }
  }

  const hasCoverage =
    coverage.minWorkDate != null && coverage.maxWorkDate != null;

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div>
          <h2 className="font-serif text-lg text-[#3D421F]">Import attendance</h2>
        </div>

        <div className="mt-4">
          {!canEdit ? (
            <p className="text-sm text-black/60">
              View-only access. Ask an admin for edit permission to import.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-start gap-3">
                <input
                  ref={inputRef}
                  id="attendance-inout-import-file"
                  type="file"
                  accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="sr-only"
                  disabled={loading}
                  onChange={(event) => {
                    setSelectedFile(event.target.files?.[0] ?? null);
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  className={lightOutlineButtonClass}
                  disabled={loading}
                  onClick={() => inputRef.current?.click()}
                >
                  Choose file
                </Button>
                <span className="max-w-xs truncate text-sm text-black/50">
                  {selectedFile?.name ?? "No file chosen"}
                </span>
                <Button
                  type="button"
                  disabled={loading || !selectedFile}
                  onClick={() => {
                    if (selectedFile) void handleImport(selectedFile);
                  }}
                >
                  <Upload className="h-4 w-4" />
                  {loading ? "Importing…" : "Import"}
                </Button>
              </div>
              {loading && importStage ? (
                <SalesImportProgressBar
                  label={
                    importStage === "reading"
                      ? "Uploading InOutData file…"
                      : "Parsing and saving attendance…"
                  }
                />
              ) : null}
            </>
          )}
        </div>

        <SalesImportResultDialog
          open={resultDialogOpen}
          result={result}
          onClose={() => {
            setResultDialogOpen(false);
            if (result && result.inserted != null) {
              window.location.reload();
            }
          }}
        />
      </Card>

      <Card className="p-5">
        <h2 className="font-serif text-lg text-[#3D421F]">Imported records</h2>

        {hasCoverage ? (
          <p className="mt-2 text-sm text-black/60">
            Dates with records:{" "}
            <span className="text-[#3D421F]">
              {coverage.minWorkDate} → {coverage.maxWorkDate}
            </span>
            {" · "}
            {coverage.distinctDayCount.toLocaleString()} calendar{" "}
            {coverage.distinctDayCount === 1 ? "day" : "days"}
            {" · "}
            {coverage.recordCount.toLocaleString()} employee-day{" "}
            {coverage.recordCount === 1 ? "record" : "records"}
          </p>
        ) : (
          <p className="mt-2 text-sm text-black/55">
            No attendance records imported yet.
          </p>
        )}

        {batches.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-black/10 text-xs uppercase tracking-wide text-black/45">
                  <th className="py-2 pr-3 font-medium">File</th>
                  <th className="py-2 pr-3 font-medium">Imported</th>
                  <th className="py-2 pr-3 font-medium">Dates</th>
                  <th className="py-2 pr-3 font-medium">Calendar days</th>
                  <th className="py-2 pr-3 font-medium">Punches</th>
                  <th className="py-2 font-medium">Employee-day records</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((batch) => (
                  <tr
                    key={batch.id}
                    className="border-b border-black/5 text-black/70"
                  >
                    <td className="py-2.5 pr-3 text-[#3D421F]">
                      {batch.filename ?? "—"}
                    </td>
                    <td className="py-2.5 pr-3 whitespace-nowrap">
                      {formatImportWhen(batch.imported_at)}
                    </td>
                    <td className="py-2.5 pr-3 whitespace-nowrap">
                      {batch.minWorkDate && batch.maxWorkDate
                        ? `${batch.minWorkDate} → ${batch.maxWorkDate}`
                        : "—"}
                    </td>
                    <td className="py-2.5 pr-3">
                      {batch.distinctDayCount > 0
                        ? batch.distinctDayCount.toLocaleString()
                        : "—"}
                    </td>
                    <td className="py-2.5 pr-3">
                      {batch.row_count.toLocaleString()}
                    </td>
                    <td className="py-2.5">
                      {batch.day_count.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
