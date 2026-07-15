/**
 * Fingerprint attendance Excel import (InOutData.xls style).
 *
 * Standard InOutData layout (fingerprint machine export):
 *   A Department | B Name | C No. (employee ID) | D Date/Time | E Location ID | …
 */

import type { HrAttendanceImportRules } from "@/lib/hr/types";

/** Fixed column indices for fingerprint InOutData exports (A=0, B=1, C=2, D=3). */
export const FINGERPRINT_INOUT_COLUMNS = {
  department: 0,
  name: 1,
  empNo: 2,
  dateTime: 3,
  locationId: 4,
} as const;

export type AttendancePunchRaw = {
  empNo: string;
  name: string;
  departmentName: string;
  locationId: string;
  /** Civil wall-clock components from the device (not UTC). */
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

export type AttendanceDayResult = {
  empNo: string;
  workDate: string;
  clockInIso: string | null;
  clockOutIso: string | null;
  totalHours: number | null;
  punchCount: number;
  status:
    | "complete"
    | "missing_clock_in"
    | "missing_clock_out"
    | "incomplete";
  notes: string | null;
  punches: AttendancePunchRaw[];
};

export type AttendanceParseResult = {
  punches: AttendancePunchRaw[];
  days: AttendanceDayResult[];
  errors: string[];
};

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Excel serial → civil date/time parts (device wall-clock, timezone-naive). */
export function excelSerialToCivilParts(serial: number): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} | null {
  if (!Number.isFinite(serial) || serial < 1) return null;
  // Excel's day 0 is 1899-12-30 (Lotus bug compatible).
  const ms = Math.round(serial * 86_400_000);
  const d = new Date(Date.UTC(1899, 11, 30) + ms);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
  };
}

function parseDateTimeCell(value: unknown): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    // Avoid xlsx cellDates timezone shifts — prefer serial path when possible.
    // Fall back to UTC components (xlsx often encodes naive times as UTC).
    return {
      year: value.getUTCFullYear(),
      month: value.getUTCMonth() + 1,
      day: value.getUTCDate(),
      hour: value.getUTCHours(),
      minute: value.getUTCMinutes(),
      second: value.getUTCSeconds(),
    };
  }

  if (typeof value === "number") {
    return excelSerialToCivilParts(value);
  }

  const text = String(value ?? "").trim();
  if (!text) return null;

  // Numeric string serial
  if (/^\d+(\.\d+)?$/.test(text)) {
    return excelSerialToCivilParts(Number(text));
  }

  // dd/mm/yyyy HH:mm (ignore trailing junk like "A11P11")
  const m = text.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/,
  );
  if (m) {
    return {
      day: Number(m[1]),
      month: Number(m[2]),
      year: Number(m[3]),
      hour: Number(m[4]),
      minute: Number(m[5]),
      second: Number(m[6] ?? 0),
    };
  }

  // ISO-ish
  const iso = text.match(
    /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?/,
  );
  if (iso) {
    return {
      year: Number(iso[1]),
      month: Number(iso[2]),
      day: Number(iso[3]),
      hour: Number(iso[4]),
      minute: Number(iso[5]),
      second: Number(iso[6] ?? 0),
    };
  }

  return null;
}

function parseCutoffMinutes(hhmm: string): number {
  const match = hhmm.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return 5 * 60;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m) || h > 23 || m > 59) {
    return 5 * 60;
  }
  return h * 60 + m;
}

/** Offset minutes east of UTC for common venue zones (fallback when Intl fails). */
function offsetMinutesForTimezone(timezone: string, at: Date): number {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      timeZoneName: "shortOffset",
    });
    const part = fmt
      .formatToParts(at)
      .find((p) => p.type === "timeZoneName")?.value;
    // e.g. "GMT+4", "GMT+04:00"
    const m = part?.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/i);
    if (!m) return 4 * 60; // Asia/Dubai default
    const sign = m[1] === "-" ? -1 : 1;
    const hours = Number(m[2]);
    const mins = Number(m[3] ?? 0);
    return sign * (hours * 60 + mins);
  } catch {
    return 4 * 60;
  }
}

export function civilPartsToIso(
  parts: {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
  },
  timezone: string,
): string {
  const rough = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second),
  );
  const offsetMin = offsetMinutesForTimezone(timezone, rough);
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  const oh = pad2(Math.floor(abs / 60));
  const om = pad2(abs % 60);
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}T${pad2(parts.hour)}:${pad2(parts.minute)}:${pad2(parts.second)}${sign}${oh}:${om}`;
}

export function assignWorkDate(
  parts: { year: number; month: number; day: number; hour: number; minute: number },
  overnightCutoffTime: string,
): string {
  const cutoff = parseCutoffMinutes(overnightCutoffTime);
  const minutes = parts.hour * 60 + parts.minute;
  const utc = Date.UTC(parts.year, parts.month - 1, parts.day);
  const d = new Date(utc);
  if (minutes < cutoff) {
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function hoursBetween(isoIn: string, isoOut: string): number {
  const a = new Date(isoIn).getTime();
  const b = new Date(isoOut).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  return Math.round(((b - a) / 3_600_000) * 100) / 100;
}

export function pairPunchesIntoDays(
  punches: AttendancePunchRaw[],
  rules: HrAttendanceImportRules,
): AttendanceDayResult[] {
  const cutoff = parseCutoffMinutes(rules.overnightCutoffTime);
  type Bucket = {
    empNo: string;
    workDate: string;
    punches: AttendancePunchRaw[];
  };
  const map = new Map<string, Bucket>();

  for (const punch of punches) {
    const workDate = assignWorkDate(punch, rules.overnightCutoffTime);
    const key = `${punch.empNo}::${workDate}`;
    let bucket = map.get(key);
    if (!bucket) {
      bucket = { empNo: punch.empNo, workDate, punches: [] };
      map.set(key, bucket);
    }
    bucket.punches.push(punch);
  }

  const days: AttendanceDayResult[] = [];

  for (const bucket of map.values()) {
    const sorted = [...bucket.punches].sort((a, b) => {
      const ta =
        a.year * 1e10 +
        a.month * 1e8 +
        a.day * 1e6 +
        a.hour * 1e4 +
        a.minute * 100 +
        a.second;
      const tb =
        b.year * 1e10 +
        b.month * 1e8 +
        b.day * 1e6 +
        b.hour * 1e4 +
        b.minute * 100 +
        b.second;
      return ta - tb;
    });

    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;

    if (sorted.length >= 2) {
      const clockInIso = civilPartsToIso(first, rules.timezone);
      const clockOutIso = civilPartsToIso(last, rules.timezone);
      let totalHours = hoursBetween(clockInIso, clockOutIso);
      let status: AttendanceDayResult["status"] = "complete";
      let notes: string | null = null;

      if (totalHours > rules.maxShiftHours) {
        status = "incomplete";
        notes = `Shift exceeds max ${rules.maxShiftHours}h (${totalHours}h).`;
      }

      days.push({
        empNo: bucket.empNo,
        workDate: bucket.workDate,
        clockInIso,
        clockOutIso,
        totalHours,
        punchCount: sorted.length,
        status,
        notes,
        punches: sorted,
      });
      continue;
    }

    // Single punch: early-morning (before cutoff on calendar day) → clock out only;
    // otherwise → clock in only (missing clock out).
    const punchMinutes = first.hour * 60 + first.minute;
    const isEarlyMorning = punchMinutes < cutoff;
    const iso = civilPartsToIso(first, rules.timezone);

    if (isEarlyMorning) {
      days.push({
        empNo: bucket.empNo,
        workDate: bucket.workDate,
        clockInIso: null,
        clockOutIso: iso,
        totalHours: null,
        punchCount: 1,
        status: "missing_clock_in",
        notes: "Only an early-morning punch was found for this work day.",
        punches: sorted,
      });
    } else {
      days.push({
        empNo: bucket.empNo,
        workDate: bucket.workDate,
        clockInIso: iso,
        clockOutIso: null,
        totalHours: null,
        punchCount: 1,
        status: "missing_clock_out",
        notes: "Clock out was not recorded for this work day.",
        punches: sorted,
      });
    }
  }

  days.sort((a, b) =>
    a.workDate === b.workDate
      ? a.empNo.localeCompare(b.empNo)
      : a.workDate.localeCompare(b.workDate),
  );

  return days;
}

type ColumnMap = {
  empIdx: number;
  dtIdx: number;
  nameIdx: number;
  deptIdx: number;
  locIdx: number;
  dataStartRow: number;
};

function resolveInOutColumns(aoa: unknown[][]): ColumnMap {
  const first = aoa[0] ?? [];
  const headers = first.map(normalizeHeader);

  const headerEmpIdx = headers.findIndex(
    (h) =>
      h === "no." ||
      h === "no" ||
      h === "emp no" ||
      h === "emp_no" ||
      h === "employee id" ||
      h === "id",
  );
  const headerDtIdx = headers.findIndex(
    (h) =>
      h === "date/time" ||
      h === "date time" ||
      h === "datetime" ||
      h === "date/time stamp" ||
      h === "timestamp" ||
      h === "time",
  );
  const headerNameIdx = headers.findIndex((h) => h === "name");
  const headerDeptIdx = headers.findIndex((h) => h === "department");
  const headerLocIdx = headers.findIndex(
    (h) => h === "location id" || h === "location" || h === "locationid",
  );

  const looksLikeHeaderRow =
    headerEmpIdx >= 0 ||
    headerDtIdx >= 0 ||
    headers.includes("department") ||
    headers.includes("verifycode");

  if (looksLikeHeaderRow && headerEmpIdx >= 0 && headerDtIdx >= 0) {
    return {
      empIdx: headerEmpIdx,
      dtIdx: headerDtIdx,
      nameIdx: headerNameIdx,
      deptIdx: headerDeptIdx,
      locIdx: headerLocIdx,
      dataStartRow: 1,
    };
  }

  // InOutData default: column C = employee ID, column D = timestamp.
  return {
    empIdx: FINGERPRINT_INOUT_COLUMNS.empNo,
    dtIdx: FINGERPRINT_INOUT_COLUMNS.dateTime,
    nameIdx: FINGERPRINT_INOUT_COLUMNS.name,
    deptIdx: FINGERPRINT_INOUT_COLUMNS.department,
    locIdx: FINGERPRINT_INOUT_COLUMNS.locationId,
    dataStartRow: looksLikeHeaderRow ? 1 : 0,
  };
}

/** Parse first sheet AoA (header row + data) from fingerprint export. */
export function parseAttendanceAoA(
  aoa: unknown[][],
  rules: HrAttendanceImportRules,
): AttendanceParseResult {
  const errors: string[] = [];
  if (aoa.length < 1) {
    return { punches: [], days: [], errors: ["File has no data rows."] };
  }

  const cols = resolveInOutColumns(aoa);
  const punches: AttendancePunchRaw[] = [];

  for (let i = cols.dataStartRow; i < aoa.length; i += 1) {
    const row = aoa[i] ?? [];
    const empNo = String(row[cols.empIdx] ?? "").trim();
    if (!empNo) continue;

    const parts = parseDateTimeCell(row[cols.dtIdx]);
    if (!parts) {
      errors.push(`Row ${i + 1}: could not parse timestamp (column D) for emp ${empNo}.`);
      continue;
    }

    punches.push({
      empNo,
      name: cols.nameIdx >= 0 ? String(row[cols.nameIdx] ?? "").trim() : "",
      departmentName:
        cols.deptIdx >= 0 ? String(row[cols.deptIdx] ?? "").trim() : "",
      locationId: cols.locIdx >= 0 ? String(row[cols.locIdx] ?? "").trim() : "",
      ...parts,
    });
  }

  if (!punches.length) {
    return {
      punches: [],
      days: [],
      errors: errors.length
        ? errors
        : [
            "No punches found. Expected InOutData columns: C = employee ID (No.), D = Date/Time.",
          ],
    };
  }

  // Deduplicate identical emp+timestamp
  const seen = new Set<string>();
  const unique: AttendancePunchRaw[] = [];
  for (const p of punches) {
    const key = `${p.empNo}|${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(p);
  }

  const days = pairPunchesIntoDays(unique, rules);
  return { punches: unique, days, errors };
}

export async function parseAttendanceBuffer(
  buffer: ArrayBuffer,
  rules: HrAttendanceImportRules,
): Promise<AttendanceParseResult> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { punches: [], days: [], errors: ["Workbook has no sheets."] };
  }
  const sheet = workbook.Sheets[sheetName];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: "",
  }) as unknown[][];
  return parseAttendanceAoA(aoa, rules);
}

export async function parseAttendanceExcelFile(
  file: File,
  rules: HrAttendanceImportRules,
): Promise<AttendanceParseResult> {
  const buffer = await file.arrayBuffer();
  // Client-side: dynamic import keeps xlsx out of the main bundle.
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { punches: [], days: [], errors: ["Workbook has no sheets."] };
  }
  const sheet = workbook.Sheets[sheetName];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: true,
    defval: "",
  }) as unknown[][];
  return parseAttendanceAoA(aoa, rules);
}
