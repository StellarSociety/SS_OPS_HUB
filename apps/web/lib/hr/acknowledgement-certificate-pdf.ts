import { jsPDF } from "jspdf";
import type { AcknowledgementCertificateContent } from "@/lib/hr/acknowledgement-certificate";
import {
  loadPayslipPdfLogo,
  type PayslipPdfLogo,
} from "@/lib/hr/payslip-pdf";

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const OUTER = 8;
const INNER = 10.5;
const CONTENT_LEFT = 16;
const CONTENT_RIGHT = 194;
const CONTENT_WIDTH = CONTENT_RIGHT - CONTENT_LEFT;
const PAGE_BOTTOM = 284;

const OLIVE: [number, number, number] = [129, 138, 64];
const DARK: [number, number, number] = [61, 66, 31];
const MUTED: [number, number, number] = [90, 92, 70];
const CREAM: [number, number, number] = [240, 243, 221];
const GRAY_BOX: [number, number, number] = [245, 245, 245];
const LINE: [number, number, number] = [210, 214, 180];

type TextRun = {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
};

function pdfSafeText(value: string): string {
  return value
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[—–−]/g, "-")
    .replace(/[→←↔]/g, "-")
    .replace(/[·•]/g, "-")
    .replace(/\u00a0/g, " ");
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

function fontStyle(run: TextRun): "normal" | "bold" | "italic" | "bolditalic" {
  if (run.bold && run.italic) return "bolditalic";
  if (run.bold) return "bold";
  if (run.italic) return "italic";
  return "normal";
}

function applyRunFont(doc: jsPDF, run: TextRun, size: number): void {
  doc.setFont("helvetica", fontStyle(run));
  doc.setFontSize(size);
}

function parseFormattedLines(html: string): TextRun[][] {
  const source = html
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*\/p\s*>/gi, "\n")
    .replace(/<\s*\/div\s*>/gi, "\n")
    .replace(/<\s*p[^>]*>/gi, "")
    .replace(/<\s*div[^>]*>/gi, "");
  const tokens = source.split(/(<[^>]+>)/g);
  const lines: TextRun[][] = [[]];
  let bold = false;
  let italic = false;
  let underline = false;

  function pushText(text: string) {
    const decoded = pdfSafeText(decodeEntities(text));
    if (!decoded) return;
    const parts = decoded.split("\n");
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) lines.push([]);
      if (parts[i]) {
        lines[lines.length - 1].push({
          text: parts[i],
          bold,
          italic,
          underline,
        });
      }
    }
  }

  for (const token of tokens) {
    if (!token) continue;
    const open = token.match(/^<(b|strong|i|em|u)\s*>$/i);
    const close = token.match(/^<\/(b|strong|i|em|u)\s*>$/i);
    if (open) {
      const tag = open[1].toLowerCase();
      if (tag === "b" || tag === "strong") bold = true;
      if (tag === "i" || tag === "em") italic = true;
      if (tag === "u") underline = true;
      continue;
    }
    if (close) {
      const tag = close[1].toLowerCase();
      if (tag === "b" || tag === "strong") bold = false;
      if (tag === "i" || tag === "em") italic = false;
      if (tag === "u") underline = false;
      continue;
    }
    if (token.startsWith("<")) continue;
    pushText(token);
  }

  return lines.length ? lines : [[]];
}

function wrapRuns(
  doc: jsPDF,
  runs: TextRun[],
  width: number,
  fontSize: number,
): TextRun[][] {
  const visual: TextRun[][] = [[]];
  let lineWidth = 0;

  function pushRun(run: TextRun) {
    if (!run.text) return;
    visual[visual.length - 1].push(run);
    applyRunFont(doc, run, fontSize);
    lineWidth += doc.getTextWidth(run.text);
  }

  function newLine() {
    visual.push([]);
    lineWidth = 0;
  }

  for (const run of runs) {
    const words = run.text.split(/(\s+)/);
    for (const word of words) {
      if (!word) continue;
      applyRunFont(doc, run, fontSize);
      const wordWidth = doc.getTextWidth(word);
      const isSpace = /^\s+$/.test(word);
      if (isSpace && visual[visual.length - 1].length === 0) continue;
      if (lineWidth + wordWidth > width && visual[visual.length - 1].length > 0) {
        newLine();
        if (isSpace) continue;
      }
      pushRun({ ...run, text: word });
    }
  }

  return visual.filter((line) => line.some((run) => run.text.trim()));
}

function formattedLineCount(
  doc: jsPDF,
  html: string,
  width: number,
  fontSize: number,
): number {
  const paragraphs = parseFormattedLines(html);
  let count = 0;
  for (const paragraph of paragraphs) {
    if (paragraph.length === 0) {
      count += 1;
      continue;
    }
    count += wrapRuns(doc, paragraph, width, fontSize).length;
  }
  return Math.max(1, count);
}

function drawFormattedHtml(
  doc: jsPDF,
  html: string,
  x: number,
  y: number,
  width: number,
  fontSize: number,
  lineHeight: number,
  maxY: number,
): number {
  const paragraphs = parseFormattedLines(html);
  doc.setTextColor(...DARK);

  for (const paragraph of paragraphs) {
    const visual =
      paragraph.length === 0
        ? [[{ text: " ", bold: false, italic: false, underline: false }]]
        : wrapRuns(doc, paragraph, width, fontSize);

    for (const line of visual) {
      if (y + lineHeight > maxY + 0.2) return maxY;
      let cursor = x;
      for (const run of line) {
        applyRunFont(doc, run, fontSize);
        doc.text(run.text, cursor, y);
        const w = doc.getTextWidth(run.text);
        if (run.underline && run.text.trim()) {
          doc.setDrawColor(...DARK);
          doc.setLineWidth(0.15);
          doc.line(cursor, y + 0.6, cursor + w, y + 0.6);
        }
        cursor += w;
      }
      y += lineHeight;
    }
  }

  return y;
}

function drawPageChrome(doc: jsPDF): void {
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, "F");

  doc.setDrawColor(...OLIVE);
  doc.setLineWidth(1);
  doc.rect(OUTER, OUTER, PAGE_WIDTH - OUTER * 2, PAGE_HEIGHT - OUTER * 2);

  doc.setLineWidth(0.25);
  doc.rect(INNER, INNER, PAGE_WIDTH - INNER * 2, PAGE_HEIGHT - INNER * 2);
}

function drawWrapped(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  width: number,
  lineHeight: number,
): number {
  const lines = doc.splitTextToSize(pdfSafeText(text).trim() || "-", width) as string[];
  for (const line of lines) {
    doc.text(line, x, y);
    y += lineHeight;
  }
  return y;
}

function drawSectionHeading(doc: jsPDF, title: string, y: number): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...OLIVE);
  doc.text(title.toUpperCase(), CONTENT_LEFT, y);
  y += 1.8;
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.25);
  doc.line(CONTENT_LEFT, y, CONTENT_RIGHT, y);
  return y + 4.4;
}

function drawMetaRow(
  doc: jsPDF,
  label: string,
  value: string,
  y: number,
  fontSize = 8,
): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(fontSize);
  doc.setTextColor(...MUTED);
  doc.text(pdfSafeText(label), CONTENT_LEFT, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...DARK);
  return drawWrapped(doc, value, CONTENT_LEFT + 28, y, CONTENT_WIDTH - 28, 3.7);
}

function drawLogo(
  doc: jsPDF,
  logo: PayslipPdfLogo | null,
  y: number,
): number {
  if (!logo || logo.width <= 0 || logo.height <= 0) return y;
  const maxWidth = 36;
  const maxHeight = 11;
  const ratio = logo.width / logo.height;
  let width = maxWidth;
  let height = width / ratio;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * ratio;
  }
  const x = (PAGE_WIDTH - width) / 2;
  try {
    doc.addImage(
      logo.dataUrl,
      logo.format === "JPEG" ? "JPEG" : "PNG",
      x,
      y,
      width,
      height,
      undefined,
      "FAST",
    );
  } catch {
    return y;
  }
  return y + height + 6;
}

function drawHeader(
  doc: jsPDF,
  content: AcknowledgementCertificateContent,
  logo: PayslipPdfLogo | null,
): number {
  let y = INNER + 5;
  y = drawLogo(doc, logo, y);

  doc.setFont("times", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...DARK);
  doc.text(pdfSafeText(content.venueName), PAGE_WIDTH / 2, y, {
    align: "center",
  });
  y += 10;

  doc.setFont("times", "bold");
  doc.setFontSize(16);
  doc.text("Certificate of Acknowledgement", PAGE_WIDTH / 2, y, {
    align: "center",
  });
  y += 5;

  doc.setDrawColor(...OLIVE);
  doc.setLineWidth(0.4);
  const lineWidth = 64;
  doc.line((PAGE_WIDTH - lineWidth) / 2, y, (PAGE_WIDTH + lineWidth) / 2, y);
  y += 5.5;

  doc.setFont("times", "italic");
  doc.setFontSize(9.5);
  doc.setTextColor(...MUTED);
  doc.text("This certifies that", PAGE_WIDTH / 2, y, { align: "center" });
  y += 6;

  doc.setFont("times", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...DARK);
  const nameLines = doc.splitTextToSize(
    pdfSafeText(content.employeeName),
    CONTENT_WIDTH,
  ) as string[];
  for (const line of nameLines.slice(0, 2)) {
    doc.text(line, PAGE_WIDTH / 2, y, { align: "center" });
    y += 5.6;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const meta = pdfSafeText(content.employeeMetaLine);
  const metaWidth = Math.min(CONTENT_WIDTH, doc.getTextWidth(meta) + 5);
  const metaHeight = 5.4;
  doc.setFillColor(...GRAY_BOX);
  doc.roundedRect(
    (PAGE_WIDTH - metaWidth) / 2,
    y - 3.6,
    metaWidth,
    metaHeight,
    0.8,
    0.8,
    "F",
  );
  doc.setTextColor(...MUTED);
  doc.text(meta, PAGE_WIDTH / 2, y, { align: "center" });
  y += 5.2;

  doc.setFillColor(...CREAM);
  doc.roundedRect(CONTENT_LEFT + 52, y, CONTENT_WIDTH - 104, 6.4, 1, 1, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...DARK);
  doc.text(pdfSafeText(content.statusLabel), PAGE_WIDTH / 2, y + 4.3, {
    align: "center",
  });

  return y + 11;
}

function estimateAckBlockHeight(content: AcknowledgementCertificateContent): number {
  const howLines = Math.ceil(content.acknowledgedHow.length / 88);
  const commentLines = content.comments
    ? Math.ceil(content.comments.length / 88)
    : 0;
  return 18 + howLines * 3.7 + commentLines * 3.7;
}

function renderAcknowledgementCertificatePage(
  doc: jsPDF,
  content: AcknowledgementCertificateContent,
  logo: PayslipPdfLogo | null,
): void {
  drawPageChrome(doc);

  let y = drawHeader(doc, content, logo);

  y = drawMetaRow(doc, "Sent", content.sentAtLabel, y) + 0.6;
  y = drawMetaRow(doc, "Template", content.emailKindLabel, y) + 0.6;
  y = drawMetaRow(doc, "From", content.fromEmail, y) + 0.6;
  y = drawMetaRow(doc, "To", content.toEmail, y) + 0.6;
  y = drawMetaRow(doc, "Subject", content.subject, y) + 3.2;

  const ackHeight = estimateAckBlockHeight(content);
  const footerReserve = 8;
  const messageTop = drawSectionHeading(
    doc,
    "Terms & Conditions Policy Message",
    y,
  );
  const messageMaxY = PAGE_BOTTOM - ackHeight - footerReserve;
  const available = Math.max(18, messageMaxY - messageTop);

  const html = content.messageHtml || content.messageText;
  let fontSize = 9;
  let lineHeight = 4.1;
  while (fontSize > 6) {
    const lines = formattedLineCount(doc, html, CONTENT_WIDTH, fontSize);
    lineHeight = fontSize * 0.46;
    if (lines * lineHeight <= available) break;
    fontSize -= 0.4;
  }

  drawFormattedHtml(
    doc,
    html,
    CONTENT_LEFT,
    messageTop,
    CONTENT_WIDTH,
    fontSize,
    lineHeight,
    messageMaxY,
  );

  y = messageMaxY + 3;
  y = drawSectionHeading(doc, "Employee Acknowledgement", y);
  y = drawMetaRow(doc, "Status", content.statusLabel, y) + 0.6;
  y = drawMetaRow(doc, "Confirmed", content.respondedAtLabel, y) + 0.6;
  y = drawMetaRow(doc, "How", content.acknowledgedHow, y) + 0.6;
  if (content.comments) {
    drawMetaRow(doc, "Comments", content.comments, y);
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...MUTED);
  doc.text(
    pdfSafeText(
      `Generated ${content.generatedAtLabel}  ·  ${content.venueName}`,
    ),
    PAGE_WIDTH / 2,
    PAGE_HEIGHT - OUTER - 3.4,
    { align: "center" },
  );
}

export async function buildAcknowledgementCertificatePdf(
  content: AcknowledgementCertificateContent,
  venueLogoUrl?: string | null,
): Promise<jsPDF> {
  const logo = venueLogoUrl ? await loadPayslipPdfLogo(venueLogoUrl) : null;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  renderAcknowledgementCertificatePage(doc, content, logo);
  return doc;
}

export async function buildEmployeeAcknowledgementCertificatesPdf(
  contents: AcknowledgementCertificateContent[],
  venueLogoUrl?: string | null,
): Promise<jsPDF> {
  if (contents.length === 0) {
    throw new Error("No acknowledgements to export.");
  }
  const logo = venueLogoUrl ? await loadPayslipPdfLogo(venueLogoUrl) : null;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  contents.forEach((content, index) => {
    if (index > 0) doc.addPage();
    renderAcknowledgementCertificatePage(doc, content, logo);
  });
  return doc;
}

export async function downloadAcknowledgementCertificatePdf(
  content: AcknowledgementCertificateContent,
  filename: string,
  venueLogoUrl?: string | null,
): Promise<void> {
  const doc = await buildAcknowledgementCertificatePdf(content, venueLogoUrl);
  doc.save(filename);
}

export async function downloadEmployeeAcknowledgementCertificatesPdf(
  contents: AcknowledgementCertificateContent[],
  filename: string,
  venueLogoUrl?: string | null,
): Promise<void> {
  const doc = await buildEmployeeAcknowledgementCertificatesPdf(
    contents,
    venueLogoUrl,
  );
  doc.save(filename);
}
