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
import { importDailySalesRows } from "@/lib/actions/sales-import";
import {
  dailySalesRecordToTemplateRow,
  dailySalesTemplateHeaders,
  dailySalesTemplateInstructions,
  parseDailySalesImportRows,
} from "@/lib/sales/daily-sales-import";
import type { VenueDailySalesRecord } from "@/lib/sales/daily-sales-types";
import {
  buildExcelWorkbook,
  downloadExcelWorkbook,
  parseExcelFile,
} from "@/lib/sales/excel-utils";

type Props = {
  venueName: string;
  canEdit: boolean;
  records: VenueDailySalesRecord[];
};

export function DailySalesImportPanel({ venueName, canEdit, records }: Props) {
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
      const headers = dailySalesTemplateHeaders();
      const dataRows = includeExisting
        ? records.map((record) => dailySalesRecordToTemplateRow(record))
        : [];
      const workbook = await buildExcelWorkbook(
        "Daily Sales",
        headers,
        dataRows,
        dailySalesTemplateInstructions(),
      );
      const suffix = includeExisting ? "with-data" : "template";
      await downloadExcelWorkbook(
        workbook,
        `daily-sales-${suffix}-${venueName.replace(/\s+/g, "-").toLowerCase()}.xlsx`,
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
      const { rows, errors: parseErrors } = parseDailySalesImportRows(sheetRows);

      if (!rows.length) {
        setResult({
          error:
            parseErrors[0] ??
            "No valid rows found. Check that column headers match the template.",
        });
        setResultDialogOpen(true);
        return;
      }

      setImportStage("importing");
      const importResult = await importDailySalesRows(rows);
      if (importResult.error) {
        setResult({ error: importResult.error });
        setResultDialogOpen(true);
        return;
      }

      setResult({
        inserted: importResult.inserted,
        updated: importResult.updated,
        total: importResult.total,
        errors: [...parseErrors, ...(importResult.errors ?? [])],
      });
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
        Download a template with the correct columns, fill in historical figures,
        then import the same .xlsx file. Each row is one date; existing dates are
        updated and new dates are added.
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
                : `Template with ${records.length} existing rows`}
            </Button>
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-black/45">
            Import from Excel
          </p>
          {!canEdit ? (
            <p className="text-sm text-black/60">
              You have view-only access for daily sales. Ask an admin for edit
              permission to import.
            </p>
          ) : (
            <>
              <SalesExcelFilePicker
                id="daily-sales-import-file"
                disabled={!canEdit}
                loading={loading}
                onImport={handleImport}
              />
              {loading && importStage ? (
                <SalesImportProgressBar
                  label={
                    importStage === "reading"
                      ? "Reading Excel file…"
                      : "Importing rows into database…"
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
