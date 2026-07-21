import {
  BadgeDollarSign,
  FileSpreadsheet,
  Gift,
  Receipt,
} from "lucide-react";
import {
  HrSettingsRoadmap,
  HrSettingsSectionHeader,
} from "@/components/hr/hr-settings-section";

const PAY_ROADMAP = [
  {
    title: "Payroll cycles",
    description:
      "Pay periods, cut-off dates, and which departments run on each cycle.",
    icon: BadgeDollarSign,
  },
  {
    title: "Benefits & allowances",
    description:
      "Housing, transport, and other recurring allowances beyond the wage package split.",
    icon: Gift,
  },
  {
    title: "Payslips",
    description:
      "Template fields, delivery channel, and what staff see on each payslip.",
    icon: FileSpreadsheet,
  },
  {
    title: "Expenses",
    description:
      "Reimbursement categories, approval rules, and export to finance.",
    icon: Receipt,
    status: "soon" as const,
  },
] as const;

export default function HrPaySettingsPage() {
  return (
    <div className="space-y-4">
      <HrSettingsSectionHeader
        title="Pay"
        description="Payroll, benefits, payslips, and expenses for this venue. Salary package defaults for new staff are under Staff Details → Salary Defaults."
      />
      <HrSettingsRoadmap
        items={PAY_ROADMAP}
        footnote="These modules are on the roadmap — nothing to configure here yet."
      />
    </div>
  );
}
