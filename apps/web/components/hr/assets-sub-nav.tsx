"use client";

import {
  BadgeCheck,
  GraduationCap,
  IdCard,
  Package,
  ShieldCheck,
  Shirt,
} from "lucide-react";
import { ACKNOWLEDGEMENTS_ALL_HREF } from "@/components/hr/acknowledgements-sub-nav";
import { ScopedLink } from "@/components/layout/scoped-link";
import { useRelativePathname } from "@/components/providers/venue-scope-provider";
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
    href: "/hr/assets/catalog/employees",
    label: "Assets",
    icon: Package,
  },
  {
    id: "certifications" as const,
    href: "/hr/assets/certifications/employees",
    label: "Certifications",
    icon: GraduationCap,
  },
  {
    id: "insurance" as const,
    href: "/hr/assets/insurance/employees",
    label: "Insurance",
    icon: ShieldCheck,
  },
  {
    id: "visa" as const,
    href: "/hr/assets/visa/employees",
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
      className="overflow-hidden rounded-2xl border border-[var(--venue-primary)]/20 bg-[var(--venue-primary)]/10 px-3 py-3 shadow-inner"
    >
      <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_auto_1fr]">
        <div className="hidden sm:block" />
        <div className="flex flex-wrap justify-center gap-x-5 gap-y-2">
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
                  "group flex w-[4.75rem] shrink-0 flex-col items-center gap-1 rounded-xl px-0.5 py-1.5 text-center transition-colors",
                  active && "bg-[var(--venue-primary)]/15",
                )}
              >
                <AnimatedSymbol>
                  <Icon
                    className="h-12 w-12 shrink-0 text-[var(--venue-primary,#818a40)]"
                    strokeWidth={1.5}
                    absoluteStrokeWidth
                    aria-hidden
                  />
                </AnimatedSymbol>
                <span
                  className={cn(
                    "line-clamp-2 w-full max-w-[4.75rem] text-[10px] font-medium leading-[1.2] tracking-[-0.01em] text-[#3D421F]",
                    "font-[system-ui,-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',sans-serif]",
                  )}
                >
                  {tab.label}
                </span>
              </ScopedLink>
            );
          })}
        </div>
        <div className="flex justify-center sm:justify-end">
          <ScopedLink
            href={ACKNOWLEDGEMENTS_ALL_HREF}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open acknowledgements in a new tab"
            title="Acknowledgements"
            className="inline-flex items-center justify-center rounded-xl p-1.5 text-[#3D421F] transition-colors hover:bg-[var(--venue-primary)]/15"
          >
            <AnimatedSymbol>
              <BadgeCheck
                className="h-12 w-12 shrink-0 text-[var(--venue-primary,#818a40)]"
                strokeWidth={1.5}
                absoluteStrokeWidth
                aria-hidden
              />
            </AnimatedSymbol>
          </ScopedLink>
        </div>
      </div>
    </nav>
  );
}
