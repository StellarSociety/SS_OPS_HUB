import { isDailyRateDiscountAdjustment, round2 } from "./daily-rate";
import { summarizePayrollLeave } from "./leave-summary";
import { formatDateDmy } from "@/lib/accounting/money";
import type { CalculatedEmployeePayroll, PayrollDayFraction } from "./types";
import { deflateRawSync } from "node:zlib";

/**
 * Contractual fixed salary for export — same as staff "Salary to pay"
 * (wage package, or basic only when in company accommodation).
 * Not the period's prorated fixed earnings.
 */
export function contractedFixedSalary(
  e: Pick<
    CalculatedEmployeePayroll,
    "basicSalary" | "accomAllowance" | "transpAllowance" | "salaryToPay" | "fixedEarnings"
  >,
): number {
  if (e.salaryToPay != null && !Number.isNaN(Number(e.salaryToPay))) {
    return round2(Number(e.salaryToPay));
  }
  const packageTotal = round2(
    (Number(e.basicSalary) || 0) +
      (Number(e.accomAllowance) || 0) +
      (Number(e.transpAllowance) || 0),
  );
  if (packageTotal > 0) return packageTotal;
  return round2(Number(e.fixedEarnings) || 0);
}

export type PayrollExportRow = {
  employeeId: string;
  /** DD-MM-YY, or "" when not on file. */
  joiningDate: string;
  employeeName: string;
  department: string;
  iban: string;
  daysPaid: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  fixedSalary: number;
  /** Contractual parts paid within Fixed_Salary (sum = fixedSalary). */
  basicSalary: number;
  accomAllowance: number;
  transpAllowance: number;
  /** Fixed pay earned this run after attendance (prorated days, unpaid days). */
  monthRunSalary: number;
  variableServiceCharge: number;
  variableGratuity: number;
  variableFlightTicket: number;
  variableOthers: number;
  deductionsPercent: number;
  deductionsValue: number;
  netSalary: number;
};

/** One item behind an employee's Variable_Others or Deductions_Value. */
export type PayrollJustificationLine = {
  employeeId: string;
  employeeName: string;
  column: "Variable_Others" | "Deductions_Value";
  code: string;
  description: string;
  details: string;
  amount: number;
};

/** Variable codes that have their own export column (not in Variable_Others). */
const OWN_COLUMN_VARIABLE_CODES = new Set([
  "TIPS",
  "SERVICE_CHARGE",
  "FLIGHT_TICKET",
]);

function justificationDetails(meta: unknown): string {
  const adjustment = (meta as { adjustment?: unknown } | undefined)?.adjustment as
    | {
        reason?: string;
        daysApplied?: number | null;
        percentOfDailyRate?: number | null;
        enteredBy?: string | null;
        enteredOn?: string | null;
      }
    | undefined;
  if (!adjustment) return "";
  const parts: string[] = [];
  if (adjustment.reason?.trim()) parts.push(`Reason: ${adjustment.reason.trim()}`);
  if (adjustment.daysApplied != null && adjustment.daysApplied > 0) {
    parts.push(
      `${adjustment.daysApplied} day${adjustment.daysApplied === 1 ? "" : "s"}`,
    );
  }
  if (adjustment.percentOfDailyRate != null && adjustment.percentOfDailyRate > 0) {
    parts.push(`${adjustment.percentOfDailyRate}% of daily rate`);
  }
  if (adjustment.enteredBy || adjustment.enteredOn) {
    parts.push(
      [
        "Entered",
        adjustment.enteredBy ? `by ${adjustment.enteredBy}` : "",
        adjustment.enteredOn ? `on ${formatDateDmy(adjustment.enteredOn)}` : "",
      ]
        .filter(Boolean)
        .join(" "),
    );
  }
  return parts.join(" · ");
}

/**
 * Lines that make up Variable_Others and Deductions_Value for one employee.
 * Any gap with the run totals (no line detail on file) is listed too, so the
 * lines always add up to the figures in the table.
 */
function justificationLinesFor(
  e: CalculatedEmployeePayroll,
  employeeId: string,
  variableOthers: number,
): PayrollJustificationLine[] {
  const out: PayrollJustificationLine[] = [];
  const add = (
    column: PayrollJustificationLine["column"],
    lines: CalculatedEmployeePayroll["lines"],
    expected: number,
  ) => {
    let sum = 0;
    for (const line of lines) {
      const amount = round2(Number(line.amount) || 0);
      if (amount === 0) continue;
      sum = round2(sum + amount);
      out.push({
        employeeId,
        employeeName: e.fullName,
        column,
        code: line.code,
        description: line.label || line.code,
        details: justificationDetails(line.meta),
        amount,
      });
    }
    const gap = round2(expected - sum);
    if (Math.abs(gap) > 0.005) {
      out.push({
        employeeId,
        employeeName: e.fullName,
        column,
        code: "—",
        description:
          column === "Deductions_Value"
            ? "Deductions without line detail"
            : "Other variable pay without line detail",
        details: "Difference between the run total and its itemised lines",
        amount: gap,
      });
    }
  };
  add(
    "Variable_Others",
    e.lines.filter(
      (line) =>
        line.category === "variable" &&
        !OWN_COLUMN_VARIABLE_CODES.has(line.code.toUpperCase()),
    ),
    variableOthers,
  );
  add(
    "Deductions_Value",
    e.lines.filter((line) => line.category === "deduction"),
    round2(e.totalDeductions),
  );
  return out;
}

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
  "Joining_Date",
  "Employee_Name",
  "Department",
  "IBAN",
  "Days_Paid",
  "Paid_Leave_Days",
  "Unpaid_Leave_Days",
  "Fixed_Salary",
  "Basic_Salary",
  "Accom_Allowance",
  "Transp_Allowance",
  "Month_Run_Salary",
  "Variable_Service_Charge",
  "Variable_Gratuity",
  "Variable_Flight_Ticket",
  "Variable_Others",
  "Deductions_%",
  "Deductions_Value",
  "Net_Salary",
] as const;

/**
 * Build staff payroll export rows.
 *
 * Fixed_Salary = staff "Salary to pay" (contractual), not period prorated
 * fixed earnings.
 *
 * Variable pay is split by payroll line code: TIPS → Variable_Gratuity,
 * SERVICE_CHARGE → Variable_Service_Charge, FLIGHT_TICKET →
 * Variable_Flight_Ticket, everything else variable → Variable_Others. Together
 * they always add up to the employee's variable earnings.
 */
/**
 * Basic / accommodation / transport within Fixed_Salary. Staff in company
 * accommodation are paid basic only, so their allowances show as 0 and the
 * three parts always add up to Fixed_Salary.
 */
export function fixedSalaryParts(
  e: Pick<
    CalculatedEmployeePayroll,
    | "basicSalary"
    | "accomAllowance"
    | "transpAllowance"
    | "salaryToPay"
    | "fixedEarnings"
    | "companyAccommodation"
  >,
): { basicSalary: number; accomAllowance: number; transpAllowance: number } {
  const fixed = contractedFixedSalary(e);
  const basic = round2(Number(e.basicSalary) || 0);
  const accom = e.companyAccommodation
    ? 0
    : round2(Number(e.accomAllowance) || 0);
  const transp = e.companyAccommodation
    ? 0
    : round2(Number(e.transpAllowance) || 0);
  if (basic + accom + transp <= 0) {
    // No breakdown on file — show the whole fixed salary as basic.
    return { basicSalary: fixed, accomAllowance: 0, transpAllowance: 0 };
  }
  // Keep the parts reconciled with Fixed_Salary; any gap lands on basic.
  return {
    basicSalary: round2(fixed - accom - transp),
    accomAllowance: accom,
    transpAllowance: transp,
  };
}

export function buildPayrollExportRows(opts: {
  employees: CalculatedEmployeePayroll[];
  adjustments?: PayrollExportAdjustment[];
  /** Shown in the IBAN column when the employee has no bank account. */
  noBankPaymentMethod?: "cash" | "cheque" | "other";
  /** Staff joining dates (ISO), keyed by staff id. */
  joiningDateByStaff?: Record<string, string | null>;
}): {
  rows: PayrollExportRow[];
  justifications: PayrollJustificationLine[];
  errors: string[];
} {
  const errors: string[] = [];
  const rows: PayrollExportRow[] = [];
  const justifications: PayrollJustificationLine[] = [];
  const noBankLabel = formatNoBankPaymentLabel(
    opts.noBankPaymentMethod ?? "cash",
  );

  const adjustmentsByStaff = new Map<string, PayrollExportAdjustment[]>();
  for (const adj of opts.adjustments ?? []) {
    const list = adjustmentsByStaff.get(adj.staffId) ?? [];
    list.push(adj);
    adjustmentsByStaff.set(adj.staffId, list);
  }

  // Default order: by department (no department last), then employee ID.
  const employees = [...opts.employees].sort((a, b) => {
    const da = a.departmentName?.trim() || "";
    const db = b.departmentName?.trim() || "";
    if (!da !== !db) return da ? -1 : 1;
    return (
      da.localeCompare(db, undefined, { sensitivity: "base" }) ||
      (a.empNo ?? "").localeCompare(b.empNo ?? "", undefined, { numeric: true })
    );
  });

  for (const e of employees) {
    if (!e.included) continue;

    const employeeId = e.empNo?.trim() || "";
    if (!employeeId) {
      errors.push(`${e.fullName}: missing emp no — excluded from export`);
      continue;
    }

    const cleanedIban = e.iban?.replace(/\s+/g, "").toUpperCase() || "";
    const iban = cleanedIban || noBankLabel;

    const daysPaid =
      e.effectivePaidDays != null && !Number.isNaN(e.effectivePaidDays)
        ? e.effectivePaidDays
        : e.paidDays;

    const leave = summarizePayrollLeave(e.dayFractions);
    const paidLeaveDays = leave.paidDays + leave.halfPayDays;
    const unpaidLeaveDays =
      e.dayFractions.length > 0 ? leave.unpaidDays : e.unpaidDays;

    const variableByCode = (code: string) =>
      round2(
        e.lines
          .filter(
            (line) =>
              line.category === "variable" &&
              line.code.toUpperCase() === code,
          )
          .reduce((sum, line) => sum + (Number(line.amount) || 0), 0),
      );
    const variableServiceCharge = variableByCode("SERVICE_CHARGE");
    const variableGratuity = variableByCode("TIPS");
    const variableFlightTicket = variableByCode("FLIGHT_TICKET");
    const variableOthers = round2(
      e.variableEarnings -
        variableServiceCharge -
        variableGratuity -
        variableFlightTicket,
    );

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

    justifications.push(
      ...justificationLinesFor(e, employeeId, variableOthers),
    );

    const joiningIso = opts.joiningDateByStaff?.[e.staffId] ?? null;
    rows.push({
      employeeId,
      joiningDate: joiningIso ? formatDateDmy(joiningIso) : "",
      employeeName: e.fullName,
      department: e.departmentName?.trim() || "No department",
      iban,
      daysPaid,
      paidLeaveDays,
      unpaidLeaveDays,
      fixedSalary: contractedFixedSalary(e),
      ...fixedSalaryParts(e),
      monthRunSalary: round2(Number(e.fixedEarnings) || 0),
      variableServiceCharge,
      variableGratuity,
      variableFlightTicket,
      variableOthers,
      deductionsPercent,
      deductionsValue: e.totalDeductions,
      netSalary: e.netSalary,
    });
  }

  return { rows, justifications, errors };
}

function formatNoBankPaymentLabel(
  method: "cash" | "cheque" | "other",
): string {
  if (method === "cheque") return "Cheque";
  if (method === "other") return "Other";
  return "Cash";
}

export async function buildPayrollExport(opts: {
  companyName: string;
  payrollMonthLabel: string;
  employees: CalculatedEmployeePayroll[];
  adjustments?: PayrollExportAdjustment[];
  noBankPaymentMethod?: "cash" | "cheque" | "other";
  joiningDateByStaff?: Record<string, string | null>;
}): Promise<{
  buffer: Buffer;
  rows: PayrollExportRow[];
  justifications: PayrollJustificationLine[];
  errors: string[];
}> {
  const { rows, justifications, errors } = buildPayrollExportRows(opts);
  const buffer = buildPayrollXlsxBuffer({
    companyName: opts.companyName.trim() || "Company",
    payrollMonthLabel: opts.payrollMonthLabel.trim() || "Month",
    rows,
    justifications,
  });
  return { buffer, rows, justifications, errors };
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

/** Numeric export columns, in order after Employee_ID / Joining_Date / Name / Department / IBAN. */
export const EXPORT_NUMERIC_FIELDS = [
  "daysPaid",
  "paidLeaveDays",
  "unpaidLeaveDays",
  "fixedSalary",
  "basicSalary",
  "accomAllowance",
  "transpAllowance",
  "monthRunSalary",
  "variableServiceCharge",
  "variableGratuity",
  "variableFlightTicket",
  "variableOthers",
  "deductionsPercent",
  "deductionsValue",
  "netSalary",
] as const satisfies ReadonlyArray<keyof PayrollExportRow>;

type ExportNumericField = (typeof EXPORT_NUMERIC_FIELDS)[number];

/** Employee_ID, Joining_Date, Employee_Name, Department, IBAN. */
const EXPORT_TEXT_COLUMN_COUNT = 5;

export function sumExportRows(
  rows: PayrollExportRow[],
): Record<ExportNumericField, number> {
  const totals = Object.fromEntries(
    EXPORT_NUMERIC_FIELDS.map((field) => [field, 0]),
  ) as Record<ExportNumericField, number>;
  for (const r of rows) {
    for (const field of EXPORT_NUMERIC_FIELDS) totals[field] += r[field];
  }
  return totals;
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
  justifications?: PayrollJustificationLine[];
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
    joining: si(r.joiningDate),
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
      sCell(cellRef(1, excelRow), str.joining, 4),
      sCell(cellRef(2, excelRow), str.name, 4),
      sCell(cellRef(3, excelRow), str.department, 4),
      sCell(cellRef(4, excelRow), str.iban, 4),
      ...EXPORT_NUMERIC_FIELDS.map((field, i) =>
        nCell(cellRef(EXPORT_TEXT_COLUMN_COUNT + i, excelRow), r[field], 5),
      ),
    ].join("");
    sheetRows.push(`<row r="${excelRow}">${cells}</row>`);
  });

  const totalRow = 5 + opts.rows.length;
  const totalCells = [
    sCell(cellRef(0, totalRow), totalLabelIdx, 6),
    `<c r="${cellRef(1, totalRow)}" s="6"/>`,
    `<c r="${cellRef(2, totalRow)}" s="6"/>`,
    `<c r="${cellRef(3, totalRow)}" s="6"/>`,
    `<c r="${cellRef(4, totalRow)}" s="6"/>`,
    ...EXPORT_NUMERIC_FIELDS.map((field, i) =>
      nCell(cellRef(EXPORT_TEXT_COLUMN_COUNT + i, totalRow), totals[field], 7),
    ),
  ].join("");
  sheetRows.push(
    `<row r="${totalRow}" ht="20" customHeight="1">${totalCells}</row>`,
  );

  // Additional explanations — one line per item behind Variable_Others and
  // Deductions_Value, with the amount under that same column so each
  // employee's lines visibly add up to their figure above.
  const justifications = opts.justifications ?? [];
  const explanationMerges: string[] = [];
  if (justifications.length > 0) {
    const othersCol =
      EXPORT_TEXT_COLUMN_COUNT + EXPORT_NUMERIC_FIELDS.indexOf("variableOthers");
    const deductionsCol =
      EXPORT_TEXT_COLUMN_COUNT + EXPORT_NUMERIC_FIELDS.indexOf("deductionsValue");
    const titleRow = totalRow + 2;
    sheetRows.push(
      `<row r="${titleRow}" ht="22" customHeight="1"><c r="${cellRef(0, titleRow)}" s="2" t="s"><v>${si(
        "Additional Explanations - Variable_Others and Deductions_Value",
      )}</v></c></row>`,
    );
    const headRow = titleRow + 1;
    const headCells: Array<[number, string]> = [
      [0, "Employee_ID"],
      [1, "Column"],
      [2, "Employee_Name"],
      [3, "Code"],
      [4, "Description · details"],
      [othersCol, "Variable_Others"],
      [deductionsCol, "Deductions_Value"],
    ];
    // Description spans the empty columns up to Variable_Others; every
    // cell in the row is bordered so each line keeps its own strokes.
    const descFirst = 4;
    const descLast = othersCol - 1;
    const borderedRow = (
      r: number,
      filled: Map<number, string>,
      emptyStyle: number,
    ) => {
      const cells: string[] = [];
      for (let col = 0; col <= deductionsCol; col += 1) {
        cells.push(filled.get(col) ?? `<c r="${cellRef(col, r)}" s="${emptyStyle}"/>`);
      }
      explanationMerges.push(
        `${cellRef(descFirst, r)}:${cellRef(descLast, r)}`,
      );
      return cells.join("");
    };
    sheetRows.push(
      `<row r="${headRow}" ht="20" customHeight="1">${borderedRow(
        headRow,
        new Map(
          headCells.map(([col, label]) => [
            col,
            sCell(cellRef(col, headRow), si(label), 3),
          ]),
        ),
        3,
      )}</row>`,
    );
    justifications.forEach((line, index) => {
      const r = headRow + 1 + index;
      const text = line.details
        ? `${line.description} · ${line.details}`
        : line.description;
      const amountCol =
        line.column === "Deductions_Value" ? deductionsCol : othersCol;
      sheetRows.push(
        `<row r="${r}">${borderedRow(
          r,
          new Map([
            [0, sCell(cellRef(0, r), si(line.employeeId), 4)],
            [
              1,
              sCell(
                cellRef(1, r),
                si(line.column === "Deductions_Value" ? "Deductions" : "Others"),
                4,
              ),
            ],
            [2, sCell(cellRef(2, r), si(line.employeeName), 4)],
            [3, sCell(cellRef(3, r), si(line.code), 4)],
            [descFirst, sCell(cellRef(descFirst, r), si(text), 4)],
            [amountCol, nCell(cellRef(amountCol, r), line.amount, 5)],
          ]),
          4,
        )}</row>`,
      );
    });
    const sumRow = headRow + 1 + justifications.length;
    const sumOf = (column: PayrollJustificationLine["column"]) =>
      justifications
        .filter((line) => line.column === column)
        .reduce((sum, line) => sum + line.amount, 0);
    sheetRows.push(
      `<row r="${sumRow}" ht="20" customHeight="1">${borderedRow(
        sumRow,
        new Map([
          [0, sCell(cellRef(0, sumRow), si("Total explained"), 6)],
          [othersCol, nCell(cellRef(othersCol, sumRow), sumOf("Variable_Others"), 7)],
          [
            deductionsCol,
            nCell(cellRef(deductionsCol, sumRow), sumOf("Deductions_Value"), 7),
          ],
        ]),
        6,
      )}</row>`,
    );
  }

  const merges = [`A1:${lastCol}1`, `A2:${lastCol}2`, ...explanationMerges];
  const mergeCells = `<mergeCells count="${merges.length}">
    ${merges.map((ref) => `<mergeCell ref="${ref}"/>`).join("\n    ")}
  </mergeCells>`;

  const cols = Array.from({ length: colCount }, (_, i) => {
    const widths = [12, 12, 28, 22, 26, 11, 14, 15, 12, 13, 15, 16, 17, 18, 16, 18, 14, 12, 14, 12];
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
