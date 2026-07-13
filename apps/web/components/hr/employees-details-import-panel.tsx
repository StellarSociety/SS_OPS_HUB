"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SalesExcelFilePicker } from "@/components/sales/sales-excel-file-picker";
import { SalesImportProgressBar } from "@/components/sales/sales-import-progress-bar";
import {
  SalesImportResultDialog,
  type SalesImportResult,
} from "@/components/sales/sales-import-result-dialog";
import { importEmployeesFromRows } from "@/lib/actions/hr";
import {
  employeesTemplateHeaders,
  employeesTemplateInstructions,
  sheetRowsToStaffImportRows,
  staffRecordToTemplateRow,
  type EmployeesTemplateContext,
} from "@/lib/hr/employees-import";
import type { StaffWithLookups } from "@/lib/hr/types";
import {
  buildExcelWorkbook,
  downloadExcelWorkbook,
  parseExcelFile,
} from "@/lib/sales/excel-utils";

type Props = {
  venueName: string;
  canEdit: boolean;
  staff: StaffWithLookups[];
  lookups: EmployeesTemplateContext;
};

export function EmployeesDetailsImportPanel({
  venueName,
  canEdit,
  staff,
  lookups,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [importStage, setImportStage] = useState<"reading" | "importing" | null>(
    null,
  );
  const [downloading, setDownloading] = useState(false);
  const [result, setResult] = useState<SalesImportResult | null>(null);
  const [resultDialogOpen, setResultDialogOpen] = useState(false);

  async function handleDownload(includeExisting: boolean) {
    setDownloading(true);
    try {
      const headers = employeesTemplateHeaders();
      const dataRows = includeExisting
        ? staff.map((record) => staffRecordToTemplateRow(record))
        : [];
      const workbook = await buildExcelWorkbook(
        "Employees",
        headers,
        dataRows,
        employeesTemplateInstructions(lookups),
      );
      const suffix = includeExisting ? "with-data" : "template";
      await downloadExcelWorkbook(
        workbook,
        `employees-${suffix}-${venueName.replace(/\s+/g, "-").toLowerCase()}.xlsx`,
      );
    } finally {
      setDownloading(false);
    }
  }

  async function handleImport(file: File) {
    if (!canEdit) return;
    setLoading(true);
    setImportStage("reading");
    setResult(null);
    setResultDialogOpen(false);

    try {
      const sheetRows = await parseExcelFile(file);
      const rows = sheetRowsToStaffImportRows(sheetRows).filter(
        (row) => (row.emp_no ?? "").trim() !== "",
      );

      if (!rows.length) {
        setResult({
          error:
            "No valid rows found. Each row needs an Emp no and the column headers must match the template.",
        });
        setResultDialogOpen(true);
        return;
      }

      setImportStage("importing");
      const importResult = await importEmployeesFromRows(rows);
      if ("inserted" in importResult) {
        setResult({
          inserted: importResult.inserted,
          updated: importResult.updated,
          total: importResult.total,
          errors: importResult.errors,
        });
      } else {
        setResult({ error: importResult.error });
      }
      setResultDialogOpen(true);
    } catch {
      setResult({
        error: "Could not read the Excel file. Save as .xlsx and try again.",
      });
      setResultDialogOpen(true);
    } finally {
      setLoading(false);
      setImportStage(null);
    }
  }

  return (
    <Card className="p-5">
      <h2 className="font-serif text-lg text-[#3D421F]">Excel import & export</h2>
      <p className="mt-1 text-sm text-black/50">
        Download a template with every employee field, fill in or edit rows, then
        import the same .xlsx file. Each row is one employee keyed by Emp no —
        existing employees are updated and new emp numbers are added.
      </p>

      <div className="mt-4 space-y-4">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-black/45">
            Download template
          </p>
          <div className="flex flex-wrap items-center justify-start gap-3">
            <Button
              type="button"
              variant="outline"
              className="border-black/10 bg-white text-[#3D421F] hover:bg-[var(--venue-secondary)]/30"
              disabled={downloading}
              onClick={() => void handleDownload(false)}
            >
              <Download className="h-4 w-4" />
              {downloading ? "Preparing…" : "Blank template"}
            </Button>
            <Button
              type="button"
              disabled={downloading}
              onClick={() => void handleDownload(true)}
            >
              <Download className="h-4 w-4" />
              {downloading
                ? "Preparing…"
                : `Template with ${staff.length} employee${staff.length === 1 ? "" : "s"}`}
            </Button>
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-black/45">
            Import from Excel
          </p>
          {!canEdit ? (
            <p className="text-sm text-black/60">
              You have view-only access for staff. Ask an admin for edit
              permission to import employee data.
            </p>
          ) : (
            <>
              <SalesExcelFilePicker
                id="employees-details-import-file"
                disabled={!canEdit}
                loading={loading}
                onImport={handleImport}
              />
              {loading && importStage ? (
                <SalesImportProgressBar
                  label={
                    importStage === "reading"
                      ? "Reading Excel file…"
                      : "Importing employees into database…"
                  }
                />
              ) : null}
            </>
          )}
        </div>
      </div>

      <SalesImportResultDialog
        open={resultDialogOpen}
        result={result}
        onClose={() => setResultDialogOpen(false)}
      />
    </Card>
  );
}
