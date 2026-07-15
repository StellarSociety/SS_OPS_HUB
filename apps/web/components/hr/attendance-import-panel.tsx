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
import type { HrAttendanceImportRules } from "@/lib/hr/types";
import { ScopedLink } from "@/components/layout/scoped-link";

const lightOutlineButtonClass =
  "border-black/10 bg-white text-[#3D421F] hover:bg-[var(--venue-secondary)]/30";

type Props = {
  canEdit: boolean;
  importRules: HrAttendanceImportRules;
};

export function AttendanceImportPanel({ canEdit, importRules }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [importStage, setImportStage] = useState<"reading" | "importing" | null>(
    null,
  );
  const [result, setResult] = useState<SalesImportResult | null>(null);
  const [resultDialogOpen, setResultDialogOpen] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);

  async function handleImport(file: File) {
    if (!canEdit) return;
    setLoading(true);
    setImportStage("reading");
    setResult(null);
    setSummary(null);
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
        const unmatched = importResult.unmatchedEmpNos ?? [];
        setSummary(
          unmatched.length
            ? `${importResult.punchCount} punches → ${importResult.total} work days. Unmatched emp nos: ${unmatched.slice(0, 12).join(", ")}${unmatched.length > 12 ? "…" : ""}`
            : `${importResult.punchCount} punches paired into ${importResult.total} work days (overnight cutoff ${importRules.overnightCutoffTime}).`,
        );
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

  return (
    <Card className="p-5">
      <div>
        <h2 className="font-serif text-lg text-[#3D421F]">Import attendance</h2>
        <p className="mt-1 max-w-2xl text-sm text-black/55">
          Upload the fingerprint machine <strong>InOutData</strong> export (.xls).
          The file is read on the server — column <strong>C</strong> = employee ID,
          column <strong>D</strong> = punch timestamp. Punches are paired using
          the overnight cutoff ({importRules.overnightCutoffTime}) from{" "}
          <ScopedLink
            href="/hr/settings/attendance/shift-import-rules"
            className="underline underline-offset-2 hover:text-[#3D421F]"
          >
            Settings → Attendance → Shift import rules
          </ScopedLink>
          .
        </p>
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
            {summary ? (
              <p className="mt-3 text-xs text-black/55">{summary}</p>
            ) : null}
          </>
        )}
      </div>

      <SalesImportResultDialog
        open={resultDialogOpen}
        result={result}
        onClose={() => setResultDialogOpen(false)}
      />
    </Card>
  );
}
