"use client";

import { useRef, useState } from "react";
import { RefreshCw, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SalesImportProgressBar } from "@/components/sales/sales-import-progress-bar";
import {
  SalesImportResultDialog,
  type SalesImportResult,
} from "@/components/sales/sales-import-result-dialog";
import {
  deleteAttendanceImportBatch,
  importAttendanceFromFile,
} from "@/lib/actions/hr-attendance";

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

type MonthSummaryRow = {
  month_key: string;
  from_date: string;
  to_date: string;
  employee_day_count: number;
  punch_count: number;
  distinct_emp_count: number;
  distinct_day_count: number;
  complete_count: number;
  missing_clock_in_count: number;
  missing_clock_out_count: number;
  incomplete_count: number;
  pending_count: number;
  approved_count: number;
  flagged_count: number;
};

type Props = {
  canEdit: boolean;
  coverage: CoverageSummary;
  batches: ImportBatchRow[];
  months: MonthSummaryRow[];
};

function formatImportWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  if (!y || !m) return monthKey;
  return new Date(y, m - 1, 1).toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });
}

type MonthDataQuality = {
  label: string;
  detail: string;
  className: string;
};

function monthDataQuality(month: MonthSummaryRow): MonthDataQuality | null {
  const total = month.employee_day_count;
  if (total <= 0) return null;

  const complete = month.complete_count;
  const missing =
    month.missing_clock_in_count +
    month.missing_clock_out_count +
    month.incomplete_count;
  const pct = Math.round((complete / total) * 100);

  if (pct >= 95 && month.flagged_count === 0) {
    return {
      label: "Strong",
      detail: `${pct}% complete`,
      className: "text-emerald-800",
    };
  }
  if (pct >= 80) {
    return {
      label: "Fair",
      detail:
        missing > 0
          ? `${pct}% complete · ${missing.toLocaleString()} gaps`
          : `${pct}% complete`,
      className: "text-amber-800",
    };
  }
  return {
    label: "Needs review",
    detail:
      missing > 0
        ? `${pct}% complete · ${missing.toLocaleString()} gaps`
        : `${pct}% complete`,
    className: "text-red-800",
  };
}

export function AttendanceImportPanel({
  canEdit,
  coverage,
  batches,
  months,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [importStage, setImportStage] = useState<"reading" | "importing" | null>(
    null,
  );
  const [result, setResult] = useState<SalesImportResult | null>(null);
  const [resultDialogOpen, setResultDialogOpen] = useState(false);
  const [deletingBatchId, setDeletingBatchId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  async function handleDeleteBatch(batch: ImportBatchRow) {
    if (!canEdit) return;
    const label = batch.filename ?? "this import";
    if (
      !window.confirm(
        `Delete all attendance data from “${label}”? This removes punches and employee-day records from that import.`,
      )
    ) {
      return;
    }

    setDeletingBatchId(batch.id);
    setDeleteError(null);
    try {
      const outcome = await deleteAttendanceImportBatch(batch.id);
      if ("error" in outcome && outcome.error) {
        setDeleteError(outcome.error);
        return;
      }
      window.location.reload();
    } catch (err) {
      console.error("[hr] delete attendance import:", err);
      setDeleteError("Could not delete this import. Try again.");
    } finally {
      setDeletingBatchId(null);
    }
  }

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

  async function handleSyncImport() {
    if (!canEdit || syncLoading) return;
    setSyncLoading(true);
    setSyncMessage(null);
    try {
      // Device sync API will be wired when the ZKTeco U350 endpoint is provided.
      await new Promise((resolve) => setTimeout(resolve, 400));
      setSyncMessage(
        "On-demand pull is not wired yet. The restaurant PC agent posts to /api/attendance/punch automatically.",
      );
    } finally {
      setSyncLoading(false);
    }
  }

  const hasCoverage =
    coverage.minWorkDate != null && coverage.maxWorkDate != null;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <div>
            <h2 className="font-serif text-lg text-[#3D421F]">
              Import attendance
            </h2>
            <p className="mt-1 text-sm text-black/55">
              Upload an InOutData spreadsheet export from the fingerprint clock.
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
          <div>
            <h2 className="font-serif text-lg text-[#3D421F]">Sync Import</h2>
            <p className="mt-1 text-sm text-black/55">
              Automatic sync from the ZKTeco U350 via the restaurant PC agent
              posting to <span className="font-mono text-xs">/api/attendance/punch</span>.
            </p>
          </div>

          <div className="mt-4">
            {!canEdit ? (
              <p className="text-sm text-black/60">
                View-only access. Ask an admin for edit permission to sync.
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  disabled={syncLoading}
                  onClick={() => {
                    void handleSyncImport();
                  }}
                >
                  <RefreshCw
                    className={`h-4 w-4 ${syncLoading ? "animate-spin" : ""}`}
                  />
                  {syncLoading ? "Syncing…" : "Import"}
                </Button>
                <span className="text-sm text-black/45">
                  Device: ZKTeco U350 · agent-driven
                </span>
              </div>
            )}
            {syncMessage ? (
              <p className="mt-3 text-sm text-amber-800/90" role="status">
                {syncMessage}
              </p>
            ) : (
              <p className="mt-3 text-sm text-black/45">
                Punches appear in Attendance as the PC agent sends them (every
                ~30s). Manual Import here is reserved for a future on-demand
                pull.
              </p>
            )}
          </div>
        </Card>
      </div>

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

        {deleteError ? (
          <p className="mt-3 text-sm text-red-700" role="alert">
            {deleteError}
          </p>
        ) : null}

        {batches.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-black/10 text-xs uppercase tracking-wide text-black/45">
                  {canEdit ? (
                    <th className="w-10 py-2 pr-2 font-medium">
                      <span className="sr-only">Delete</span>
                    </th>
                  ) : null}
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
                    {canEdit ? (
                      <td className="py-2 pr-2 align-middle">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-black/35 hover:bg-red-50 hover:text-red-700"
                          disabled={deletingBatchId !== null}
                          aria-label={`Delete import ${batch.filename ?? batch.id}`}
                          onClick={() => {
                            void handleDeleteBatch(batch);
                          }}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </Button>
                      </td>
                    ) : null}
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

      <Card className="p-5">
        <h2 className="font-serif text-lg text-[#3D421F]">By month</h2>
        <p className="mt-2 text-sm text-black/60">
          Attendance is indexed by calendar month so Schedules, Attendance, and
          Leave can load one month at a time instead of the full history. Data
          quality reflects how complete each month&apos;s punches are after
          import.
        </p>

        {months.length > 0 &&
        months.every(
          (m) => m.employee_day_count === 0 && m.punch_count === 0,
        ) ? (
          <p className="mt-2 text-sm text-amber-800/90">
            Month list is ready; detailed counts appear after the monthly index
            migration is applied to the database.
          </p>
        ) : null}

        {months.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-black/10 text-xs uppercase tracking-wide text-black/45">
                  <th className="py-2 pr-3 font-medium">Month</th>
                  <th className="py-2 pr-3 font-medium">Dates</th>
                  <th className="py-2 pr-3 font-medium">Employees</th>
                  <th className="py-2 pr-3 font-medium">Calendar days</th>
                  <th className="py-2 pr-3 font-medium">Punches</th>
                  <th className="py-2 pr-3 font-medium">Employee-day records</th>
                  <th className="py-2 pr-3 font-medium">Data quality</th>
                  <th className="py-2 pr-3 font-medium">Complete</th>
                  <th className="py-2 pr-3 font-medium">Missing in/out</th>
                  <th className="py-2 font-medium">Approvals</th>
                </tr>
              </thead>
              <tbody>
                {months.map((month) => {
                  const missing =
                    month.missing_clock_in_count +
                    month.missing_clock_out_count +
                    month.incomplete_count;
                  const hasDetails =
                    month.distinct_emp_count > 0 ||
                    month.complete_count > 0 ||
                    missing > 0 ||
                    month.pending_count > 0 ||
                    month.approved_count > 0 ||
                    month.flagged_count > 0;
                  const quality = monthDataQuality(month);
                  return (
                    <tr
                      key={month.month_key}
                      className="border-b border-black/5 text-black/70"
                    >
                      <td className="py-2.5 pr-3 text-[#3D421F]">
                        {formatMonthLabel(month.month_key)}
                      </td>
                      <td className="py-2.5 pr-3 whitespace-nowrap">
                        {month.from_date} → {month.to_date}
                      </td>
                      <td className="py-2.5 pr-3">
                        {month.distinct_emp_count > 0
                          ? month.distinct_emp_count.toLocaleString()
                          : "—"}
                      </td>
                      <td className="py-2.5 pr-3">
                        {month.distinct_day_count > 0
                          ? month.distinct_day_count.toLocaleString()
                          : "—"}
                      </td>
                      <td className="py-2.5 pr-3">
                        {month.punch_count > 0
                          ? month.punch_count.toLocaleString()
                          : "—"}
                      </td>
                      <td className="py-2.5 pr-3">
                        {month.employee_day_count > 0
                          ? month.employee_day_count.toLocaleString()
                          : "—"}
                      </td>
                      <td className="py-2.5 pr-3">
                        {quality ? (
                          <div>
                            <div className={`font-medium ${quality.className}`}>
                              {quality.label}
                            </div>
                            <div className="text-xs text-black/55">
                              {quality.detail}
                            </div>
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-2.5 pr-3">
                        {hasDetails
                          ? month.complete_count.toLocaleString()
                          : "—"}
                      </td>
                      <td className="py-2.5 pr-3">
                        {hasDetails ? missing.toLocaleString() : "—"}
                      </td>
                      <td className="py-2.5 whitespace-nowrap">
                        {hasDetails ? (
                          <>
                            {month.pending_count.toLocaleString()} pending
                            {month.approved_count > 0
                              ? ` · ${month.approved_count.toLocaleString()} approved`
                              : ""}
                            {month.flagged_count > 0
                              ? ` · ${month.flagged_count.toLocaleString()} flagged`
                              : ""}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 text-sm text-black/55">
            No monthly index yet. Import attendance to build month summaries.
          </p>
        )}
      </Card>
    </div>
  );
}
