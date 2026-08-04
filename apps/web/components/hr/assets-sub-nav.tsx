"use client";

import { Package, Shirt } from "lucide-react";
import { useRelativePathname } from "@/components/providers/venue-scope-provider";
import { ScopedLink } from "@/components/layout/scoped-link";
import { cn } from "@/lib/utils";

const TABS = [
  {
    id: "assets" as const,
    href: "/hr/assets/catalog",
    label: "Assets",
    icon: Package,
  },
  {
    id: "uniform" as const,
    href: "/hr/assets/uniform/employees",
    label: "Uniform",
    icon: Shirt,
  },
] as const;

function isTabActive(
  pathname: string,
  id: (typeof TABS)[number]["id"],
): boolean {
  if (id === "assets") {
    return (
      pathname === "/hr/assets/catalog" ||
      pathname.startsWith("/hr/assets/catalog/")
    );
  }
  return (
    pathname === "/hr/assets/uniform" ||
    pathname.startsWith("/hr/assets/uniform/")
  );
}

export function AssetsSubNav() {
  const pathname = useRelativePathname();

  return (
    <nav
      aria-label="Assets sections"
      className="flex items-center justify-center gap-6"
    >
      {TABS.map((tab) => {
        const active = isTabActive(pathname, tab.id);
        const Icon = tab.icon;
        return (
          <ScopedLink
            key={tab.id}
            href={active ? "/hr/assets" : tab.href}
            aria-label={tab.label}
            aria-current={active ? "page" : undefined}
            title={tab.label}
            className={cn(
              "group flex flex-col items-center gap-2 rounded-2xl px-4 py-3 transition-colors",
              active
                ? "text-[#3D421F]"
                : "text-black/45 hover:text-[#3D421F]",
            )}
          >
            <span
              className={cn(
                "flex h-16 w-16 items-center justify-center rounded-2xl border transition-all",
                active
                  ? "border-[var(--venue-primary)]/40 bg-[var(--venue-primary)]/15 shadow-sm ring-1 ring-[var(--venue-primary)]/15"
                  : "border-black/10 bg-white/60 group-hover:border-black/15 group-hover:bg-white/80",
              )}
            >
              <Icon
                className={cn(
                  "h-7 w-7 transition-colors",
                  active
                    ? "text-[var(--venue-primary,#818a40)]"
                    : "text-black/45 group-hover:text-[var(--venue-primary,#818a40)]",
                )}
                aria-hidden
              />
            </span>
            <span
              className={cn(
                "font-nav text-[11px] font-semibold uppercase tracking-[0.08em]",
                active ? "text-[#3D421F]" : "text-black/45 group-hover:text-[#3D421F]",
              )}
            >
              {tab.label}
            </span>
          </ScopedLink>
        );
      })}
    </nav>
  );
}
