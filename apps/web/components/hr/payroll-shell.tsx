"use client";

import {
  AlertTriangle,
  Banknote,
  ClipboardList,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { ModulePageTitle } from "@/components/layout/module-page-title";
import { SubNavTab } from "@/components/layout/sub-nav-tab";
import {
  parsePayrollRunTab,
  type PayrollRunTab,
} from "@/lib/hr/payroll";
import { pillSubNavShellClass } from "@/lib/sub-nav-ui";

const TAB_META: {
  id: PayrollRunTab;
  label: string;
  icon: typeof Users;
}[] = [
  { id: "run", label: "Run", icon: Users },
  { id: "exceptions", label: "Exceptions", icon: AlertTriangle },
  { id: "adjustments", label: "Adjustments", icon: SlidersHorizontal },
  { id: "settlements", label: "Settlements", icon: ClipboardList },
  { id: "payments", label: "Payments", icon: Banknote },
];

type PayrollShellProps = {
  venueSubtitle: string;
  runId: string;
  children: React.ReactNode;
};

export function PayrollShell({
  venueSubtitle,
  runId,
  children,
}: PayrollShellProps) {
  const searchParams = useSearchParams();
  const activeTab = parsePayrollRunTab(searchParams.get("tab"));

  return (
    <div className="mx-auto w-full max-w-none space-y-6">
      <div>
        <ModulePageTitle>Payroll</ModulePageTitle>
        <p className="mt-1 text-sm text-black/60">{venueSubtitle}</p>
        <hr className="mt-4 border-black/10" />
      </div>

      <nav aria-label="Payroll run sections" className={pillSubNavShellClass}>
        {TAB_META.map((tab) => (
          <SubNavTab
            key={tab.id}
            href={`/hr/payroll/${runId}?tab=${tab.id}`}
            label={tab.label}
            icon={tab.icon}
            active={activeTab === tab.id}
            variant="pill"
          />
        ))}
      </nav>

      {children}
    </div>
  );
}
