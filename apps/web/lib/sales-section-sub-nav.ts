import { BarChart3, PenLine, Table2, type LucideIcon } from "lucide-react";

export type SalesSectionTab = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact: boolean;
};

export function salesSectionTabs(basePath: string): SalesSectionTab[] {
  return [
    { href: basePath, label: "Insights", icon: BarChart3, exact: true },
    {
      href: `${basePath}/entry`,
      label: "Entry Form",
      icon: PenLine,
      exact: false,
    },
    {
      href: `${basePath}/data`,
      label: "Database Table",
      icon: Table2,
      exact: false,
    },
  ];
}
