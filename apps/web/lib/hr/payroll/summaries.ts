import { round2 } from "./daily-rate";
import type {
  CalculatedEmployeePayroll,
  HrPayrollSettings,
  PayrollPeriod,
  PayrollRunTotals,
} from "./types";

export type GlExportLine = {
  glAccount: string;
  costCentre: string;
  venueName: string;
  departmentName: string;
  debit: number;
  credit: number;
  accrualMonth: string;
  paymentMonth: string;
  description: string;
};

export function buildGlExportLines(opts: {
  venueName: string;
  period: PayrollPeriod;
  settings: HrPayrollSettings;
  employees: CalculatedEmployeePayroll[];
  totals: PayrollRunTotals;
}): GlExportLine[] {
  const { venueName, period, settings, employees, totals } = opts;
  const costCentre = settings.defaultCostCentre || "";
  const accrualMonth = period.payrollMonth;
  const paymentMonth = `${period.paymentDate.slice(0, 8)}01`;

  const byDept = new Map<
    string,
    { basic: number; allowances: number; variables: number; deductions: number; net: number }
  >();

  for (const e of employees) {
    if (!e.included) continue;
    const dept = e.departmentName ?? "Unassigned";
    const row = byDept.get(dept) ?? {
      basic: 0,
      allowances: 0,
      variables: 0,
      deductions: 0,
      net: 0,
    };
    for (const line of e.lines) {
      if (line.code === "BASIC") row.basic = round2(row.basic + line.amount);
      else if (line.code === "ACCOM" || line.code === "TRANSP") {
        row.allowances = round2(row.allowances + line.amount);
      } else if (line.category === "variable") {
        row.variables = round2(row.variables + line.amount);
      } else if (line.category === "deduction") {
        row.deductions = round2(row.deductions + line.amount);
      }
    }
    row.net = round2(row.net + e.netSalary);
    byDept.set(dept, row);
  }

  const lines: GlExportLine[] = [];

  for (const [departmentName, row] of byDept) {
    if (row.basic > 0) {
      lines.push({
        glAccount: settings.glAccounts.basicSalary,
        costCentre,
        venueName,
        departmentName,
        debit: row.basic,
        credit: 0,
        accrualMonth,
        paymentMonth,
        description: "Basic salary",
      });
    }
    if (row.allowances > 0) {
      lines.push({
        glAccount: settings.glAccounts.allowances,
        costCentre,
        venueName,
        departmentName,
        debit: row.allowances,
        credit: 0,
        accrualMonth,
        paymentMonth,
        description: "Allowances",
      });
    }
    if (row.variables > 0) {
      lines.push({
        glAccount: settings.glAccounts.variables,
        costCentre,
        venueName,
        departmentName,
        debit: row.variables,
        credit: 0,
        accrualMonth,
        paymentMonth,
        description: "Variable earnings",
      });
    }
    if (row.deductions > 0) {
      lines.push({
        glAccount: settings.glAccounts.deductions,
        costCentre,
        venueName,
        departmentName,
        debit: 0,
        credit: row.deductions,
        accrualMonth,
        paymentMonth,
        description: "Deductions",
      });
    }
    if (row.net > 0) {
      lines.push({
        glAccount: settings.glAccounts.netPayable,
        costCentre,
        venueName,
        departmentName,
        debit: 0,
        credit: row.net,
        accrualMonth,
        paymentMonth,
        description: "Net salary payable",
      });
    }
  }

  if (totals.employerPayrollCost > 0) {
    lines.push({
      glAccount: settings.glAccounts.employerCost,
      costCentre,
      venueName,
      departmentName: "All",
      debit: totals.employerPayrollCost,
      credit: 0,
      accrualMonth,
      paymentMonth,
      description: "Employer payroll cost (memo)",
    });
  }

  return lines;
}

export function glLinesToCsv(lines: GlExportLine[]): string {
  const header = [
    "GLAccount",
    "CostCentre",
    "Venue",
    "Department",
    "Debit",
    "Credit",
    "AccrualMonth",
    "PaymentMonth",
    "Description",
  ].join(",");
  const body = lines.map((l) =>
    [
      l.glAccount,
      l.costCentre,
      csv(l.venueName),
      csv(l.departmentName),
      l.debit.toFixed(2),
      l.credit.toFixed(2),
      l.accrualMonth,
      l.paymentMonth,
      csv(l.description),
    ].join(","),
  );
  return [header, ...body].join("\n");
}

function csv(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
