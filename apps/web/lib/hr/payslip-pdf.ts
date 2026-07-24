"use client";

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export type PayslipPdfInput = {
  venueName: string;
  payrollMonthLabel: string;
  periodStart: string;
  periodEnd: string;
  paymentDate: string | null;
  empNo: string;
  fullName: string;
  departmentName: string | null;
  positionName: string | null;
  paidDays: number;
  unpaidDays: number;
  version: number;
  lines: Array<{
    category: string;
    label: string;
    amount: number;
  }>;
  grossEarnings: number;
  totalDeductions: number;
  netSalary: number;
};

function money(n: number): string {
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
    minimumFractionDigits: 2,
  }).format(n);
}

/** Generate a single-employee payslip PDF (client-side download). */
export function downloadPayslipPdf(input: PayslipPdfInput): void {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 48;
  let y = margin;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(input.venueName || "Employer", margin, y);
  y += 22;
  doc.setFontSize(12);
  doc.text("Payslip", margin, y);
  y += 18;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const meta = [
    `Period: ${input.periodStart} → ${input.periodEnd}`,
    `Payroll month: ${input.payrollMonthLabel}`,
    `Payment date: ${input.paymentDate ?? "—"}`,
    `Employee: ${input.fullName} (${input.empNo})`,
    `Department: ${input.departmentName ?? "—"}`,
    `Position: ${input.positionName ?? "—"}`,
    `Paid days: ${input.paidDays} · Unpaid days: ${input.unpaidDays}`,
    `Version: ${input.version}`,
  ];
  for (const line of meta) {
    doc.text(line, margin, y);
    y += 14;
  }
  y += 8;

  autoTable(doc, {
    startY: y,
    head: [["Category", "Description", "Amount"]],
    body: input.lines.map((l) => [
      l.category,
      l.label,
      money(l.amount),
    ]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [61, 66, 31] },
    margin: { left: margin, right: margin },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finalY = ((doc as any).lastAutoTable?.finalY ?? y) + 16;
  doc.setFont("helvetica", "bold");
  doc.text(`Gross earnings: ${money(input.grossEarnings)}`, margin, finalY);
  doc.text(
    `Total deductions: ${money(input.totalDeductions)}`,
    margin,
    finalY + 14,
  );
  doc.setFontSize(12);
  doc.text(`Net salary: ${money(input.netSalary)}`, margin, finalY + 32);

  const filename = `payslip-${input.empNo}-v${input.version}.pdf`;
  doc.save(filename);
}
