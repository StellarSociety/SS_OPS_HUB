"use client";

import {
  BarChart3,
  CheckSquare,
  FilePlus2,
  FileText,
  Truck,
} from "lucide-react";
import { useRelativePathname } from "@/components/providers/venue-scope-provider";
import { SubNavTab } from "@/components/layout/sub-nav-tab";
import { ScopedLink } from "@/components/layout/scoped-link";
import { cn } from "@/lib/utils";
import { segmentedSubNavShellClass } from "@/lib/sub-nav-ui";

const tabs = [
  {
    href: "/accounting/invoices",
    label: "All Invoices",
    icon: FileText,
    exact: true as const,
  },
  {
    href: "/accounting/invoices/new",
    label: "New Invoice",
    icon: FilePlus2,
    exact: false as const,
  },
  {
    href: "/accounting/invoices/approvals",
    label: "Approvals",
    icon: CheckSquare,
    exact: false as const,
  },
  {
    href: "/accounting/invoices/insights",
    label: "Insights",
    icon: BarChart3,
    exact: false as const,
  },
  {
    href: "/accounting/invoices/suppliers",
    label: "Suppliers",
    icon: Truck,
    exact: false as const,
  },
] as const;

export function InvoicesSubNav() {
  const pathname = useRelativePathname();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-black/45">
          Type
        </span>
        <div className="inline-flex rounded-md border border-black/10 bg-white p-0.5">
          <span className="rounded px-3 py-1 text-sm font-medium text-[#3D421F] bg-[var(--venue-primary)]/15">
            Purchases
          </span>
          <span
            className="rounded px-3 py-1 text-sm text-black/35"
            title="Sales invoices (AR) — coming later"
          >
            Sales
          </span>
        </div>
      </div>

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
      Supplier / purchase invoices (Accounts Payable). Sales revenue posts via
      Daily Sales — customer AR invoices will live under the Sales tab later.
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
  return (
    <div className="mx-auto max-w-4xl">
      <p className="text-sm text-black/60">
        You do not have access to Accounts Payable for this venue.
      </p>
      <ScopedLink
        href="/accounting"
        className="mt-3 inline-block text-sm text-[var(--venue-primary)] underline"
      >
        Back to Accounting
      </ScopedLink>
    </div>
  );
}
