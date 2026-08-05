"use client";

import {
  GraduationCap,
  IdCard,
  Package,
  ShieldCheck,
  Shirt,
} from "lucide-react";
import { useRelativePathname } from "@/components/providers/venue-scope-provider";
import { ScopedLink } from "@/components/layout/scoped-link";
import { AnimatedSymbol } from "@/components/ui/animated-symbol";
import { cn } from "@/lib/utils";

const TABS = [
  {
    id: "uniform" as const,
    href: "/hr/assets/uniform/employees",
    label: "Uniform",
    icon: Shirt,
  },
  {
    id: "assets" as const,
    href: "/hr/assets/catalog",
    label: "Assets",
    icon: Package,
  },
  {
    id: "certifications" as const,
    href: "/hr/assets/certifications",
    label: "Certifications",
    icon: GraduationCap,
  },
  {
    id: "insurance" as const,
    href: "/hr/assets/insurance",
    label: "Insurance",
    icon: ShieldCheck,
  },
  {
    id: "visa" as const,
    href: "/hr/assets/visa",
    label: "Visa",
    icon: IdCard,
  },
] as const;

function isTabActive(
  pathname: string,
  id: (typeof TABS)[number]["id"],
): boolean {
  switch (id) {
    case "assets":
      return (
        pathname === "/hr/assets/catalog" ||
        pathname.startsWith("/hr/assets/catalog/")
      );
    case "uniform":
      return (
        pathname === "/hr/assets/uniform" ||
        pathname.startsWith("/hr/assets/uniform/")
      );
    case "insurance":
      return (
        pathname === "/hr/assets/insurance" ||
        pathname.startsWith("/hr/assets/insurance/")
      );
    case "certifications":
      return (
        pathname === "/hr/assets/certifications" ||
        pathname.startsWith("/hr/assets/certifications/")
      );
    case "visa":
      return (
        pathname === "/hr/assets/visa" ||
        pathname.startsWith("/hr/assets/visa/")
      );
  }
}

export function AssetsSubNav() {
  const pathname = useRelativePathname();

  return (
    <nav
      aria-label="Staff compliance sections"
      className="flex flex-wrap items-center justify-center gap-6"
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
              "group flex w-32 shrink-0 flex-col items-center gap-2 rounded-2xl px-1 py-3 transition-colors",
              active ? "text-[#3D421F]" : "text-[#8a8f7a] hover:text-[#3D421F]",
            )}
          >
            <span
              className={cn(
                "flex h-[4.25rem] w-[4.25rem] items-center justify-center rounded-2xl border transition-colors",
                active
                  ? "border-[var(--venue-primary)]/40 bg-[var(--venue-primary)]/15 shadow-sm ring-1 ring-[var(--venue-primary)]/15"
                  : "border-[#e4e5da] bg-white group-hover:border-[#d5d7c8] group-hover:bg-[#fafaf6]",
              )}
            >
              <AnimatedSymbol>
                <Icon
                  className={cn(
                    "h-9 w-9 transition-colors",
                    active
                      ? "text-[var(--venue-primary,#818a40)]"
                      : "text-[#7a806c] group-hover:text-[var(--venue-primary,#818a40)]",
                  )}
                  strokeWidth={1.5}
                  absoluteStrokeWidth
                  aria-hidden
                />
              </AnimatedSymbol>
            </span>
            <span
              className={cn(
                "text-center font-nav text-[11px] font-semibold uppercase tracking-[0.08em]",
                active
                  ? "text-[#3D421F]"
                  : "text-[#8a8f7a] group-hover:text-[#3D421F]",
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
