import type { WorkBook } from "xlsx";

export type SheetRow = Record<string, unknown>;

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function sheetRowsFromAoA(aoa: unknown[][]): SheetRow[] {
  if (aoa.length < 2) return [];

  const headers = (aoa[0] ?? []).map(normalizeHeader);
  const rows: SheetRow[] = [];

  for (let rowIndex = 1; rowIndex < aoa.length; rowIndex += 1) {
    const cells = aoa[rowIndex] ?? [];
    const hasValue = cells.some(
      (cell) => cell !== null && cell !== undefined && String(cell).trim() !== "",
    );
    if (!hasValue) continue;

    const row: SheetRow = {};
    headers.forEach((header, colIndex) => {
      if (!header) return;
      row[header] = cells[colIndex];
    });
    rows.push(row);
  }

  return rows;
}

export async function parseExcelFile(file: File): Promise<SheetRow[]> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];

  const sheet = workbook.Sheets[sheetName];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
  }) as unknown[][];

  return sheetRowsFromAoA(aoa);
}

export async function buildExcelWorkbook(
  sheetName: string,
  headers: string[],
  dataRows: (string | number)[][],
  instructions?: string[][],
): Promise<WorkBook> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();

  const dataAoA = [headers, ...dataRows];
  const dataSheet = XLSX.utils.aoa_to_sheet(dataAoA);
  XLSX.utils.book_append_sheet(workbook, dataSheet, sheetName);

  if (instructions?.length) {
    const instructionsSheet = XLSX.utils.aoa_to_sheet(instructions);
    XLSX.utils.book_append_sheet(workbook, instructionsSheet, "Instructions");
  }

  return workbook;
}

export async function downloadExcelWorkbook(
  workbook: WorkBook,
  filename: string,
): Promise<void> {
  const XLSX = await import("xlsx");
  XLSX.writeFile(workbook, filename);
}

export function formatDateForExcel(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString().slice(0, 10);
}

export function parseExcelDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const slashMatch = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slashMatch) {
    const day = Number.parseInt(slashMatch[1], 10);
    const month = Number.parseInt(slashMatch[2], 10);
    let year = Number.parseInt(slashMatch[3], 10);
    if (year < 100) year += 2000;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return null;
}

export function parseExcelMoney(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  const cleaned = String(value).replace(/,/g, "").trim();
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

export function parseExcelCount(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = Number.parseInt(String(value).replace(/,/g, "").trim(), 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}
