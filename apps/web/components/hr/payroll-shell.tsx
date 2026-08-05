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
import { ScopedLink as Link } from "@/components/layout/scoped-link";
import { SubNavTab } from "@/components/layout/sub-nav-tab";
import { PayrollRunSaveButton } from "@/components/hr/payroll-run-save-button";
import {
  parsePayrollRunTab,
  type PayrollRunTab,
} from "@/lib/hr/payroll";
import { pillSubNavShellClass } from "@/lib/sub-nav-ui";
import { cn } from "@/lib/utils";

const TAB_META: {
  id: PayrollRunTab;
  label: string;
  icon: typeof Users;
}[] = [
  { id: "run", label: "Run", icon: Users },
  { id: "exceptions", label: "Alerts", icon: AlertTriangle },
  { id: "adjustments", label: "Adjustments", icon: SlidersHorizontal },
  { id: "settlements", label: "Settlements", icon: ClipboardList },
  { id: "payments", label: "Payments", icon: Banknote },
];

type PayrollShellProps = {
  venueSubtitle: string;
  runId: string;
  runStatus: string;
  canEdit: boolean;
  children: React.ReactNode;
};

export function PayrollShell({
  venueSubtitle,
  runId,
  runStatus,
  canEdit,
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

      <div>
        <Link
          href="/hr/payroll"
          className="text-sm font-medium text-[var(--venue-primary,#818a40)] underline-offset-2 hover:underline"
        >
          ← All payroll runs
        </Link>
      </div>

      <nav
        aria-label="Payroll run sections"
        className={cn(pillSubNavShellClass, "items-center")}
      >
        <div className="flex min-w-0 flex-1 flex-wrap gap-1">
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
        </div>
        <PayrollRunSaveButton
          runId={runId}
          runStatus={runStatus}
          canEdit={canEdit}
        />
      </nav>

      {children}
    </div>
  );
}
