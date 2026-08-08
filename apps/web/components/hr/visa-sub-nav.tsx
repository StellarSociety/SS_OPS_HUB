"use client";

import { Building2, Receipt, Users } from "lucide-react";
import { useRelativePathname } from "@/components/providers/venue-scope-provider";
import { SubNavTab } from "@/components/layout/sub-nav-tab";
import { pillSubNavShellClass } from "@/lib/sub-nav-ui";
import { cn } from "@/lib/utils";

const TABS = [
  {
    href: "/hr/assets/visa/employees",
    label: "Employees",
    icon: Users,
  },
  {
    href: "/hr/assets/visa/details",
    label: "PRO Provider",
    icon: Building2,
  },
  {
    href: "/hr/assets/visa/expenses",
    label: "Expenses",
    icon: Receipt,
  },
] as const;

export function VisaSubNav() {
  const pathname = useRelativePathname();

  return (
    <nav
      aria-label="Visa sections"
      className={cn(pillSubNavShellClass, "w-full justify-center")}
    >
      {TABS.map((tab) => {
        const active =
          pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <SubNavTab
            key={tab.href}
            href={tab.href}
            label={tab.label}
            icon={tab.icon}
            active={active}
            variant="pill"
          />
        );
      })}
    </nav>
  );
}
