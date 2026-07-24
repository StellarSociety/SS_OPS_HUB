export const PAYROLL_RUN_TABS = [
  "run",
  "exceptions",
  "adjustments",
  "settlements",
  "payments",
] as const;

export type PayrollRunTab = (typeof PAYROLL_RUN_TABS)[number];

export function parsePayrollRunTab(
  value: string | null | undefined,
): PayrollRunTab {
  if (value && (PAYROLL_RUN_TABS as readonly string[]).includes(value)) {
    return value as PayrollRunTab;
  }
  return "run";
}
