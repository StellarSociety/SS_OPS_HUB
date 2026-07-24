import type { CalculatedEmployeePayroll } from "./types";

export type WpsFileRow = {
  employerId: string;
  employeeId: string;
  employeeName: string;
  empNo: string;
  iban: string;
  fixedSalary: number;
  variableSalary: number;
  daysPaid: number;
  leaveDays: number;
  netSalary: number;
};

/**
 * Build UAE WPS-style CSV (SIF-compatible columnar export).
 * Banks vary slightly; this is a practical HR export, not a certified bank SDK.
 */
export function buildWpsCsv(opts: {
  employerId: string;
  paymentDate: string;
  employees: CalculatedEmployeePayroll[];
}): { csv: string; rows: WpsFileRow[]; errors: string[] } {
  const errors: string[] = [];
  const rows: WpsFileRow[] = [];

  if (!opts.employerId.trim()) {
    errors.push("WPS employer ID is not configured in Pay settings.");
  }

  for (const e of opts.employees) {
    if (!e.included) continue;
    if (!e.wpsEmployeeId?.trim()) {
      errors.push(`${e.fullName}: missing WPS employee ID`);
      continue;
    }
    if (!e.iban?.trim()) {
      errors.push(`${e.fullName}: missing IBAN`);
      continue;
    }
    rows.push({
      employerId: opts.employerId.trim(),
      employeeId: e.wpsEmployeeId.trim(),
      employeeName: e.fullName,
      empNo: e.empNo,
      iban: e.iban.replace(/\s+/g, "").toUpperCase(),
      fixedSalary: e.fixedEarnings,
      variableSalary: e.variableEarnings,
      daysPaid: e.paidDays,
      leaveDays: e.dayFractions.filter((d) => d.isLeave && d.approved).length,
      netSalary: e.netSalary,
    });
  }

  const header = [
    "EmployerID",
    "EmployeeID",
    "EmployeeName",
    "EmpNo",
    "IBAN",
    "FixedSalary",
    "VariableSalary",
    "DaysPaid",
    "LeaveDays",
    "NetSalary",
    "PaymentDate",
  ].join(",");

  const body = rows.map((r) =>
    [
      csvEscape(r.employerId),
      csvEscape(r.employeeId),
      csvEscape(r.employeeName),
      csvEscape(r.empNo),
      csvEscape(r.iban),
      r.fixedSalary.toFixed(2),
      r.variableSalary.toFixed(2),
      r.daysPaid.toFixed(2),
      r.leaveDays.toFixed(2),
      r.netSalary.toFixed(2),
      csvEscape(opts.paymentDate),
    ].join(","),
  );

  return { csv: [header, ...body].join("\n"), rows, errors };
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
