"use client";

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatAed, formatDateOnly } from "@/lib/hr/derived";
import {
  EMPLOYMENT_STATUS_NAMES,
  normalizeEmploymentStatusName,
} from "@/lib/hr/employment-status";
import { loadPayslipPdfLogo } from "@/lib/hr/payslip-pdf";
import {
  normalizeVisaStatusLabel,
  VISA_STATUS_OPTIONS,
  type VisaEmployeeRow,
} from "@/lib/hr/types";
import { WORKING_STATUS } from "@/lib/hr/working-status";

export type VisaEmployeesExportFormat = "pdf" | "excel";

export type VisaEmployeesExportFilters = {
  workingStatuses: string[];
  employmentStatuses: string[];
  visaStatuses: string[];
};

export type VisaEmployeesOptionalColumn =
  | "position"
  | "department"
  | "personalEmail"
  | "phoneNumber"
  | "dob"
  | "country"
  | "passportNumber"
  | "passportExpiry";

export const VISA_EMPLOYEES_OPTIONAL_COLUMNS: Array<{
  id: VisaEmployeesOptionalColumn;
  label: string;
}> = [
  { id: "position", label: "Position" },
  { id: "department", label: "Department" },
  { id: "personalEmail", label: "Personal email" },
  { id: "phoneNumber", label: "Phone number" },
  { id: "dob", label: "DOB" },
  { id: "country", label: "Country" },
  { id: "passportNumber", label: "Passport number" },
  { id: "passportExpiry", label: "Passport exp date" },
];

export type ExportVisaEmployeesOptions = {
  venueName: string;
  venueAddress?: string | null;
  venueLogoUrl?: string | null;
  rows: VisaEmployeeRow[];
  exportedAt: Date;
  userDisplayName: string;
  filters?: VisaEmployeesExportFilters;
  optionalColumns?: VisaEmployeesOptionalColumn[];
};

const BRAND_DARK: [number, number, number] = [61, 66, 31];
const HEADER_BG: [number, number, number] = [240, 243, 221];
const FOOTER_TEXT: [number, number, number] = [110, 110, 110];
const RULE_COLOR: [number, number, number] = [61, 66, 31];
const META_TEXT: [number, number, number] = [72, 78, 42];
const META_LABEL: [number, number, number] = [80, 80, 80];

/** Fixed columns before optional fields (optional fields insert after Name). */
const LEADING_PDF_COLUMNS = [
  { key: "empNo", header: "Emp no", width: 15, bold: true, flex: 0 },
  { key: "name", header: "Name", width: 42, flex: 3 },
] as const;

/** Fixed columns after optional fields. */
const TRAILING_PDF_COLUMNS = [
  { key: "employment", header: "Employment", width: 20, flex: 0 },
  { key: "visaStatus", header: "Visa status", width: 26, flex: 1 },
  { key: "visaNumber", header: "Visa no.", width: 22, flex: 0 },
  {
    key: "issueDate",
    header: "Issue date",
    width: 18,
    align: "right" as const,
    flex: 0,
  },
  {
    key: "expiryDate",
    header: "Expiry date",
    width: 18,
    align: "right" as const,
    flex: 0,
  },
  {
    key: "cancelDate",
    header: "Cancelation date",
    width: 20,
    align: "right" as const,
    flex: 0,
  },
] as const;

type PdfColumnDef = {
  key: string;
  header: string;
  width: number;
  bold?: boolean;
  align?: "left" | "right";
  flex?: number;
  optionalId?: VisaEmployeesOptionalColumn;
};

const OPTIONAL_PDF_META: Record<
  VisaEmployeesOptionalColumn,
  { header: string; width: number; align?: "left" | "right"; flex: number }
> = {
  position: { header: "Position", width: 32, flex: 2 },
  department: { header: "Department", width: 28, flex: 2 },
  personalEmail: { header: "Personal email", width: 38, flex: 2 },
  phoneNumber: { header: "Phone", width: 24, flex: 0 },
  dob: { header: "DOB", width: 18, align: "right", flex: 0 },
  country: { header: "Country", width: 22, flex: 1 },
  passportNumber: { header: "Passport no.", width: 24, flex: 0 },
  passportExpiry: { header: "Passport exp", width: 20, align: "right", flex: 0 },
};

const WORKING_STATUS_OPTIONS = Object.values(WORKING_STATUS);

const VISA_STATUS_SHORT: Record<string, string> = {
  "Visa Active self owned": "Active (self)",
  "Visa Active Provided": "Active (provided)",
  "Visa Pending": "Pending",
  "Visa Applied Pending": "Pending",
  "Visa Dispute": "Dispute",
  "Visa Canceled": "Canceled",
};

function sanitizeFilenamePart(value: string): string {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ");
}

function formatExportDateStamp(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);
  return `${day}-${month}-${year}`;
}

function formatExportTimestamp(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

function buildInternalDocumentLine(
  exportedAt: Date,
  userDisplayName: string,
): string {
  const name = exportPersonName(userDisplayName);
  return `File created on: ${formatExportTimestamp(exportedAt)} - Generated by ${name}  |  Confidential  |  Internal document`;
}

const FOOTER_PROHIBITION =
  "Unauthorized copying or disclosure is prohibited.";

/** Prefer display name only — strip trailing "(email)" from export labels. */
export function exportPersonName(userDisplayName: string): string {
  const trimmed = userDisplayName.trim();
  if (!trimmed) return "Unknown";
  const withEmail = /^(.*?)\s*\([^)]*@[^)]*\)\s*$/.exec(trimmed);
  if (withEmail?.[1]?.trim()) return withEmail[1].trim();
  return trimmed;
}

/** Helvetica-safe text (no smart punctuation). */
function pdfSafeText(value: string): string {
  return value
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/[\u00B7\u2022\u2023\u2043]/g, "|")
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/\u2026/g, "...")
    .replace(/[^\x20-\x7E]/g, "?");
}

export function workingStatusOf(row: VisaEmployeeRow): string {
  return row.staff.working_status?.name?.trim() || WORKING_STATUS.active;
}

export function employmentStatusOf(row: VisaEmployeeRow): string {
  return normalizeEmploymentStatusName(row.staff.employment_status?.name);
}

export function visaStatusOf(row: VisaEmployeeRow): string {
  const raw = (row.visaStatus || row.staff.visa_status || "").trim();
  if (!raw) return "";
  return normalizeVisaStatusLabel(raw) ?? "";
}

export function shortVisaStatusLabel(status: string | null | undefined): string {
  const normalized = normalizeVisaStatusLabel(status);
  if (!normalized) return "";
  return VISA_STATUS_SHORT[normalized] ?? normalized.replace(/^Visa\s+/i, "");
}

export function isSelfOwnedVisaStatusLabel(
  status: string | null | undefined,
): boolean {
  return String(status ?? "")
    .trim()
    .toLowerCase()
    .includes("self owned");
}

export function defaultEmploymentStatusesForExport(
  available: string[],
): string[] {
  const wanted = new Set<string>([
    EMPLOYMENT_STATUS_NAMES.onBoard,
    EMPLOYMENT_STATUS_NAMES.offBoard,
    EMPLOYMENT_STATUS_NAMES.out,
  ]);
  return available.filter((status) =>
    wanted.has(normalizeEmploymentStatusName(status)),
  );
}

export function normalizeOptionalColumns(
  columns?: VisaEmployeesOptionalColumn[] | null,
): VisaEmployeesOptionalColumn[] {
  if (!columns?.length) return [];
  const selected = new Set(columns);
  return VISA_EMPLOYEES_OPTIONAL_COLUMNS.map((col) => col.id).filter((id) =>
    selected.has(id),
  );
}

function optionalCellValue(
  row: VisaEmployeeRow,
  column: VisaEmployeesOptionalColumn,
): string {
  switch (column) {
    case "position":
      return row.staff.position?.name?.trim() || "";
    case "department":
      return row.staff.department?.name?.trim() || "";
    case "personalEmail":
      return row.staff.personal_email?.trim() || "";
    case "phoneNumber":
      return row.staff.contact_phone?.trim() || "";
    case "dob":
      return row.staff.dob ? formatDateOnly(row.staff.dob) : "";
    case "country":
      return row.staff.nationality?.name?.trim() || "";
    case "passportNumber":
      return row.staff.passport_no?.trim() || "";
    case "passportExpiry":
      return row.staff.passport_expiry
        ? formatDateOnly(row.staff.passport_expiry)
        : "";
    default:
      return "";
  }
}

function fixedCellValue(row: VisaEmployeeRow, key: string): string {
  switch (key) {
    case "empNo":
      return row.staff.emp_no || "";
    case "name":
      return row.staff.full_name || "";
    case "employment":
      return employmentStatusOf(row);
    case "visaStatus":
      return shortVisaStatusLabel(visaStatusOf(row) || "");
    case "visaNumber":
      return row.visaNumber || "";
    case "issueDate":
      return row.issueDate ? formatDateOnly(row.issueDate) : "";
    case "expiryDate":
      return row.expiryDate ? formatDateOnly(row.expiryDate) : "";
    case "cancelDate":
      return row.cancelDate ? formatDateOnly(row.cancelDate) : "";
    default:
      return "";
  }
}

/** Emp no → Name → optional (checkbox order) → employment / visa / dates. */
export function buildPdfColumnPlan(
  optionalColumns?: VisaEmployeesOptionalColumn[] | null,
): PdfColumnDef[] {
  const optional = normalizeOptionalColumns(optionalColumns);
  return [
    ...LEADING_PDF_COLUMNS.map((col) => ({ ...col })),
    ...optional.map((id) => ({
      key: id,
      header: OPTIONAL_PDF_META[id].header,
      width: OPTIONAL_PDF_META[id].width,
      align: OPTIONAL_PDF_META[id].align,
      flex: OPTIONAL_PDF_META[id].flex,
      optionalId: id,
    })),
    ...TRAILING_PDF_COLUMNS.map((col) => ({ ...col })),
  ];
}

/** Width shares for preview table (content-weighted, not uniform). */
export function pdfColumnWidthPercents(
  optionalColumns?: VisaEmployeesOptionalColumn[] | null,
): number[] {
  const plan = buildPdfColumnPlan(optionalColumns);
  const total = plan.reduce((sum, col) => sum + col.width, 0) || 1;
  return plan.map((col) => (col.width / total) * 100);
}

export function filterVisaEmployeeRows(
  rows: VisaEmployeeRow[],
  filters?: VisaEmployeesExportFilters | null,
): VisaEmployeeRow[] {
  if (!filters) return rows;

  const working = new Set(
    filters.workingStatuses.map((s) => s.trim()).filter(Boolean),
  );
  const employment = new Set(
    filters.employmentStatuses
      .map((s) => normalizeEmploymentStatusName(s))
      .filter(Boolean),
  );
  const visa = new Set(
    filters.visaStatuses
      .map((s) => normalizeVisaStatusLabel(s))
      .filter((s): s is string => Boolean(s)),
  );

  return rows.filter((row) => {
    if (working.size > 0 && !working.has(workingStatusOf(row))) return false;
    if (employment.size > 0) {
      const status = employmentStatusOf(row);
      if (!status || !employment.has(status)) return false;
    }
    if (visa.size > 0) {
      const status = visaStatusOf(row);
      if (!status || !visa.has(status)) return false;
    }
    return true;
  });
}

/**
 * Build working-status filter options from the venue lookup list, then any
 * extra names actually present on employees (renamed/custom statuses).
 */
export function collectWorkingStatusOptions(
  rows: VisaEmployeeRow[],
  lookupNames: string[] = [],
): string[] {
  const fromRows = new Set(rows.map(workingStatusOf).filter(Boolean));
  const orderedLookup = lookupNames.map((s) => s.trim()).filter(Boolean);
  const base =
    orderedLookup.length > 0
      ? orderedLookup
      : WORKING_STATUS_OPTIONS.filter((s) => fromRows.has(s));
  const extras = [...fromRows]
    .filter((s) => !base.includes(s))
    .sort((a, b) => a.localeCompare(b));
  return [...base, ...extras];
}

/** Full visa-status filter list (canonical options + any extras on rows). */
export function collectVisaStatusOptions(rows: VisaEmployeeRow[]): string[] {
  const fromRows = new Set(
    rows
      .map(visaStatusOf)
      .filter(Boolean)
      .map((s) => normalizeVisaStatusLabel(s))
      .filter((s): s is string => Boolean(s)),
  );
  const extras = [...fromRows]
    .filter((s) => !(VISA_STATUS_OPTIONS as readonly string[]).includes(s))
    .sort((a, b) => a.localeCompare(b));
  return [...VISA_STATUS_OPTIONS, ...extras];
}

export function buildPdfHeaders(
  optionalColumns?: VisaEmployeesOptionalColumn[] | null,
): string[] {
  return buildPdfColumnPlan(optionalColumns).map((col) => col.header);
}

/** Base headers without optional columns (Emp no + Name + trailing). */
export const VISA_EMPLOYEES_PDF_HEADERS = buildPdfHeaders([]);

export function pdfRowCells(
  row: VisaEmployeeRow,
  optionalColumns?: VisaEmployeesOptionalColumn[] | null,
): string[] {
  return buildPdfColumnPlan(optionalColumns).map((col) =>
    col.optionalId
      ? optionalCellValue(row, col.optionalId)
      : fixedCellValue(row, col.key),
  );
}

export function pdfNumericColumnIndexes(
  optionalColumns?: VisaEmployeesOptionalColumn[] | null,
): Set<number> {
  const indexes = new Set<number>();
  buildPdfColumnPlan(optionalColumns).forEach((col, index) => {
    if (col.align === "right") indexes.add(index);
  });
  return indexes;
}

function buildPdfColumnStyles(
  optionalColumns: VisaEmployeesOptionalColumn[],
  usableWidth: number,
): Record<number, { cellWidth: number; fontStyle?: "bold"; halign?: "right" }> {
  const plan = buildPdfColumnPlan(optionalColumns);
  const preferred = plan.map((col) => col.width);
  const preferredTotal = preferred.reduce((sum, w) => sum + w, 0);
  const widths = [...preferred];

  if (preferredTotal < usableWidth) {
    // Give leftover space to flexible columns (name, position, email, etc.).
    const leftover = usableWidth - preferredTotal;
    const flexWeights = plan.map((col) => Math.max(0, col.flex ?? 0));
    const flexTotal = flexWeights.reduce((sum, w) => sum + w, 0);
    if (flexTotal > 0) {
      flexWeights.forEach((weight, index) => {
        if (weight > 0) widths[index]! += (leftover * weight) / flexTotal;
      });
    } else {
      widths[1] = (widths[1] ?? 0) + leftover;
    }
  } else if (preferredTotal > usableWidth) {
    // Shrink proportionally, keeping date/code columns from collapsing first.
    const mins = plan.map((col) => {
      if (col.align === "right") return Math.min(col.width, 14);
      if (col.key === "empNo") return 12;
      return Math.min(col.width, 10);
    });
    const minTotal = mins.reduce((sum, w) => sum + w, 0);
    if (minTotal >= usableWidth) {
      const scale = usableWidth / preferredTotal;
      preferred.forEach((w, i) => {
        widths[i] = w * scale;
      });
    } else {
      const shrinkable = preferred.map((w, i) => Math.max(0, w - mins[i]!));
      const shrinkTotal = shrinkable.reduce((sum, w) => sum + w, 0) || 1;
      const need = preferredTotal - usableWidth;
      preferred.forEach((w, i) => {
        widths[i] = w - (need * shrinkable[i]!) / shrinkTotal;
      });
    }
  }

  const styles: Record<
    number,
    { cellWidth: number; fontStyle?: "bold"; halign?: "right" }
  > = {};
  plan.forEach((col, index) => {
    const style: {
      cellWidth: number;
      fontStyle?: "bold";
      halign?: "right";
    } = { cellWidth: Math.max(8, widths[index] ?? col.width) };
    if (col.bold) style.fontStyle = "bold";
    if (col.align === "right") style.halign = "right";
    styles[index] = style;
  });
  return styles;
}

function excelHeaders(
  optionalColumns: VisaEmployeesOptionalColumn[],
): string[] {
  const optionalHeaders = optionalColumns.map(
    (id) => OPTIONAL_PDF_META[id].header,
  );
  return [
    "Emp no",
    "Name",
    ...optionalHeaders,
    "Employment",
    "Working",
    "Visa status",
    "Visa number",
    "Issue date",
    "Expiry date",
    "Cancelation date",
    "Penalties company absorbed",
    "Penalties employee absorbed",
  ];
}

function excelRowCells(
  row: VisaEmployeeRow,
  optionalColumns: VisaEmployeesOptionalColumn[],
): string[] {
  return [
    row.staff.emp_no || "",
    row.staff.full_name || "",
    ...optionalColumns.map((id) => optionalCellValue(row, id)),
    employmentStatusOf(row),
    workingStatusOf(row),
    visaStatusOf(row),
    row.visaNumber || "",
    row.issueDate ? formatDateOnly(row.issueDate) : "",
    row.expiryDate ? formatDateOnly(row.expiryDate) : "",
    row.cancelDate ? formatDateOnly(row.cancelDate) : "",
    row.penaltiesCompanyAbsorbed > 0
      ? formatAed(row.penaltiesCompanyAbsorbed)
      : "",
    row.penaltiesEmployeeAbsorbed > 0
      ? formatAed(row.penaltiesEmployeeAbsorbed)
      : "",
  ];
}

function excelColumnWidths(headers: string[]): number[] {
  return headers.map((header) => {
    const key = header.toLowerCase();
    if (key === "emp no") return 12;
    if (key === "name") return 28;
    if (key === "position") return 22;
    if (key === "department") return 20;
    if (key.includes("email")) return 30;
    if (key.includes("phone")) return 16;
    if (key === "dob") return 12;
    if (key === "country") return 14;
    if (key.includes("passport")) return 16;
    if (key === "employment" || key === "working") return 14;
    if (key.includes("visa status")) return 18;
    if (key.includes("visa number") || key === "visa no.") return 14;
    if (key.includes("date")) return 14;
    if (key.includes("penalties")) return 18;
    return Math.max(12, Math.min(28, header.length + 2));
  });
}

const EXCEL_BRAND = "FF3D421F";
const EXCEL_HEADER_FILL = "FFF0F3DD";
const EXCEL_META_LABEL = "FF505050";
const EXCEL_STROKE = "FF3D421F";

const EXCEL_THIN_BORDER: Partial<{
  top: { style: "thin"; color: { argb: string } };
  left: { style: "thin"; color: { argb: string } };
  bottom: { style: "thin"; color: { argb: string } };
  right: { style: "thin"; color: { argb: string } };
}> = {
  top: { style: "thin", color: { argb: EXCEL_STROKE } },
  left: { style: "thin", color: { argb: EXCEL_STROKE } },
  bottom: { style: "thin", color: { argb: EXCEL_STROKE } },
  right: { style: "thin", color: { argb: EXCEL_STROKE } },
};

function downloadExcelBuffer(
  buffer: ArrayBuffer | Uint8Array | Buffer,
  filename: string,
): void {
  const bytes =
    buffer instanceof ArrayBuffer
      ? new Uint8Array(buffer)
      : new Uint8Array(buffer);
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function exportVisaEmployeesExcel(
  options: ExportVisaEmployeesOptions,
): Promise<void> {
  const { venueName, venueAddress, exportedAt, userDisplayName, filters } =
    options;
  const optionalColumns = normalizeOptionalColumns(options.optionalColumns);
  const rows = filterVisaEmployeeRows(options.rows, filters);
  const headers = excelHeaders(optionalColumns);
  const dataRows = rows.map((row) => excelRowCells(row, optionalColumns));
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "SS Ops Hub";
  workbook.created = exportedAt;

  const sheet = workbook.addWorksheet("Employees", {
    views: [{ state: "normal", showGridLines: false }],
  });

  const lastCol = headers.length;
  const metaPairs: Array<[string, string]> = [
    ["Venue", venueName],
    ...(venueAddress?.trim()
      ? ([["Address", venueAddress.trim()]] as Array<[string, string]>)
      : []),
    ["Generated", formatExportTimestamp(exportedAt)],
    ["Generated by", exportPersonName(userDisplayName)],
    [
      "Employees",
      `${rows.length} employee${rows.length === 1 ? "" : "s"}`,
    ],
    ["Filters", filterSummaryLine(filters)],
  ];

  // Title
  sheet.mergeCells(1, 1, 1, Math.max(2, lastCol));
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = "Visa employees register";
  titleCell.font = {
    name: "Calibri",
    bold: true,
    size: 16,
    color: { argb: EXCEL_BRAND },
  };
  titleCell.alignment = { vertical: "middle", horizontal: "left" };
  sheet.getRow(1).height = 26;

  // Detail header block
  let rowIndex = 3;
  for (const [label, value] of metaPairs) {
    const labelCell = sheet.getCell(rowIndex, 1);
    const valueCell = sheet.getCell(rowIndex, 2);
    if (lastCol > 2) {
      sheet.mergeCells(rowIndex, 2, rowIndex, lastCol);
    }
    labelCell.value = label;
    labelCell.font = {
      name: "Calibri",
      bold: true,
      size: 11,
      color: { argb: EXCEL_META_LABEL },
    };
    valueCell.value = value;
    valueCell.font = {
      name: "Calibri",
      size: 11,
      color: { argb: EXCEL_BRAND },
    };
    rowIndex += 1;
  }

  const tableStartRow = rowIndex + 1;
  const tableEndRow = tableStartRow + Math.max(dataRows.length, 1);
  const colLetter = (index: number) => {
    let n = index;
    let result = "";
    while (n > 0) {
      const rem = (n - 1) % 26;
      result = String.fromCharCode(65 + rem) + result;
      n = Math.floor((n - 1) / 26);
    }
    return result;
  };
  const tableRef = `A${tableStartRow}:${colLetter(lastCol)}${tableEndRow}`;

  // Ensure at least one body row for a valid Excel table.
  const tableRows =
    dataRows.length > 0
      ? dataRows
      : [headers.map(() => "")];

  sheet.addTable({
    name: "VisaEmployees",
    ref: tableRef,
    headerRow: true,
    totalsRow: false,
    style: {
      theme: "TableStyleMedium2",
      showRowStripes: true,
      showFirstColumn: false,
      showLastColumn: false,
    },
    columns: headers.map((name) => ({
      name,
      filterButton: true,
    })),
    rows: tableRows,
  });

  // Brand header fill + explicit strokes on the whole table range.
  for (let r = tableStartRow; r <= tableEndRow; r += 1) {
    const excelRow = sheet.getRow(r);
    for (let c = 1; c <= lastCol; c += 1) {
      const cell = excelRow.getCell(c);
      cell.border = EXCEL_THIN_BORDER;
      cell.alignment = {
        vertical: "middle",
        horizontal: "left",
        wrapText: false,
      };
      if (r === tableStartRow) {
        cell.font = {
          name: "Calibri",
          bold: true,
          size: 11,
          color: { argb: EXCEL_BRAND },
        };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: EXCEL_HEADER_FILL },
        };
      } else {
        cell.font = {
          name: "Calibri",
          size: 11,
          color: { argb: EXCEL_BRAND },
        };
      }
    }
  }
  sheet.getRow(tableStartRow).height = 20;

  excelColumnWidths(headers).forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });

  // Confidential footer note below the table.
  const noteRow = tableEndRow + 2;
  sheet.mergeCells(noteRow, 1, noteRow, Math.max(2, lastCol));
  const noteCell = sheet.getCell(noteRow, 1);
  noteCell.value =
    "Confidential  |  Internal document  |  Unauthorized copying or disclosure is prohibited.";
  noteCell.font = {
    name: "Calibri",
    size: 9,
    italic: true,
    color: { argb: "FF6E6E6E" },
  };

  const buffer = await workbook.xlsx.writeBuffer();
  downloadExcelBuffer(
    buffer as ArrayBuffer | Uint8Array,
    buildVisaEmployeesFilename(venueName, "excel", exportedAt),
  );
}

export function filterSummaryLine(
  filters?: VisaEmployeesExportFilters | null,
): string {
  if (!filters) return "All statuses";
  const parts: string[] = [];
  if (filters.workingStatuses.length > 0) {
    parts.push(`Working: ${filters.workingStatuses.join(", ")}`);
  }
  if (filters.employmentStatuses.length > 0) {
    parts.push(`Employment: ${filters.employmentStatuses.join(", ")}`);
  }
  if (filters.visaStatuses.length > 0) {
    parts.push(
      `Visa: ${filters.visaStatuses.map(shortVisaStatusLabel).join(", ")}`,
    );
  }
  return parts.length > 0 ? parts.join("  |  ") : "All statuses";
}

export function buildVisaEmployeesFilename(
  venueName: string,
  format: VisaEmployeesExportFormat,
  exportedAt: Date = new Date(),
): string {
  const venue = sanitizeFilenamePart(venueName);
  const stamp = formatExportDateStamp(exportedAt);
  const extension = format === "pdf" ? "pdf" : "xlsx";
  return `${venue} Visa Employees ${stamp}.${extension}`;
}

/** Page margins — 1cm on all sides. */
export const VISA_EMPLOYEES_PDF_PAGE_MARGIN_MM = 10;

/** Top content start below repeating header chrome (landscape). */
export const VISA_EMPLOYEES_PDF_TABLE_START_Y = 32;

/** Footer block height inside the bottom margin area. */
const FOOTER_BLOCK_MM = 11;

function drawPageHeader(
  doc: jsPDF,
  options: {
    venueName: string;
    venueAddress?: string | null;
    employeeCount: number;
    filterSummary: string;
    exportedAt: Date;
    userDisplayName: string;
    logo: Awaited<ReturnType<typeof loadPayslipPdfLogo>>;
  },
  marginLeft: number,
  marginRight: number,
  marginTop: number = VISA_EMPLOYEES_PDF_PAGE_MARGIN_MM,
): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  const logoGap = 3.5;
  const logoMaxWidth = 30;
  const logoHeight = 8;
  let textLeft = marginLeft;
  let textBaseline = marginTop + 3;

  if (options.logo && options.logo.width > 0 && options.logo.height > 0) {
    const logoWidth = Math.min(
      logoMaxWidth,
      (options.logo.width / options.logo.height) * logoHeight,
    );
    const renderedLogoHeight =
      logoWidth / (options.logo.width / options.logo.height);
    doc.addImage(
      options.logo.dataUrl,
      options.logo.format,
      marginLeft,
      marginTop,
      logoWidth,
      renderedLogoHeight,
      undefined,
      "FAST",
    );
    textLeft = marginLeft + logoWidth + logoGap;
  }

  const rightMetaX = pageWidth - marginRight;
  const rightMetaWidth = 72;
  const leftMaxWidth = Math.max(
    80,
    pageWidth - textLeft - marginRight - rightMetaWidth - 8,
  );

  doc.setFont("times", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...BRAND_DARK);
  doc.text(pdfSafeText(options.venueName), textLeft, textBaseline);
  textBaseline += 4.4;

  const address = options.venueAddress?.trim();
  if (address) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...META_LABEL);
    const addressLines = doc.splitTextToSize(
      pdfSafeText(address),
      leftMaxWidth,
    );
    doc.text(addressLines.slice(0, 2), textLeft, textBaseline);
    textBaseline += addressLines.slice(0, 2).length * 3.2 + 0.6;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...BRAND_DARK);
  doc.text("Visa employees register", textLeft, textBaseline);
  textBaseline += 3.8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...META_TEXT);
  const meta = pdfSafeText(
    `${options.employeeCount} employee${options.employeeCount === 1 ? "" : "s"}  |  ${options.filterSummary}`,
  );
  const metaLines = doc.splitTextToSize(meta, leftMaxWidth);
  doc.text(metaLines.slice(0, 2), textLeft, textBaseline);
  textBaseline += metaLines.slice(0, 2).length * 3.1;

  // Right-side generation meta
  const rightTop = marginTop + 3;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...META_LABEL);
  doc.text("Generated", rightMetaX, rightTop, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...BRAND_DARK);
  doc.text(formatExportTimestamp(options.exportedAt), rightMetaX, rightTop + 3.6, {
    align: "right",
  });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...META_LABEL);
  doc.text("Generated by", rightMetaX, rightTop + 8.2, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...BRAND_DARK);
  const byName = pdfSafeText(exportPersonName(options.userDisplayName));
  const byLines = doc.splitTextToSize(byName, rightMetaWidth);
  doc.text(byLines.slice(0, 2), rightMetaX, rightTop + 11.8, { align: "right" });

  const ruleY = Math.max(
    options.logo ? marginTop + logoHeight + 2.5 : 0,
    textBaseline + 1.5,
    marginTop + 19,
  );
  doc.setDrawColor(...RULE_COLOR);
  doc.setLineWidth(0.35);
  doc.line(marginLeft, ruleY, pageWidth - marginRight, ruleY);
}

function drawPageFooter(
  doc: jsPDF,
  options: {
    venueName: string;
    venueAddress?: string | null;
    exportedAt: Date;
    userDisplayName: string;
    page: number;
    pageCount: number;
  },
  marginLeft: number,
  marginRight: number,
  marginBottom: number = VISA_EMPLOYEES_PDF_PAGE_MARGIN_MM,
): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const footerTop = pageHeight - marginBottom - FOOTER_BLOCK_MM;

  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.2);
  doc.line(marginLeft, footerTop, pageWidth - marginRight, footerTop);

  const address = options.venueAddress?.trim();
  const venueLine = address
    ? `${options.venueName}  ·  ${address}`
    : options.venueName;
  const metaMax = pageWidth - marginLeft - marginRight - 28;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...FOOTER_TEXT);
  doc.text(pdfSafeText(venueLine), marginLeft, footerTop + 3.2, {
    maxWidth: metaMax,
  });
  doc.text(pdfSafeText(FOOTER_PROHIBITION), marginLeft, footerTop + 6.4, {
    maxWidth: metaMax,
  });
  doc.text(
    pdfSafeText(
      buildInternalDocumentLine(options.exportedAt, options.userDisplayName),
    ),
    marginLeft,
    footerTop + 9.6,
    {
      maxWidth: metaMax,
    },
  );
  doc.text(
    `Page ${options.page} of ${options.pageCount}`,
    pageWidth - marginRight,
    footerTop + 9.6,
    { align: "right" },
  );
}

async function exportVisaEmployeesPdf(
  options: ExportVisaEmployeesOptions,
): Promise<void> {
  const {
    venueName,
    venueAddress,
    venueLogoUrl,
    exportedAt,
    userDisplayName,
    filters,
  } = options;
  const optionalColumns = normalizeOptionalColumns(options.optionalColumns);
  const rows = filterVisaEmployeeRows(options.rows, filters);
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });
  const margin = VISA_EMPLOYEES_PDF_PAGE_MARGIN_MM;
  const logo = venueLogoUrl ? await loadPayslipPdfLogo(venueLogoUrl) : null;
  const filterSummary = filterSummaryLine(filters);
  const headers = buildPdfHeaders(optionalColumns);
  const usableWidth = doc.internal.pageSize.getWidth() - margin * 2;
  const fontSize = optionalColumns.length >= 4 ? 6.5 : 7.5;
  const headFontSize = optionalColumns.length >= 4 ? 6 : 7;

  autoTable(doc, {
    startY: VISA_EMPLOYEES_PDF_TABLE_START_Y,
    head: [headers],
    body: rows.map((row) =>
      pdfRowCells(row, optionalColumns).map(pdfSafeText),
    ),
    theme: "grid",
    styles: {
      fontSize,
      cellPadding: { top: 1.3, right: 1.1, bottom: 1.3, left: 1.1 },
      textColor: BRAND_DARK,
      lineColor: [200, 200, 190],
      lineWidth: 0.15,
      overflow: "linebreak",
      valign: "middle",
      minCellHeight: 5,
    },
    headStyles: {
      fillColor: HEADER_BG,
      textColor: BRAND_DARK,
      fontStyle: "bold",
      fontSize: headFontSize,
      cellPadding: { top: 1.6, right: 1.1, bottom: 1.6, left: 1.1 },
    },
    alternateRowStyles: {
      fillColor: [250, 251, 246],
    },
    columnStyles: buildPdfColumnStyles(optionalColumns, usableWidth),
    margin: {
      left: margin,
      right: margin,
      top: VISA_EMPLOYEES_PDF_TABLE_START_Y,
      bottom: margin + FOOTER_BLOCK_MM + 1,
    },
    didDrawPage: () => {
      drawPageHeader(
        doc,
        {
          venueName,
          venueAddress,
          employeeCount: rows.length,
          filterSummary,
          exportedAt,
          userDisplayName,
          logo,
        },
        margin,
        margin,
        margin,
      );
    },
  });

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    drawPageFooter(
      doc,
      {
        venueName,
        venueAddress,
        exportedAt,
        userDisplayName,
        page,
        pageCount,
      },
      margin,
      margin,
      margin,
    );
  }

  doc.save(buildVisaEmployeesFilename(venueName, "pdf", exportedAt));
}

export async function exportVisaEmployees(
  format: VisaEmployeesExportFormat,
  options: ExportVisaEmployeesOptions,
): Promise<void> {
  if (format === "pdf") {
    await exportVisaEmployeesPdf(options);
    return;
  }
  await exportVisaEmployeesExcel(options);
}
