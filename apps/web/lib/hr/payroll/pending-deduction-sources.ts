/** Sources shown in payroll → Import Deductions. Only `available` ones have data today. */
export const PAYROLL_DEDUCTION_IMPORT_SOURCES = [
  {
    id: "uniform_replacement",
    label: "Uniform",
    description: "Uniform replacement charges",
    available: true,
  },
  {
    id: "asset_replacement",
    label: "Assets",
    description: "Asset / equipment replacement charges",
    available: true,
  },
  {
    id: "insurance",
    label: "Insurance",
    description: "Insurance premium recoveries",
    available: false,
  },
  {
    id: "certifications",
    label: "Certifications",
    description: "Certification / training cost recoveries",
    available: false,
  },
  {
    id: "visa_runs",
    label: "Visa runs",
    description: "Employee-charged visa penalties / fines",
    available: true,
  },
] as const;

export type PayrollDeductionImportSourceId =
  (typeof PAYROLL_DEDUCTION_IMPORT_SOURCES)[number]["id"];

export function payrollDeductionSourceLabel(source: string): string {
  const match = PAYROLL_DEDUCTION_IMPORT_SOURCES.find((s) => s.id === source);
  return match?.label ?? source.replace(/_/g, " ");
}
