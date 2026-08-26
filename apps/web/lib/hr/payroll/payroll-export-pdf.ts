import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  buildPayrollExportFilename,
  type PayrollExportRow,
} from "@/lib/hr/payroll/wps";

const BRAND_DARK: [number, number, number] = [61, 66, 31];
const HEADER_BG: [number, number, number] = [240, 243, 221];
const TOTALS_BG: [number, number, number] = [226, 232, 200];
const FOOTER_TEXT: [number, number, number] = [110, 110, 110];

const PDF_HEADERS = [
  "Emp ID",
  "Name",
  "Dept",
  "IBAN / method",
  "Days",
  "Paid lv",
  "Unpaid",
  "Fixed",
  "SC",
  "Grat.",
  "Other var",
  "Ded %",
  "Deductions",
  "Net",
] as const;

function pdfSafeText(value: string): string {
  return value
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/[\u00B7\u2022]/g, "|")
    .replace(/[^\x20-\x7E]/g, "?");
}

function money(amount: number): string {
  return new Intl.NumberFormat("en-AE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function qty(amount: number): string {
  return new Intl.NumberFormat("en-AE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function formatExportTimestamp(date: Date): string {
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function rowCells(row: PayrollExportRow): string[] {
  return [
    row.employeeId,
    row.employeeName,
    row.department,
    row.iban,
    qty(row.daysPaid),
    qty(row.paidLeaveDays),
    qty(row.unpaidLeaveDays),
    money(row.fixedSalary),
    money(row.variableServiceCharge),
    money(row.variableGratuity),
    money(row.variableOthers),
    qty(row.deductionsPercent),
    money(row.deductionsValue),
    money(row.netSalary),
  ].map(pdfSafeText);
}

function totalCells(rows: PayrollExportRow[]): string[] {
  const totals = rows.reduce(
    (acc, row) => {
      acc.daysPaid += row.daysPaid;
      acc.paidLeaveDays += row.paidLeaveDays;
      acc.unpaidLeaveDays += row.unpaidLeaveDays;
      acc.fixedSalary += row.fixedSalary;
      acc.variableServiceCharge += row.variableServiceCharge;
      acc.variableGratuity += row.variableGratuity;
      acc.variableOthers += row.variableOthers;
      acc.deductionsPercent += row.deductionsPercent;
      acc.deductionsValue += row.deductionsValue;
      acc.netSalary += row.netSalary;
      return acc;
    },
    {
      daysPaid: 0,
      paidLeaveDays: 0,
      unpaidLeaveDays: 0,
      fixedSalary: 0,
      variableServiceCharge: 0,
      variableGratuity: 0,
      variableOthers: 0,
      deductionsPercent: 0,
      deductionsValue: 0,
      netSalary: 0,
    },
  );
  return [
    "Total",
    "",
    "",
    `${rows.length} employee${rows.length === 1 ? "" : "s"}`,
    qty(totals.daysPaid),
    qty(totals.paidLeaveDays),
    qty(totals.unpaidLeaveDays),
    money(totals.fixedSalary),
    money(totals.variableServiceCharge),
    money(totals.variableGratuity),
    money(totals.variableOthers),
    qty(totals.deductionsPercent),
    money(totals.deductionsValue),
    money(totals.netSalary),
  ].map(pdfSafeText);
}

export function buildPayrollExportPdfBase64(opts: {
  companyName: string;
  payrollMonthLabel: string;
  venueName: string;
  monthKey: string;
  rows: PayrollExportRow[];
  exportedAt?: Date;
  userDisplayName?: string;
}): { filename: string; base64: string; mimeType: string } {
  const exportedAt = opts.exportedAt ?? new Date();
  const userDisplayName = opts.userDisplayName?.trim() || "Unknown";
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginLeft = 8;
  const marginRight = 8;
  let y = 12;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...BRAND_DARK);
  doc.text(pdfSafeText(opts.companyName), marginLeft, y);
  doc.setFontSize(11);
  doc.text("Staff Payroll", pageWidth - marginRight, y, { align: "right" });
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text(pdfSafeText(opts.payrollMonthLabel), marginLeft, y);
  doc.text("Internal document", pageWidth - marginRight, y, { align: "right" });
  y += 5;

  autoTable(doc, {
    startY: y,
    head: [PDF_HEADERS.map(pdfSafeText)],
    body: opts.rows.map(rowCells),
    foot: [totalCells(opts.rows)],
    theme: "grid",
    styles: {
      fontSize: 6.5,
      cellPadding: 1.1,
      textColor: BRAND_DARK,
      lineColor: [200, 200, 190],
      lineWidth: 0.12,
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: HEADER_BG,
      textColor: BRAND_DARK,
      fontStyle: "bold",
      fontSize: 6.2,
      valign: "middle",
    },
    footStyles: {
      fillColor: TOTALS_BG,
      textColor: BRAND_DARK,
      fontStyle: "bold",
      fontSize: 6.5,
    },
    columnStyles: {
      0: { cellWidth: 16 },
      1: { cellWidth: 38 },
      2: { cellWidth: 24 },
      3: { cellWidth: 38 },
      4: { halign: "right", cellWidth: 14 },
      5: { halign: "right", cellWidth: 14 },
      6: { halign: "right", cellWidth: 14 },
      7: { halign: "right", cellWidth: 18 },
      8: { halign: "right", cellWidth: 16 },
      9: { halign: "right", cellWidth: 16 },
      10: { halign: "right", cellWidth: 18 },
      11: { halign: "right", cellWidth: 14 },
      12: { halign: "right", cellWidth: 20 },
      13: { halign: "right", cellWidth: 20 },
    },
    margin: { left: marginLeft, right: marginRight, bottom: 12 },
  });

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...FOOTER_TEXT);
    doc.text(
      pdfSafeText(
        `File created on: ${formatExportTimestamp(exportedAt)} - Generated by ${userDisplayName}  |  Internal document`,
      ),
      marginLeft,
      doc.internal.pageSize.getHeight() - 6,
    );
    doc.text(
      `Page ${page} of ${pageCount}`,
      pageWidth - marginRight,
      doc.internal.pageSize.getHeight() - 6,
      { align: "right" },
    );
  }

  const dataUri = doc.output("datauristring");
  const base64 = dataUri.includes(",")
    ? dataUri.slice(dataUri.indexOf(",") + 1)
    : dataUri;
  const xlsxName = buildPayrollExportFilename(opts.venueName, opts.monthKey);
  const filename = xlsxName.replace(/\.xlsx$/i, ".pdf");

  return {
    filename,
    base64,
    mimeType: "application/pdf",
  };
}
