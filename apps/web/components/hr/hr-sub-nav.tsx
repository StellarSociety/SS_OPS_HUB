"use client";

import { LayoutDashboard, Settings, Upload, Users } from "lucide-react";
import { usePageAccess } from "@/components/providers/page-access-provider";
import { useRelativePathname } from "@/components/providers/venue-scope-provider";
import { SubNavTab } from "@/components/layout/sub-nav-tab";

const links = [
  { href: "/hr", label: "Overview", icon: LayoutDashboard, exact: true },
  {
    href: "/hr/staff/entry",
    label: "Staff directory",
    icon: Users,
    exact: false,
    activePrefix: "/hr/staff",
  },
  { href: "/hr/import", label: "Import", icon: Upload, exact: false },
  {
    href: "/hr/settings/staff-details/departments",
    label: "Settings",
    icon: Settings,
    exact: false,
    activePrefix: "/hr/settings",
  },
];

export function HrSubNav() {
  const pathname = useRelativePathname();
  const { canOpenHref } = usePageAccess();

  return (
    <nav className="flex flex-wrap gap-1 border-b border-black/10 pb-3">
      {links.filter((link) => canOpenHref(link.href)).map((link) => {
        const matchBase = "activePrefix" in link ? link.activePrefix! : link.href;
        const active = link.exact
          ? pathname === matchBase
          : pathname === matchBase || pathname.startsWith(`${matchBase}/`);
        return (
          <SubNavTab
            key={link.href}
            href={link.href}
            label={link.label}
            icon={link.icon}
            active={active}
            variant="pill"
          />
        );
      })}
    </nav>
  );
}
