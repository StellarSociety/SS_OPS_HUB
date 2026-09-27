"use client";

import { CircleHelp, HardHat, Store, UtensilsCrossed } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useRelativePathname } from "@/components/providers/venue-scope-provider";
import { SubNavTab } from "@/components/layout/sub-nav-tab";
import { SUPPLIER_KIND_OPTIONS } from "@/lib/accounting/ap-types";
import { segmentedSubNavShellClass } from "@/lib/sub-nav-ui";
import { cn } from "@/lib/utils";

const TAB_ICONS = {
  cos: UtensilsCrossed,
  opex_general: Store,
  opex: HardHat,
  uncategorized: CircleHelp,
} as const;

type Props = {
  trailing?: React.ReactNode;
};

export function SuppliersSubNav({ trailing }: Props) {
  const pathname = useRelativePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const suffix = query ? `?${query}` : "";

  return (
    <div className="flex flex-wrap items-center gap-3">
      <nav
        aria-label="Supplier types"
        className={cn(segmentedSubNavShellClass, "min-w-0 flex-1")}
      >
        {SUPPLIER_KIND_OPTIONS.map((tab) => {
          const active =
            tab.kind === "cos"
              ? pathname === tab.href
              : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          const Icon = TAB_ICONS[tab.kind];
          return (
            <SubNavTab
              key={tab.href}
              href={`${tab.href}${suffix}`}
              label={tab.label}
              shortLabel={tab.shortLabel}
              icon={Icon}
              active={active}
            />
          );
        })}
      </nav>
      {trailing}
    </div>
  );
}
