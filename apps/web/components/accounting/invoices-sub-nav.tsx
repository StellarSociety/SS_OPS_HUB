"use client";

import {
  AlertTriangle,
  BarChart3,
  FilePlus2,
  FileText,
} from "lucide-react";
import { useRelativePathname } from "@/components/providers/venue-scope-provider";
import { SubNavTab } from "@/components/layout/sub-nav-tab";
import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import { cn } from "@/lib/utils";
import { segmentedSubNavShellClass } from "@/lib/sub-nav-ui";

const tabs = [
  {
    href: "/accounting/invoices/new",
    label: "New Invoice",
    icon: FilePlus2,
    exact: false as const,
  },
  {
    href: "/accounting/invoices",
    label: "All Invoices",
    icon: FileText,
    exact: true as const,
  },
  {
    href: "/accounting/invoices/alerts",
    label: "Alerts",
    icon: AlertTriangle,
    exact: false as const,
  },
  {
    href: "/accounting/invoices/insights",
    label: "Insights",
    icon: BarChart3,
    exact: false as const,
  },
] as const;

export function InvoicesSubNav() {
  const pathname = useRelativePathname();

  return (
    <div className="space-y-3">
      <nav
        aria-label="AP invoices sections"
        className={segmentedSubNavShellClass}
      >
        {tabs.map((tab) => {
          const isDetail =
            tab.href === "/accounting/invoices" &&
            /^\/accounting\/invoices\/[0-9a-f-]+$/i.test(pathname);
          const active = tab.exact
            ? pathname === tab.href || isDetail
            : pathname === tab.href || pathname.startsWith(`${tab.href}/`);

          return (
            <SubNavTab
              key={tab.href}
              href={tab.href}
              label={tab.label}
              icon={tab.icon}
              active={active}
            />
          );
        })}
      </nav>
    </div>
  );
}

export function InvoicesTypeBanner() {
  return (
    <p className="text-sm text-black/55">
      Record supplier purchases and operating expenses.
    </p>
  );
}

export function InvoiceStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: "bg-black/5 text-black/70",
    submitted: "bg-amber-100 text-amber-900",
    approved: "bg-sky-100 text-sky-900",
    posted: "bg-emerald-100 text-emerald-900",
    reversed: "bg-violet-100 text-violet-900",
    void: "bg-red-100 text-red-900",
  };
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize",
        styles[status] ?? "bg-black/5 text-black/70",
      )}
    >
      {status}
    </span>
  );
}

export function ApDenied() {
  return <AccessDeniedBounce />;
}
