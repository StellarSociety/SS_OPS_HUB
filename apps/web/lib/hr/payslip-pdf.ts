import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { DEFAULT_PAYSLIP_FOOTER_DISCLAIMER } from "@/lib/hr/types";
import { sortPayslipLines } from "@/lib/hr/payslip-line-order";

export type PayslipPdfLeaveKind = {
  code: string;
  name: string;
  days: number;
  /** paid | half_pay | unpaid */
  bucket: string;
  explanation: string;
};

export type PayslipPdfLogo = {
  dataUrl: string;
  format: "PNG" | "JPEG" | "WEBP";
  width: number;
  height: number;
};

export type PayslipPdfInput = {
  venueName: string;
  /** Legal employer name in the title, e.g. "Orilla Restaurant FZE". */
  employerLegalName?: string | null;
  /** Printed under the title. */
  companyAddress?: string | null;
  payrollMonthLabel: string;
  periodStart: string;
  periodEnd: string;
  paymentDate: string | null;
  empNo: string;
  fullName: string;
  joiningDate?: string | null;
  departmentName: string | null;
  positionName: string | null;
  paidDays: number;
  unpaidDays: number;
  version: number;
  /** Approved leave in the period (AL, PH, SL, etc.). Omit or empty when none. */
  leaveKinds?: PayslipPdfLeaveKind[];
  /** Preloaded company logo (top of page). */
  logo?: PayslipPdfLogo | null;
  /** Company stamp overlaid on the pay totals box. */
  stamp?: PayslipPdfLogo | null;
  /** Confidentiality / system-generated disclaimer in the footer. */
  footerDisclaimer?: string | null;
  paymentMethod?: string | null;
  bankName?: string | null;
  accountNumber?: string | null;
  lines: Array<{
    category: string;
    label: string;
    /** Payable amount after any rate-discount deduction. */
    amount: number;
    /** Fixed / earnings value before percent rate discount. */
    baseAmount?: number | null;
    /** Percent rate discount applied to this line (0–100). */
    deductionPercent?: number | null;
    /** AED impact of that percent discount on this line. */
    deductionValue?: number | null;
  }>;
  grossEarnings: number;
  totalDeductions: number;
  netSalary: number;
};

/** Derive before-deduction + discount display fields from a stored line. */
export function derivePayslipLineDiscountFields(input: {
  amount: number;
  meta?: { rateDiscountPercent?: number | null } | null;
}): {
  baseAmount: number | null;
  deductionPercent: number | null;
  deductionValue: number | null;
} {
  const amount = Number(input.amount);
  const pct = Number(input.meta?.rateDiscountPercent ?? 0);
  if (
    !Number.isFinite(amount) ||
    !Number.isFinite(pct) ||
    !(pct > 0 && pct < 100)
  ) {
    return { baseAmount: null, deductionPercent: null, deductionValue: null };
  }
  const factor = 1 - pct / 100;
  const baseAmount = Math.round((amount / factor) * 100) / 100;
  const deductionValue = Math.round((baseAmount - amount) * 100) / 100;
  return { baseAmount, deductionPercent: pct, deductionValue };
}

function formatDeductionCell(
  percent: number | null | undefined,
  value: number | null | undefined,
): string {
  const hasPct = percent != null && Number.isFinite(percent) && percent > 0;
  const hasVal = value != null && Number.isFinite(value) && value > 0;
  if (!hasPct && !hasVal) return "-";
  if (hasPct && hasVal) return `${percent}% / ${money(value!)}`;
  if (hasPct) return `${percent}%`;
  return money(value!);
}

export { resolvePayslipEmployerHeader } from "@/lib/hr/payslip-letterhead";

function money(n: number): string {
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
    minimumFractionDigits: 2,
  }).format(n);
}

/** Format YYYY-MM-DD for Helvetica PDF text (no unicode glyphs). */
function formatPdfDate(iso: string | null | undefined): string {
  const raw = String(iso ?? "").trim().slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return raw || "-";
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const month = months[Number(m[2]) - 1] ?? m[2];
  return `${Number(m[3])} ${month} ${m[1]}`;
}

function formatPdfPeriod(start: string, end: string): string {
  return `${formatPdfDate(start)}  -  ${formatPdfDate(end)}`;
}

/** Strip glyphs Helvetica cannot render. */
function pdfSafeText(value: string): string {
  return value
    .replace(/[—–−]/g, "-")
    .replace(/[→←↔]/g, "-")
    .replace(/[·•]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function formatLeaveDays(days: number): string {
  const n = Number(days);
  if (!Number.isFinite(n)) return "-";
  const rounded = Math.round(n * 100) / 100;
  const label = rounded === 1 ? "day" : "days";
  return `${rounded} ${label}`;
}

function leaveBucketLabel(bucket: string): string {
  if (bucket === "half_pay") return "Half pay";
  if (bucket === "unpaid") return "Unpaid";
  return "Paid";
}

export function formatPayslipPaymentMethodLabel(
  method: string | null | undefined,
): string {
  const raw = String(method ?? "").trim().toLowerCase();
  if (!raw) return "-";
  if (raw === "wps") return "WPS / Bank transfer";
  if (raw === "bank_transfer") return "Bank transfer";
  if (raw === "cash") return "Cash";
  if (raw === "cheque") return "Cheque";
  if (raw === "other") return "Other";
  return pdfSafeText(method ?? "-");
}

function formatAccountNumber(iban: string | null | undefined): string {
  const cleaned = String(iban ?? "").replace(/\s+/g, "").trim();
  if (!cleaned) return "-";
  // Group IBAN for readability: AE12 3456 7890 ...
  return cleaned.replace(/(.{4})/g, "$1 ").trim();
}

/** Keep readable names; strip path/control chars unsafe in downloads. */
function sanitizeFilenamePart(value: string): string {
  return value
    .replace(/[/\\?%*:|"<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildPayslipPdfFilename(input: {
  fullName: string;
  empNo: string;
  version: number;
}): string {
  const name = sanitizeFilenamePart(input.fullName) || "Employee";
  const empNo = sanitizeFilenamePart(input.empNo) || "unknown";
  return `Payslip - ${name} - ${empNo} (v${input.version}).pdf`;
}

function absoluteAssetUrl(url: string): string {
  if (/^https?:\/\//i.test(url) || url.startsWith("data:")) return url;
  if (typeof window !== "undefined") {
    return new URL(url, window.location.origin).toString();
  }
  const base = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  return `${base}${url.startsWith("/") ? url : `/${url}`}`;
}

function assetPathWithoutQuery(url: string): string {
  return url.split("?")[0] ?? url;
}

/**
 * Load a venue logo/stamp for PDF embedding (browser).
 * Raster PNGs keep their original bytes + alpha (no canvas re-encode).
 * SVGs are rasterized via canvas to PNG.
 */
export async function loadPayslipPdfLogo(
  url: string | null | undefined,
): Promise<PayslipPdfLogo | null> {
  if (!url || typeof window === "undefined") return null;

  try {
    const response = await fetch(absoluteAssetUrl(url));
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    const lowerUrl = assetPathWithoutQuery(url).toLowerCase();
    const headerType = (response.headers.get("content-type") || "").toLowerCase();

    const isJpeg =
      lowerUrl.includes(".jpg") ||
      lowerUrl.includes(".jpeg") ||
      headerType.includes("jpeg") ||
      (bytes[0] === 0xff && bytes[1] === 0xd8);
    const isWebp =
      lowerUrl.includes(".webp") ||
      headerType.includes("webp") ||
      (bytes.length >= 12 &&
        bytes[0] === 0x52 &&
        bytes[1] === 0x49 &&
        bytes[2] === 0x46 &&
        bytes[3] === 0x46 &&
        bytes[8] === 0x57 &&
        bytes[9] === 0x45 &&
        bytes[10] === 0x42 &&
        bytes[11] === 0x50);
    const isSvg =
      lowerUrl.includes(".svg") ||
      headerType.includes("svg") ||
      new TextDecoder().decode(bytes.slice(0, 64)).includes("<svg");

    if (isSvg) {
      const svgText = new TextDecoder().decode(bytes);
      const svgBlob = new Blob([svgText], {
        type: "image/svg+xml;charset=utf-8",
      });
      const objectUrl = URL.createObjectURL(svgBlob);
      try {
        return await rasterizeImageUrlToPng(objectUrl);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    }

    // jsPDF reliably embeds PNG/JPEG only — convert WebP (incl. alpha) via canvas.
    if (isWebp) {
      const objectUrl = URL.createObjectURL(
        new Blob([bytes], { type: "image/webp" }),
      );
      try {
        return await rasterizeImageUrlToPng(objectUrl);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    }

    // Preserve original raster bytes (keeps PNG alpha channel intact).
    // Avoid String.fromCharCode(...hugeArray) — it blows the call stack on large stamps.
    let binary = "";
    const chunk = 0x2000;
    for (let i = 0; i < bytes.length; i += chunk) {
      const slice = bytes.subarray(i, i + chunk);
      binary += String.fromCharCode.apply(
        null,
        slice as unknown as number[],
      );
    }
    const format: PayslipPdfLogo["format"] = isJpeg ? "JPEG" : "PNG";
    const mime = format === "JPEG" ? "image/jpeg" : "image/png";
    const dataUrl = `data:${mime};base64,${btoa(binary)}`;

    return await new Promise<PayslipPdfLogo | null>((resolve) => {
      const image = new Image();
      image.onload = () =>
        resolve({
          dataUrl,
          format,
          width: image.naturalWidth || 400,
          height: image.naturalHeight || 120,
        });
      image.onerror = () => resolve(null);
      image.src = dataUrl;
    });
  } catch {
    return null;
  }
}

/** Draw an image URL onto a canvas and return a PNG data URL (alpha preserved). */
function rasterizeImageUrlToPng(
  objectUrl: string,
): Promise<PayslipPdfLogo | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth || 400;
      canvas.height = image.naturalHeight || 120;
      const context = canvas.getContext("2d");
      if (!context) {
        resolve(null);
        return;
      }
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve({
        dataUrl: canvas.toDataURL("image/png"),
        format: "PNG",
        width: canvas.width,
        height: canvas.height,
      });
    };
    image.onerror = () => resolve(null);
    image.src = objectUrl;
  });
}

function buildPayslipDoc(input: PayslipPdfInput): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 48;
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - margin * 2;
  const centerX = pageWidth / 2;
  let y = margin;

  const logo = input.logo ?? null;
  if (logo && logo.width > 0 && logo.height > 0) {
    const maxLogoWidth = 180;
    const maxLogoHeight = 52;
    const aspect = logo.width / logo.height;
    let logoWidth = maxLogoWidth;
    let logoHeight = logoWidth / aspect;
    if (logoHeight > maxLogoHeight) {
      logoHeight = maxLogoHeight;
      logoWidth = logoHeight * aspect;
    }
    doc.addImage(
      logo.dataUrl,
      logo.format,
      centerX - logoWidth / 2,
      y,
      logoWidth,
      logoHeight,
      undefined,
      "FAST",
    );
    y += logoHeight + 12;
  }

  // Full-width rule under the logo
  doc.setDrawColor(61, 66, 31);
  doc.setLineWidth(1);
  doc.line(margin, y, pageWidth - margin, y);
  y += 18;

  const legalName =
    input.employerLegalName?.trim() ||
    input.venueName?.trim() ||
    "Employer";
  const title = `Payslip ${legalName}`;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(61, 66, 31);
  doc.text(title, centerX, y, { align: "center" });
  y += 16;

  const address = input.companyAddress?.trim();
  if (address) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    const addressLine = `Company Address: ${pdfSafeText(address)}`;
    const wrapped = doc.splitTextToSize(addressLine, contentWidth);
    doc.text(wrapped, centerX, y, { align: "center" });
    y += wrapped.length * 12 + 10;
  } else {
    y += 6;
  }

  doc.setTextColor(0, 0, 0);

  const leaveKinds = (input.leaveKinds ?? []).filter((k) => k.days > 0);
  const paidLeaveDays = leaveKinds
    .filter((k) => k.bucket === "paid" || k.bucket === "half_pay")
    .reduce((sum, k) => sum + k.days, 0);

  const paidDaysValue =
    paidLeaveDays > 0
      ? `${input.paidDays}  (includes ${formatLeaveDays(paidLeaveDays)} paid leave)`
      : String(input.paidDays);

  const metaRows: Array<[string, string]> = [
    ["Period", formatPdfPeriod(input.periodStart, input.periodEnd)],
    ["Payroll month", input.payrollMonthLabel || "-"],
    ["Employee", `${input.fullName} (${input.empNo})`],
    ["Joining date", formatPdfDate(input.joiningDate)],
    ["Department", input.departmentName?.trim() || "-"],
    ["Position", input.positionName?.trim() || "-"],
    ["Paid days", paidDaysValue],
    ["Unpaid days", String(input.unpaidDays)],
    ["Version", String(input.version)],
  ];

  const labelWidth = 96;
  const valueX = margin + labelWidth;
  const rowGap = 15;

  for (const [label, value] of metaRows) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.text(label, margin, y);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);
    doc.text(pdfSafeText(value), valueX, y);
    y += rowGap;
  }
  y += 8;
  doc.setTextColor(0, 0, 0);

  if (leaveKinds.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Leave in this period", margin, y);
    y += 6;

    autoTable(doc, {
      startY: y,
      head: [["Code", "Leave type", "Days", "Pay", "Explanation"]],
      body: leaveKinds.map((k) => [
        pdfSafeText(k.code),
        pdfSafeText(k.name),
        formatLeaveDays(k.days),
        leaveBucketLabel(k.bucket),
        pdfSafeText(k.explanation),
      ]),
      styles: { fontSize: 8, cellPadding: 3, overflow: "linebreak" },
      headStyles: { fillColor: [61, 66, 31], fontSize: 8 },
      columnStyles: {
        0: { cellWidth: 48 },
        1: { cellWidth: 110 },
        2: { cellWidth: 48 },
        3: { cellWidth: 52 },
        4: { cellWidth: "auto" },
      },
      margin: { left: margin, right: margin },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    y = ((doc as any).lastAutoTable?.finalY ?? y) + 14;
  } else {
    y += 4;
  }

  autoTable(doc, {
    startY: y,
    head: [
      [
        "Category",
        "Description",
        "Before deduction",
        "Deduction % / value",
        "Amount",
      ],
    ],
    body: sortPayslipLines(input.lines).map((l) => [
      pdfSafeText(l.category),
      pdfSafeText(l.label),
      l.baseAmount != null && Number.isFinite(l.baseAmount)
        ? money(l.baseAmount)
        : "-",
      formatDeductionCell(l.deductionPercent, l.deductionValue),
      money(l.amount),
    ]),
    styles: { fontSize: 8, cellPadding: 3, overflow: "linebreak" },
    headStyles: { fillColor: [61, 66, 31], fontSize: 7 },
    columnStyles: {
      0: { cellWidth: 48 },
      1: { cellWidth: "auto" },
      2: { cellWidth: 72, halign: "right" },
      3: { cellWidth: 88, halign: "right" },
      4: { cellWidth: 72, halign: "right" },
    },
    margin: { left: margin, right: margin },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cursorY = ((doc as any).lastAutoTable?.finalY ?? y) + 16;

  // Full-width totals box
  const totalsPadX = 12;
  const totalsPadY = 12;
  const totalsLineGap = 16;
  const totalsBoxHeight = totalsPadY * 2 + totalsLineGap * 2 + 18;
  doc.setDrawColor(61, 66, 31);
  doc.setFillColor(240, 243, 221);
  doc.setLineWidth(0.8);
  doc.roundedRect(margin, cursorY, contentWidth, totalsBoxHeight, 4, 4, "FD");

  const totalsInnerX = margin + totalsPadX;
  const totalsValueX = margin + contentWidth - totalsPadX;
  let totalsY = cursorY + totalsPadY + 10;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(61, 66, 31);
  doc.text("Gross earnings", totalsInnerX, totalsY);
  doc.text(money(input.grossEarnings), totalsValueX, totalsY, {
    align: "right",
  });
  totalsY += totalsLineGap;

  doc.text("Total deductions", totalsInnerX, totalsY);
  doc.text(money(input.totalDeductions), totalsValueX, totalsY, {
    align: "right",
  });
  totalsY += totalsLineGap;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Net salary", totalsInnerX, totalsY);
  doc.text(money(input.netSalary), totalsValueX, totalsY, { align: "right" });

  // Keep payment block directly under the totals box (unchanged layout).
  const paymentStartY = cursorY + totalsBoxHeight + 18;
  cursorY = paymentStartY;
  doc.setTextColor(0, 0, 0);

  const paymentRows: Array<[string, string]> = [
    [
      "Payment Method",
      formatPayslipPaymentMethodLabel(input.paymentMethod),
    ],
    ["Bank Name", pdfSafeText(input.bankName?.trim() || "-")],
    [
      "Account Number",
      formatAccountNumber(input.accountNumber),
    ],
  ];

  for (const [label, value] of paymentRows) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.text(label, margin, cursorY);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);
    doc.text(value, valueX, cursorY);
    cursorY += rowGap;
  }

  // Stamp overlays under net salary on the right — does not shift payment rows.
  const stamp = input.stamp ?? null;
  if (stamp && stamp.width > 0 && stamp.height > 0) {
    try {
      const stampSize = 88;
      const stampX = margin + contentWidth - stampSize - 20;
      const stampY = totalsY - 2;
      doc.addImage(
        stamp.dataUrl,
        stamp.format === "JPEG" ? "JPEG" : "PNG",
        stampX,
        stampY,
        stampSize,
        stampSize,
        undefined,
        "NONE",
        -12,
      );
    } catch (err) {
      console.warn("[payslip-pdf] stamp embed failed:", err);
    }
  }

  drawPayslipFooter(doc, margin, input.footerDisclaimer);
  return doc;
}

function drawPayslipFooter(
  doc: jsPDF,
  margin: number,
  disclaimer?: string | null,
): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - margin * 2;
  const footerTop = pageHeight - 42;

  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.6);
  doc.line(margin, footerTop, pageWidth - margin, footerTop);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  const footerText = pdfSafeText(
    String(disclaimer ?? "").trim() || DEFAULT_PAYSLIP_FOOTER_DISCLAIMER,
  );
  const wrapped = doc.splitTextToSize(footerText, contentWidth);
  doc.text(wrapped, pageWidth / 2, footerTop + 12, { align: "center" });
  doc.setTextColor(0, 0, 0);
}

async function withOptionalBrandAssets(
  input: PayslipPdfInput,
  opts?: {
    venueLogoUrl?: string | null;
    venueStampUrl?: string | null;
  },
): Promise<PayslipPdfInput> {
  let next = input;
  if (!next.logo && opts?.venueLogoUrl) {
    try {
      const logo = await loadPayslipPdfLogo(opts.venueLogoUrl);
      if (logo) next = { ...next, logo };
    } catch (err) {
      console.warn("[payslip-pdf] logo load failed:", err);
    }
  }
  if (!next.stamp && opts?.venueStampUrl) {
    try {
      const stamp = await loadPayslipPdfLogo(opts.venueStampUrl);
      if (stamp) next = { ...next, stamp };
    } catch (err) {
      console.warn("[payslip-pdf] stamp load failed:", err);
    }
  }
  return next;
}

/** Build payslip PDF as a browser data URI (for live preview). */
export function buildPayslipPdfDataUri(input: PayslipPdfInput): string {
  return buildPayslipDoc(input).output("datauristring") as string;
}

export async function buildPayslipPdfDataUriAsync(
  input: PayslipPdfInput,
  venueLogoUrl?: string | null,
  venueStampUrl?: string | null,
): Promise<string> {
  const withAssets = await withOptionalBrandAssets(input, {
    venueLogoUrl,
    venueStampUrl,
  });
  return buildPayslipPdfDataUri(withAssets);
}

/** Build payslip PDF as base64 (for email attachments / server use). */
export function buildPayslipPdfBase64(input: PayslipPdfInput): {
  filename: string;
  base64: string;
} {
  const dataUri = buildPayslipPdfDataUri(input);
  const filename = buildPayslipPdfFilename({
    fullName: input.fullName,
    empNo: input.empNo,
    version: input.version,
  });
  const base64 = dataUri.includes(",")
    ? dataUri.slice(dataUri.indexOf(",") + 1)
    : dataUri;
  return { filename, base64 };
}

/** Generate a single-employee payslip PDF (client-side download). */
export function downloadPayslipPdf(input: PayslipPdfInput): void {
  const doc = buildPayslipDoc(input);
  doc.save(
    buildPayslipPdfFilename({
      fullName: input.fullName,
      empNo: input.empNo,
      version: input.version,
    }),
  );
}

export async function downloadPayslipPdfAsync(
  input: PayslipPdfInput,
  venueLogoUrl?: string | null,
  venueStampUrl?: string | null,
): Promise<void> {
  const withAssets = await withOptionalBrandAssets(input, {
    venueLogoUrl,
    venueStampUrl,
  });
  downloadPayslipPdf(withAssets);
}
