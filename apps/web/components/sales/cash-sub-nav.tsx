"use client";

import { useState } from "react";
import { BookOpen, Download, Receipt, Table2 } from "lucide-react";
import { SubNavTab } from "@/components/layout/sub-nav-tab";
import { useRelativePathname } from "@/components/providers/venue-scope-provider";
import { CashJournalExportDialog } from "@/components/sales/cash-journal-export-dialog";
import type { VenueCashExpenseLineRecord } from "@/lib/sales/cash-expenses-types";
import type { CashJournalRecord } from "@/lib/sales/cash-journal-report";
import { pillSubNavShellClass } from "@/lib/sub-nav-ui";
import { cn } from "@/lib/utils";

const tabs = [
  {
    href: "/sales/cash/journal",
    label: "Cash Journal",
    icon: BookOpen,
  },
  {
    href: "/sales/cash/expenses",
    label: "Cash Expenses",
    icon: Receipt,
  },
  {
    href: "/sales/cash/data",
    label: "Table Database",
    icon: Table2,
  },
] as const;

type CashSubNavProps = {
  venueName: string;
  venueLogoUrl?: string | null;
  userDisplayName: string;
  records?: CashJournalRecord[];
  expenseLines?: VenueCashExpenseLineRecord[];
};

export function CashSubNav({
  venueName,
  venueLogoUrl,
  userDisplayName,
  records = [],
  expenseLines = [],
}: CashSubNavProps) {
  const pathname = useRelativePathname();
  const [exportOpen, setExportOpen] = useState(false);

  return (
    <>
      <nav
        aria-label="Cash sections"
        className={cn(pillSubNavShellClass, "items-center")}
      >
        <div className="flex min-w-0 flex-1 flex-wrap gap-1">
          {tabs.map((tab) => (
            <SubNavTab
              key={tab.href}
              href={tab.href}
              label={tab.label}
              icon={tab.icon}
              active={pathname.startsWith(tab.href)}
              variant="pill"
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => setExportOpen(true)}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-black/10 bg-white px-3 text-sm font-medium text-[#3D421F] transition-colors hover:bg-[var(--venue-primary,#818a40)]/10"
        >
          <Download className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          Export PDF
          <span className="hidden text-black/45 sm:inline">[Cash Journal]</span>
        </button>
      </nav>

      <CashJournalExportDialog
        open={exportOpen}
        venueName={venueName}
        venueLogoUrl={venueLogoUrl}
        userDisplayName={userDisplayName}
        records={records}
        expenseLines={expenseLines}
        allowMonthSelect
        onClose={() => setExportOpen(false)}
      />
    </>
  );
}
