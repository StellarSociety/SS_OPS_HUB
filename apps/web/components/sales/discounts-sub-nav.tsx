"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/sales/discounts", label: "Insights", exact: true as const },
  { href: "/sales/discounts/entry", label: "Entry Form", exact: false as const },
  { href: "/sales/discounts/data", label: "Data Table", exact: false as const },
] as const;

export function DiscountsSubNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Discounts sections"
      className="flex w-full overflow-hidden rounded-lg border border-black/10 bg-white/60 backdrop-blur-md"
    >
      {tabs.map((tab) => {
        const active = tab.exact
          ? pathname === tab.href
          : pathname.startsWith(tab.href);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "flex flex-1 items-center justify-center border-r border-black/10 px-4 py-3 text-sm transition-colors last:border-r-0",
              active
                ? "bg-[var(--venue-primary)]/15 font-medium text-[#3D421F]"
                : "text-black/60 hover:bg-black/[0.03] hover:text-[#3D421F]",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
