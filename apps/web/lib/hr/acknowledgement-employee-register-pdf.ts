import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  HR_EMAIL_ACKNOWLEDGEMENT_STATUS_LABELS,
  type HrEmailAcknowledgementRecord,
} from "@/lib/hr/acknowledgement";
import {
  employeeAcknowledgementProcessNote,
  formatCertificateDateTime,
  formatCertificateEmployeeMeta,
} from "@/lib/hr/acknowledgement-certificate";
import {
  loadPayslipPdfLogo,
  type PayslipPdfLogo,
} from "@/lib/hr/payslip-pdf";

const BRAND_DARK: [number, number, number] = [61, 66, 31];
const HEADER_BG: [number, number, number] = [240, 243, 221];
const MUTED: [number, number, number] = [90, 92, 70];
const LINE: [number, number, number] = [200, 200, 190];
const FOOTER: [number, number, number] = [110, 110, 110];
const CONFIDENTIALITY_DISCLAIMER =
  "This document contains confidential employee acknowledgement records intended solely for authorized internal use. Unauthorized copying, distribution, or disclosure is prohibited. INTERNAL CONFIDENTIAL DOCUMENT. All rights reserved.";

const TABLE_HEADERS = [
  "Template",
  "Subject",
  "Sent",
  "To",
  "Status",
  "Confirmed",
  "How",
  "Comments",
] as const;

function pdfSafeText(value: string): string {
  return value
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[—–−]/g, "-")
    .replace(/\u00a0/g, " ")
    .trim();
}

function dash(value: string | null | undefined): string {
  const text = String(value ?? "").trim();
  return text || "-";
}

function responseHow(record: HrEmailAcknowledgementRecord): string {
  if (record.status === "acknowledged") return "I Acknowledge";
  if (record.status === "not_acknowledged") return "I do not Acknowledge";
  return "-";
}

function drawHeader(
  doc: jsPDF,
  options: {
    venueName: string;
    staffName: string;
    empNo: string | null;
    department: string | null;
    position: string | null;
    logo: PayslipPdfLogo | null;
  },
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginLeft = 12;
  const marginRight = 12;
  let y = 12;

  if (options.logo && options.logo.width > 0 && options.logo.height > 0) {
    const logoHeight = 8;
    const logoWidth = Math.min(
      32,
      (options.logo.width / options.logo.height) * logoHeight,
    );
    try {
      doc.addImage(
        options.logo.dataUrl,
        options.logo.format === "JPEG" ? "JPEG" : "PNG",
        marginLeft,
        y - 2,
        logoWidth,
        logoWidth / (options.logo.width / options.logo.height),
        undefined,
        "FAST",
      );
    } catch {
      // keep the title even if the logo fails
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...BRAND_DARK);
  doc.text(pdfSafeText(options.venueName), pageWidth - marginRight, y, {
    align: "right",
  });
  y += 5.5;
  doc.setFontSize(11);
  doc.text("Employee acknowledgements", pageWidth - marginRight, y, {
    align: "right",
  });
  y += 8;

  doc.setFont("times", "bold");
  doc.setFontSize(14);
  doc.text(pdfSafeText(options.staffName), marginLeft, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.text(
    pdfSafeText(
      formatCertificateEmployeeMeta(
        options.empNo,
        options.department,
        options.position,
      ),
    ),
    marginLeft,
    y,
  );
  y += 4;
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.3);
  doc.line(marginLeft, y, pageWidth - marginRight, y);
  return y + 5;
}

export async function downloadEmployeeAcknowledgementRegisterPdf(input: {
  venueName: string;
  venueLogoUrl?: string | null;
  staffName: string;
  empNo: string | null;
  department?: string | null;
  position?: string | null;
  records: HrEmailAcknowledgementRecord[];
  filename: string;
}): Promise<void> {
  if (input.records.length === 0) {
    throw new Error("No acknowledgements to export.");
  }

  const logo = input.venueLogoUrl
    ? await loadPayslipPdfLogo(input.venueLogoUrl)
    : null;
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });
  const marginLeft = 12;
  const marginRight = 12;
  const startY = drawHeader(doc, {
    venueName: input.venueName,
    staffName: input.staffName,
    empNo: input.empNo,
    department: input.department ?? null,
    position: input.position ?? null,
    logo,
  });

  const body = input.records.map((row) => [
    pdfSafeText(dash(row.emailKindLabel)),
    pdfSafeText(dash(row.subject)),
    pdfSafeText(formatCertificateDateTime(row.sentAt)),
    pdfSafeText(dash(row.recipientEmail)),
    pdfSafeText(HR_EMAIL_ACKNOWLEDGEMENT_STATUS_LABELS[row.status]),
    pdfSafeText(
      row.status === "pending"
        ? "Awaiting response"
        : formatCertificateDateTime(row.respondedAt),
    ),
    pdfSafeText(responseHow(row)),
    pdfSafeText(dash(row.comments)),
  ]);

  autoTable(doc, {
    startY,
    head: [Array.from(TABLE_HEADERS)],
    body,
    theme: "grid",
    styles: {
      fontSize: 8,
      cellPadding: 2,
      textColor: BRAND_DARK,
      lineColor: LINE,
      lineWidth: 0.2,
      valign: "top",
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: HEADER_BG,
      textColor: BRAND_DARK,
      fontStyle: "bold",
      valign: "middle",
    },
    columnStyles: {
      0: { cellWidth: 28 },
      1: { cellWidth: 46 },
      2: { cellWidth: 28 },
      3: { cellWidth: 38 },
      4: { cellWidth: 26 },
      5: { cellWidth: 28 },
      6: { cellWidth: 32 },
      7: { cellWidth: "auto" },
    },
    margin: { left: marginLeft, right: marginRight, bottom: 28 },
  });

  const lastY =
    (
      doc as jsPDF & {
        lastAutoTable?: { finalY?: number };
      }
    ).lastAutoTable?.finalY ?? startY;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const note = employeeAcknowledgementProcessNote();
  const noteWidth = pageWidth - marginLeft - marginRight;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  const noteLines = doc.splitTextToSize(pdfSafeText(note), noteWidth) as string[];
  const noteBlockHeight = 7 + noteLines.length * 4.2;
  let noteY = lastY + 8;
  if (noteY + noteBlockHeight > pageHeight - 28) {
    doc.addPage();
    noteY = 16;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...BRAND_DARK);
  doc.text("How the employee acknowledged", marginLeft, noteY);
  noteY += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.text(noteLines, marginLeft, noteY);

  const pageCount = doc.getNumberOfPages();
  const disclaimerWidth = pageWidth - marginLeft - marginRight - 36;
  const disclaimerLines = doc.splitTextToSize(
    pdfSafeText(CONFIDENTIALITY_DISCLAIMER),
    disclaimerWidth,
  ) as string[];
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    const footerTop = pageHeight - 18;
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.2);
    doc.line(marginLeft, footerTop, pageWidth - marginRight, footerTop);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...FOOTER);
    doc.text(disclaimerLines, marginLeft, footerTop + 3.6);
    doc.text(
      `Page ${page} of ${pageCount}`,
      pageWidth - marginRight,
      pageHeight - 6,
      { align: "right" },
    );
  }

  doc.save(input.filename);
}
