import { formatPayrollMonthLabel } from "@/lib/hr/payroll";
import type { PayslipPdfInput } from "@/lib/hr/payslip-pdf";
import type { PayslipSnapshot } from "@/lib/actions/hr-payroll";

/** Map a stored payslip snapshot to the PDF builder input. */
export function payslipSnapshotToPdfInput(
  s: PayslipSnapshot,
): PayslipPdfInput {
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
    lines: [
      ...s.fixed.map((l) => ({
        category: "Fixed" as const,
        label: l.label,
        amount: Number(l.amount),
      })),
      ...s.variables.map((l) => ({
        category: "Variable" as const,
        label: l.label,
        amount: Number(l.amount),
      })),
      ...s.deductions.map((l) => ({
        category: "Deduction" as const,
        label: l.label,
        amount: Number(l.amount),
      })),
    ],
    grossEarnings: Number(s.grossEarnings),
    totalDeductions: Number(s.totalDeductions),
    netSalary: Number(s.netSalary),
  };
}
