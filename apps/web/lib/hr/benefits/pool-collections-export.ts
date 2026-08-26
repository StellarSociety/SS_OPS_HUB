"use client";

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatBenefitMonthLabel } from "./period";
import {
  suggestedPoolCollectionsFromGratuityRun,
  type BenefitPoolCollectionsRow,
  type GratuityRunPoolHint,
} from "./pool-collections";
import { loadPayslipPdfLogo } from "@/lib/hr/payslip-pdf";
import {
  buildExcelWorkbook,
  downloadExcelWorkbook,
} from "@/lib/sales/excel-utils";

export type PoolCollectionsExportFormat = "pdf" | "excel";

export type PoolCollectionsExportMonth = {
  monthKey: string;
  label: string;
  ose: number;
  activities: number;
  rounding: number;
  withheldRetain: number;
  deducted: number;
  notes: string;
  recorded: boolean;
};

export type ExportPoolCollectionsOptions = {
  venueName: string;
  venueLogoUrl?: string | null;
  months: PoolCollectionsExportMonth[];
  osePercent: number;
  activitiesPercent: number;
  exportedAt: Date;
  userDisplayName: string;
};

const BRAND_DARK: [number, number, number] = [61, 66, 31];
const HEADER_BG: [number, number, number] = [240, 243, 221];
const TOTALS_BG: [number, number, number] = [226, 232, 200];
const FOOTER_TEXT: [number, number, number] = [110, 110, 110];

function monthKeyFromDate(dateStr: string): string {
  return dateStr.slice(0, 7);
}

function asAmount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function deductedFromSources(
  stored: number | null | undefined,
  suggested: number | null | undefined,
): number {
  if (suggested != null && !(asAmount(stored) > 0)) return asAmount(suggested);
  if (stored != null) return asAmount(stored);
  return asAmount(suggested);
}

export function sortPoolCollectionsMonthsNewestFirst(
  months: PoolCollectionsExportMonth[],
): PoolCollectionsExportMonth[] {
  return [...months].sort((a, b) =>
    a.monthKey < b.monthKey ? 1 : a.monthKey > b.monthKey ? -1 : 0,
  );
}

export function buildPoolCollectionsPeriodLabel(
  months: PoolCollectionsExportMonth[],
): string {
  const sorted = sortPoolCollectionsMonthsNewestFirst(months);
  if (sorted.length === 0) return "No months";
  if (sorted.length === 1) return sorted[0]!.label;
  return `${sorted[sorted.length - 1]!.label} - ${sorted[0]!.label}`;
}

export function sumPoolCollectionsMonths(months: PoolCollectionsExportMonth[]): {
  ose: number;
  activities: number;
  rounding: number;
  withheldRetain: number;
  deducted: number;
  total: number;
} {
  return months.reduce(
    (acc, row) => ({
      ose: round2(acc.ose + row.ose),
      activities: round2(acc.activities + row.activities),
      rounding: round2(acc.rounding + row.rounding),
      withheldRetain: round2(acc.withheldRetain + row.withheldRetain),
      deducted: round2(acc.deducted + row.deducted),
      total: round2(acc.total + monthTotal(row)),
    }),
    { ose: 0, activities: 0, rounding: 0, withheldRetain: 0, deducted: 0, total: 0 },
  );
}

export function monthTotal(row: PoolCollectionsExportMonth): number {
  return round2(
    row.ose + row.activities + row.rounding + row.withheldRetain + row.deducted,
  );
}

export function buildPoolCollectionsExportMonths(
  rows: BenefitPoolCollectionsRow[],
  gratuityRunByMonth: Record<string, GratuityRunPoolHint>,
  osePercent: number,
  activitiesPercent: number,
): PoolCollectionsExportMonth[] {
  const keys = new Set<string>();
  for (const row of rows) keys.add(monthKeyFromDate(row.benefit_month));
  for (const key of Object.keys(gratuityRunByMonth)) keys.add(key);

  const byKey = new Map(
    rows.map((row) => [monthKeyFromDate(row.benefit_month), row] as const),
  );

  const months: PoolCollectionsExportMonth[] = [];
  for (const monthKey of keys) {
    const existing = byKey.get(monthKey) ?? null;
    const hint = gratuityRunByMonth[monthKey] ?? null;
    const suggested = hint
      ? suggestedPoolCollectionsFromGratuityRun(
          hint,
          osePercent,
          activitiesPercent,
        )
      : null;
    if (!existing && !suggested) continue;

    const ose = existing
      ? asAmount(existing.ose_amount)
      : asAmount(suggested?.oseAmount);
    const activities = existing
      ? asAmount(existing.staff_activities_amount)
      : asAmount(suggested?.staffActivitiesAmount);
    const rounding = existing
      ? asAmount(existing.rounding_amount)
      : asAmount(suggested?.roundingAmount);
    const withheldRetain = existing
      ? asAmount(existing.withheld_retain_amount)
      : asAmount(suggested?.withheldRetainAmount);
    const deducted = deductedFromSources(
      existing?.benefit_deduction_amount,
      suggested?.benefitDeductionAmount ?? hint?.benefitDeductions,
    );

    months.push({
      monthKey,
      label: formatBenefitMonthLabel(monthKey),
      ose,
      activities,
      rounding,
      withheldRetain,
      deducted,
      notes: existing?.notes?.trim() ?? "",
      recorded: Boolean(existing),
    });
  }

  return sortPoolCollectionsMonthsNewestFirst(months);
}

export function defaultPoolCollectionsMonthKey(
  months: PoolCollectionsExportMonth[],
  preferredKey?: string,
): string {
  if (preferredKey && months.some((m) => m.monthKey === preferredKey)) {
    return preferredKey;
  }
  return months[0]?.monthKey ?? "";
}

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
  const name = userDisplayName.trim() || "Unknown";
  return `File created on: ${formatExportTimestamp(exportedAt)} - Generated by ${name}  |  Internal document`;
}

function pdfSafeText(value: string): string {
  return value
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/[\u00B7\u2022]/g, "|")
    .replace(/[^\x20-\x7E]/g, "?");
}

function moneyPlain(amount: number): string {
  return new Intl.NumberFormat("en-AE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function buildPoolCollectionsFilename(
  venueName: string,
  periodLabel: string,
  format: PoolCollectionsExportFormat,
  exportedAt: Date = new Date(),
): string {
  const venue = sanitizeFilenamePart(venueName);
  const period = sanitizeFilenamePart(periodLabel);
  const stamp = formatExportDateStamp(exportedAt);
  const extension = format === "pdf" ? "pdf" : "xlsx";
  return `${venue} Pool Collections ${period} ${stamp}.${extension}`;
}

function tableHeaders(osePercent: number, activitiesPercent: number): string[] {
  return [
    "Month",
    `OS&E (${osePercent}%)`,
    `Staff activities (${activitiesPercent}%)`,
    "Rounding",
    "Withheld retain",
    "Deducted",
    "Total",
    "Notes",
  ];
}

function bodyRows(months: PoolCollectionsExportMonth[]): string[][] {
  return sortPoolCollectionsMonthsNewestFirst(months).map((row) => [
    row.label,
    moneyPlain(row.ose),
    moneyPlain(row.activities),
    moneyPlain(row.rounding),
    moneyPlain(row.withheldRetain),
    moneyPlain(row.deducted),
    moneyPlain(monthTotal(row)),
    row.notes,
  ]);
}

function drawFooter(
  doc: jsPDF,
  exportedAt: Date,
  userDisplayName: string,
  marginLeft: number,
  marginRight: number,
): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFontSize(7.5);
    doc.setTextColor(...FOOTER_TEXT);
    doc.text(
      pdfSafeText(buildInternalDocumentLine(exportedAt, userDisplayName)),
      marginLeft,
      doc.internal.pageSize.getHeight() - 8,
    );
    doc.text(
      `Page ${page} of ${pageCount}`,
      pageWidth - marginRight,
      doc.internal.pageSize.getHeight() - 8,
      { align: "right" },
    );
  }
}

async function exportPoolCollectionsPdf(
  options: ExportPoolCollectionsOptions,
): Promise<void> {
  const {
    venueName,
    venueLogoUrl,
    months,
    osePercent,
    activitiesPercent,
    exportedAt,
    userDisplayName,
  } = options;
  if (months.length === 0) throw new Error("Select at least one month.");

  const periodLabel = buildPoolCollectionsPeriodLabel(months);
  const totals = sumPoolCollectionsMonths(months);
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });
  const marginLeft = 12;
  const marginRight = 12;
  const pageWidth = doc.internal.pageSize.getWidth();
  const logo = venueLogoUrl ? await loadPayslipPdfLogo(venueLogoUrl) : null;

  let y = 12;
  if (logo && logo.width > 0 && logo.height > 0) {
    const logoHeight = 8;
    const logoWidth = Math.min(32, (logo.width / logo.height) * logoHeight);
    doc.addImage(
      logo.dataUrl,
      logo.format,
      marginLeft,
      y - 2,
      logoWidth,
      logoWidth / (logo.width / logo.height),
    );
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...BRAND_DARK);
  doc.text(pdfSafeText(venueName), pageWidth - marginRight, y, {
    align: "right",
  });
  y += 6;
  doc.setFontSize(12);
  doc.text("Pool collections", pageWidth - marginRight, y, { align: "right" });
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  doc.text(
    pdfSafeText(
      `${periodLabel}${months.length > 1 ? `  (${months.length} months)` : ""}`,
    ),
    pageWidth - marginRight,
    y,
    { align: "right" },
  );
  y += 8;

  autoTable(doc, {
    startY: y,
    head: [tableHeaders(osePercent, activitiesPercent)],
    body: bodyRows(months).map((row) => row.map(pdfSafeText)),
    foot: [
      [
        "Total",
        moneyPlain(totals.ose),
        moneyPlain(totals.activities),
        moneyPlain(totals.rounding),
        moneyPlain(totals.withheldRetain),
        moneyPlain(totals.deducted),
        moneyPlain(totals.total),
        "",
      ].map(pdfSafeText),
    ],
    theme: "grid",
    styles: {
      fontSize: 8,
      cellPadding: 1.6,
      textColor: BRAND_DARK,
      lineColor: [200, 200, 190],
      lineWidth: 0.15,
      overflow: "linebreak",
      valign: "middle",
    },
    headStyles: {
      fillColor: HEADER_BG,
      textColor: BRAND_DARK,
      fontStyle: "bold",
    },
    footStyles: {
      fillColor: TOTALS_BG,
      textColor: BRAND_DARK,
      fontStyle: "bold",
    },
    columnStyles: {
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right" },
      5: { halign: "right" },
      6: { halign: "right" },
    },
  });

  drawFooter(doc, exportedAt, userDisplayName, marginLeft, marginRight);
  doc.save(
    buildPoolCollectionsFilename(venueName, periodLabel, "pdf", exportedAt),
  );
}

async function exportPoolCollectionsExcel(
  options: ExportPoolCollectionsOptions,
): Promise<void> {
  const {
    venueName,
    months,
    osePercent,
    activitiesPercent,
    exportedAt,
    userDisplayName,
  } = options;
  if (months.length === 0) throw new Error("Select at least one month.");

  const periodLabel = buildPoolCollectionsPeriodLabel(months);
  const totals = sumPoolCollectionsMonths(months);
  const dataRows: (string | number)[][] = sortPoolCollectionsMonthsNewestFirst(
    months,
  ).map((row) => [
    row.label,
    Number(row.ose.toFixed(2)),
    Number(row.activities.toFixed(2)),
    Number(row.rounding.toFixed(2)),
    Number(row.withheldRetain.toFixed(2)),
    Number(row.deducted.toFixed(2)),
    Number(monthTotal(row).toFixed(2)),
    row.notes,
  ]);
  dataRows.push([
    "Total",
    Number(totals.ose.toFixed(2)),
    Number(totals.activities.toFixed(2)),
    Number(totals.rounding.toFixed(2)),
    Number(totals.withheldRetain.toFixed(2)),
    Number(totals.deducted.toFixed(2)),
    Number(totals.total.toFixed(2)),
    "",
  ]);

  const workbook = await buildExcelWorkbook(
    "Collections",
    tableHeaders(osePercent, activitiesPercent),
    dataRows,
    [
      ["Pool collections"],
      ["Venue", venueName],
      ["Period", periodLabel],
      ["Months", String(months.length)],
      ["Generated", formatExportTimestamp(exportedAt)],
      ["Generated by", userDisplayName],
      [],
      ["Amounts are AED. Deducted is taken from staff payouts via benefit deductions."],
    ],
  );

  await downloadExcelWorkbook(
    workbook,
    buildPoolCollectionsFilename(venueName, periodLabel, "excel", exportedAt),
  );
}

export async function exportPoolCollections(
  format: PoolCollectionsExportFormat,
  options: ExportPoolCollectionsOptions,
): Promise<void> {
  if (format === "pdf") {
    await exportPoolCollectionsPdf(options);
    return;
  }
  await exportPoolCollectionsExcel(options);
}
