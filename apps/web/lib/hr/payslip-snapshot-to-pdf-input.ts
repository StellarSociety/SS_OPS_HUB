import { formatPayrollMonthLabel } from "@/lib/hr/payroll";
import { sortPayslipLines } from "@/lib/hr/payslip-line-order";
import {
  derivePayslipLineDiscountFields,
  type PayslipPdfInput,
} from "@/lib/hr/payslip-pdf";
import type { PayslipSnapshot } from "@/lib/actions/hr-payroll";

type SnapshotLine = {
  code?: string | null;
  label: string;
  amount: number;
  sortOrder?: number | null;
  meta?: { rateDiscountPercent?: number | null } | null;
};

function mapLine(
  category: string,
  l: SnapshotLine,
): PayslipPdfInput["lines"][number] & {
  code?: string | null;
  sortOrder?: number | null;
} {
  const amount = Number(l.amount);
  const discount = derivePayslipLineDiscountFields({
    amount,
    meta: l.meta ?? null,
  });
  const isEarnings = category === "Fixed" || category === "Variable";
  return {
    category,
    code: l.code ?? null,
    label: l.label,
    amount,
    baseAmount: discount.baseAmount ?? (isEarnings ? amount : null),
    deductionPercent: discount.deductionPercent,
    deductionValue: discount.deductionValue,
    sortOrder: l.sortOrder ?? null,
  };
}

/** Map a stored payslip snapshot to the PDF builder input. */
export function payslipSnapshotToPdfInput(
  s: PayslipSnapshot,
): PayslipPdfInput {
  const ordered = sortPayslipLines([
    ...s.fixed.map((l) => mapLine("Fixed", l)),
    ...s.variables.map((l) => mapLine("Variable", l)),
    ...s.deductions.map((l) => mapLine("Deduction", l)),
  ]);

  return {
    venueName: s.employer.venueName,
    employerLegalName: s.employer.legalName,
    companyAddress: s.employer.companyAddress,
    footerDisclaimer: s.employer.footerDisclaimer,
    payrollMonthLabel: formatPayrollMonthLabel(s.payrollMonth),
    periodStart: s.periodStart,
    periodEnd: s.periodEnd,
    paymentDate: s.paymentDate,
    empNo: s.employee.empNo,
    fullName: s.employee.fullName,
    joiningDate: s.employee.joiningDate,
    departmentName: s.employee.department,
    positionName: s.employee.position,
    paidDays: Number(s.paidDays),
    unpaidDays: Number(s.unpaidDays),
    version: s.version,
    leaveKinds: s.leave?.kinds ?? [],
    paymentMethod: s.paymentMethod,
    bankName: s.bankName,
    accountNumber: s.accountNumber,
    lines: ordered.map(({ code: _code, sortOrder: _sort, ...line }) => line),
    grossEarnings: Number(s.grossEarnings),
    totalDeductions: Number(s.totalDeductions),
    netSalary: Number(s.netSalary),
  };
}
