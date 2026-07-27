import { isDailyRateDiscountAdjustment } from "./daily-rate";
import { summarizePayrollLeave } from "./leave-summary";
import type { CalculatedEmployeePayroll, PayrollDayFraction } from "./types";
import { deflateRawSync } from "node:zlib";

export type PayrollExportRow = {
  employeeId: string;
  employeeName: string;
  department: string;
  iban: string;
  daysPaid: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  fixedSalary: number;
  variableServiceCharge: number;
  variableGratuity: number;
  variableOthers: number;
  deductionsPercent: number;
  deductionsValue: number;
  netSalary: number;
};

export type PayrollExportAdjustment = {
  staffId: string;
  category: string;
  percentOfDailyRate: number | null;
  daysApplied: number | null;
  amount: number | null;
};

/** @deprecated Use PayrollExportRow — kept for callers that still import the old name. */
export type WpsFileRow = PayrollExportRow;

const EXPORT_HEADERS = [
  "Employee_ID",
  "Employee_Name",
  "Department",
  "IBAN",
  "Days_Paid",
  "Paid_Leave_Days",
  "Unpaid_Leave_Days",
  "Fixed_Salary",
  "Variable_Service_Charge",
  "Variable_Gratuity",
  "Variable_Others",
  "Deductions_%",
  "Deductions_Value",
  "Net_Salary",
] as const;

/**
 * Build staff payroll export rows.
 *
 * Variable_Service_Charge and Variable_Gratuity are placeholders (0) until
 * those feeds are linked; all current variable earnings go to Variable_Others.
 */
export function buildPayrollExportRows(opts: {
  employees: CalculatedEmployeePayroll[];
  adjustments?: PayrollExportAdjustment[];
}): { rows: PayrollExportRow[]; errors: string[] } {
  const errors: string[] = [];
  const rows: PayrollExportRow[] = [];

  const adjustmentsByStaff = new Map<string, PayrollExportAdjustment[]>();
  for (const adj of opts.adjustments ?? []) {
    const list = adjustmentsByStaff.get(adj.staffId) ?? [];
    list.push(adj);
    adjustmentsByStaff.set(adj.staffId, list);
  }

  for (const e of opts.employees) {
    if (!e.included) continue;

    const employeeId = e.empNo?.trim() || "";
    if (!employeeId) {
      errors.push(`${e.fullName}: missing emp no — excluded from export`);
      continue;
    }

    const iban = e.iban?.replace(/\s+/g, "").toUpperCase() || "";

    const daysPaid =
      e.effectivePaidDays != null && !Number.isNaN(e.effectivePaidDays)
        ? e.effectivePaidDays
        : e.paidDays;

    const leave = summarizePayrollLeave(e.dayFractions);
    const paidLeaveDays = leave.paidDays + leave.halfPayDays;
    const unpaidLeaveDays =
      e.dayFractions.length > 0 ? leave.unpaidDays : e.unpaidDays;

    // Service charge / gratuity feeds not linked yet — keep columns at 0.
    const variableServiceCharge = 0;
    const variableGratuity = 0;
    const variableOthers = e.variableEarnings;

    const staffAdjs = adjustmentsByStaff.get(e.staffId) ?? [];
    const deductionsPercent = Math.min(
      100,
      staffAdjs
        .filter((a) =>
          isDailyRateDiscountAdjustment({
            category: a.category,
            percentOfDailyRate: a.percentOfDailyRate,
            daysApplied: a.daysApplied,
            amount: a.amount,
          }),
        )
        .reduce((sum, a) => sum + (a.percentOfDailyRate ?? 0), 0),
    );

    rows.push({
      employeeId,
      employeeName: e.fullName,
      department: e.departmentName?.trim() || "No department",
      iban,
      daysPaid,
      paidLeaveDays,
      unpaidLeaveDays,
      fixedSalary: e.fixedEarnings,
      variableServiceCharge,
      variableGratuity,
      variableOthers,
      deductionsPercent,
      deductionsValue: e.totalDeductions,
      netSalary: e.netSalary,
    });
  }

  return { rows, errors };
}

export async function buildPayrollExport(opts: {
  companyName: string;
  payrollMonthLabel: string;
  employees: CalculatedEmployeePayroll[];
  adjustments?: PayrollExportAdjustment[];
}): Promise<{
  buffer: Buffer;
  rows: PayrollExportRow[];
  errors: string[];
}> {
  const { rows, errors } = buildPayrollExportRows(opts);
  const buffer = buildPayrollXlsxBuffer({
    companyName: opts.companyName.trim() || "Company",
    payrollMonthLabel: opts.payrollMonthLabel.trim() || "Month",
    rows,
  });
  return { buffer, rows, errors };
}

/** @deprecated Prefer buildPayrollExport. */
export function buildWpsCsv(opts: {
  employerId: string;
  paymentDate: string;
  employees: CalculatedEmployeePayroll[];
  companyName?: string;
  payrollMonthLabel?: string;
  adjustments?: PayrollExportAdjustment[];
}): { csv: string; rows: PayrollExportRow[]; errors: string[] } {
  const { rows, errors } = buildPayrollExportRows({
    employees: opts.employees,
    adjustments: opts.adjustments,
  });
  return { csv: "", rows, errors };
}

/** `ORILLA - Payroll JULY 2026.xlsx` */
export function buildPayrollExportFilename(
  venueName: string,
  payrollMonth: string,
): string {
  const venue = sanitizeFilenamePart(venueName).toUpperCase() || "VENUE";
  const monthKey = String(payrollMonth).slice(0, 7);
  const [year, monthNum] = monthKey.split("-").map(Number);
  const monthLabel =
    Number.isFinite(year) && Number.isFinite(monthNum)
      ? new Date(year, monthNum - 1, 1)
          .toLocaleString("en-US", { month: "long", year: "numeric" })
          .toUpperCase()
      : monthKey.toUpperCase();
  return `${venue} - Payroll ${monthLabel}.xlsx`;
}

function sanitizeFilenamePart(value: string): string {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ");
}

function sumExportRows(rows: PayrollExportRow[]) {
  const totals = {
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
  };
  for (const r of rows) {
    totals.daysPaid += r.daysPaid;
    totals.paidLeaveDays += r.paidLeaveDays;
    totals.unpaidLeaveDays += r.unpaidLeaveDays;
    totals.fixedSalary += r.fixedSalary;
    totals.variableServiceCharge += r.variableServiceCharge;
    totals.variableGratuity += r.variableGratuity;
    totals.variableOthers += r.variableOthers;
    totals.deductionsPercent += r.deductionsPercent;
    totals.deductionsValue += r.deductionsValue;
    totals.netSalary += r.netSalary;
  }
  return totals;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function colLetter(index0: number): string {
  let n = index0 + 1;
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function cellRef(col0: number, row1: number): string {
  return `${colLetter(col0)}${row1}`;
}

/** Shared string cell (style index). */
function sCell(ref: string, sharedIndex: number, style: number): string {
  return `<c r="${ref}" s="${style}" t="s"><v>${sharedIndex}</v></c>`;
}

/** Number cell (style index). */
function nCell(ref: string, value: number, style: number): string {
  return `<c r="${ref}" s="${style}"><v>${round2(value)}</v></c>`;
}

/**
 * Build a real .xlsx (OOXML) buffer with styled header/total rows, thin black
 * borders, and gridlines hidden.
 */
function buildPayrollXlsxBuffer(opts: {
  companyName: string;
  payrollMonthLabel: string;
  rows: PayrollExportRow[];
}): Buffer {
  const shared: string[] = [];
  const si = (value: string) => {
    shared.push(value);
    return shared.length - 1;
  };

  const titleIdx = si(opts.companyName);
  const subtitleIdx = si(`Staff Payroll - ${opts.payrollMonthLabel}`);
  const headerIdx = EXPORT_HEADERS.map((h) => si(h));
  const totalLabelIdx = si("Total");

  const rowStrings = opts.rows.map((r) => ({
    id: si(r.employeeId),
    name: si(r.employeeName),
    department: si(r.department),
    iban: si(r.iban),
  }));

  const totals = sumExportRows(opts.rows);
  const colCount = EXPORT_HEADERS.length;
  const lastCol = colLetter(colCount - 1);

  // Style indexes (match styles.xml below):
  // 0 default, 1 title, 2 subtitle, 3 header, 4 body text, 5 body num, 6 total text, 7 total num
  const sheetRows: string[] = [];

  // Row 1 — company title
  sheetRows.push(
    `<row r="1" ht="28" customHeight="1"><c r="A1" s="1" t="s"><v>${titleIdx}</v></c></row>`,
  );
  // Row 2 — subtitle
  sheetRows.push(
    `<row r="2" ht="22" customHeight="1"><c r="A2" s="2" t="s"><v>${subtitleIdx}</v></c></row>`,
  );
  // Row 3 blank
  sheetRows.push(`<row r="3"/>`);

  // Row 4 — headers
  const headerCells = headerIdx
    .map((idx, i) => sCell(cellRef(i, 4), idx, 3))
    .join("");
  sheetRows.push(`<row r="4" ht="20" customHeight="1">${headerCells}</row>`);

  // Data rows start at 5
  opts.rows.forEach((r, rowIndex) => {
    const excelRow = 5 + rowIndex;
    const str = rowStrings[rowIndex]!;
    const cells = [
      sCell(cellRef(0, excelRow), str.id, 4),
      sCell(cellRef(1, excelRow), str.name, 4),
      sCell(cellRef(2, excelRow), str.department, 4),
      sCell(cellRef(3, excelRow), str.iban, 4),
      nCell(cellRef(4, excelRow), r.daysPaid, 5),
      nCell(cellRef(5, excelRow), r.paidLeaveDays, 5),
      nCell(cellRef(6, excelRow), r.unpaidLeaveDays, 5),
      nCell(cellRef(7, excelRow), r.fixedSalary, 5),
      nCell(cellRef(8, excelRow), r.variableServiceCharge, 5),
      nCell(cellRef(9, excelRow), r.variableGratuity, 5),
      nCell(cellRef(10, excelRow), r.variableOthers, 5),
      nCell(cellRef(11, excelRow), r.deductionsPercent, 5),
      nCell(cellRef(12, excelRow), r.deductionsValue, 5),
      nCell(cellRef(13, excelRow), r.netSalary, 5),
    ].join("");
    sheetRows.push(`<row r="${excelRow}">${cells}</row>`);
  });

  const totalRow = 5 + opts.rows.length;
  const totalCells = [
    sCell(cellRef(0, totalRow), totalLabelIdx, 6),
    `<c r="${cellRef(1, totalRow)}" s="6"/>`,
    `<c r="${cellRef(2, totalRow)}" s="6"/>`,
    `<c r="${cellRef(3, totalRow)}" s="6"/>`,
    nCell(cellRef(4, totalRow), totals.daysPaid, 7),
    nCell(cellRef(5, totalRow), totals.paidLeaveDays, 7),
    nCell(cellRef(6, totalRow), totals.unpaidLeaveDays, 7),
    nCell(cellRef(7, totalRow), totals.fixedSalary, 7),
    nCell(cellRef(8, totalRow), totals.variableServiceCharge, 7),
    nCell(cellRef(9, totalRow), totals.variableGratuity, 7),
    nCell(cellRef(10, totalRow), totals.variableOthers, 7),
    nCell(cellRef(11, totalRow), totals.deductionsPercent, 7),
    nCell(cellRef(12, totalRow), totals.deductionsValue, 7),
    nCell(cellRef(13, totalRow), totals.netSalary, 7),
  ].join("");
  sheetRows.push(
    `<row r="${totalRow}" ht="20" customHeight="1">${totalCells}</row>`,
  );

  const mergeCells = `<mergeCells count="2">
    <mergeCell ref="A1:${lastCol}1"/>
    <mergeCell ref="A2:${lastCol}2"/>
  </mergeCells>`;

  const cols = Array.from({ length: colCount }, (_, i) => {
    const widths = [12, 28, 22, 26, 11, 14, 15, 12, 18, 16, 14, 12, 14, 12];
    return `<col min="${i + 1}" max="${i + 1}" width="${widths[i] ?? 12}" customWidth="1"/>`;
  }).join("");

  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetViews>
    <sheetView workbookViewId="0" showGridLines="0"/>
  </sheetViews>
  <cols>${cols}</cols>
  <sheetData>
    ${sheetRows.join("\n    ")}
  </sheetData>
  ${mergeCells}
</worksheet>`;

  const sharedXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${shared.length}" uniqueCount="${shared.length}">
${shared.map((t) => `  <si><t>${xmlEscape(t)}</t></si>`).join("\n")}
</sst>`;

  // Thin black border on all sides
  const thin = `<border>
    <left style="thin"><color rgb="FF000000"/></left>
    <right style="thin"><color rgb="FF000000"/></right>
    <top style="thin"><color rgb="FF000000"/></top>
    <bottom style="thin"><color rgb="FF000000"/></bottom>
  </border>`;
  const noBorder = `<border><left/><right/><top/><bottom/></border>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1">
    <numFmt numFmtId="164" formatCode="0.00"/>
  </numFmts>
  <fonts count="5">
    <font><sz val="11"/><color theme="1"/><name val="Calibri"/></font>
    <font><b/><sz val="18"/><color rgb="FF3D421F"/><name val="Calibri"/></font>
    <font><b/><sz val="14"/><color rgb="FF3D421F"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><color rgb="FF3D421F"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><color rgb="FF3D421F"/><name val="Calibri"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFC5CE8A"/></patternFill></fill>
  </fills>
  <borders count="2">
    ${noBorder}
    ${thin}
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="8">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="left" vertical="center" wrapText="0"/>
    </xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1">
      <alignment horizontal="left" vertical="center"/>
    </xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="right" vertical="center"/>
    </xf>
    <xf numFmtId="0" fontId="4" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="left" vertical="center"/>
    </xf>
    <xf numFmtId="164" fontId="4" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="right" vertical="center"/>
    </xf>
  </cellXfs>
</styleSheet>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Staff Payroll" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;

  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>`;

  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
</Types>`;

  return zipStore([
    { name: "[Content_Types].xml", data: contentTypes },
    { name: "_rels/.rels", data: rootRels },
    { name: "xl/workbook.xml", data: workbookXml },
    { name: "xl/_rels/workbook.xml.rels", data: workbookRels },
    { name: "xl/worksheets/sheet1.xml", data: sheetXml },
    { name: "xl/styles.xml", data: stylesXml },
    { name: "xl/sharedStrings.xml", data: sharedXml },
  ]);
}

/** Minimal ZIP (stored + deflated) writer for OOXML packages. */
function zipStore(files: { name: string; data: string }[]): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, "utf8");
    const raw = Buffer.from(file.data, "utf8");
    const compressed = deflateRawSync(raw);
    const useCompress = compressed.length < raw.length;
    const payload = useCompress ? compressed : raw;
    const method = useCompress ? 8 : 0;
    const crc = crc32(raw);

    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc >>> 0, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    nameBuf.copy(local, 30);

    parts.push(local, payload);

    const cen = Buffer.alloc(46 + nameBuf.length);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0, 8);
    cen.writeUInt16LE(method, 10);
    cen.writeUInt16LE(0, 12);
    cen.writeUInt16LE(0, 14);
    cen.writeUInt32LE(crc >>> 0, 16);
    cen.writeUInt32LE(payload.length, 20);
    cen.writeUInt32LE(raw.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt16LE(0, 30);
    cen.writeUInt16LE(0, 32);
    cen.writeUInt16LE(0, 34);
    cen.writeUInt16LE(0, 36);
    cen.writeUInt32LE(0, 38);
    cen.writeUInt32LE(offset, 42);
    nameBuf.copy(cen, 46);
    central.push(cen);

    offset += local.length + payload.length;
  }

  const centralDir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...parts, centralDir, end]);
}

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    crc ^= buf[i]!;
    for (let j = 0; j < 8; j += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Helper for callers that need to attach day fractions from a snapshot. */
export function dayFractionsFromSnapshot(
  snapshot: unknown,
): PayrollDayFraction[] {
  if (!snapshot || typeof snapshot !== "object") return [];
  const dayFractions = (snapshot as { dayFractions?: unknown }).dayFractions;
  return Array.isArray(dayFractions)
    ? (dayFractions as PayrollDayFraction[])
    : [];
}
