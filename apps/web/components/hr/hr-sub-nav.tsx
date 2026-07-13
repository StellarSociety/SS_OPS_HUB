"use client";

import { LayoutDashboard, Settings, Upload, Users } from "lucide-react";
import { useRelativePathname } from "@/components/providers/venue-scope-provider";
import { SubNavTab } from "@/components/layout/sub-nav-tab";

const links = [
  { href: "/hr", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/hr/staff", label: "Staff directory", icon: Users, exact: false },
  { href: "/hr/import", label: "Import", icon: Upload, exact: false },
  { href: "/hr/settings", label: "Settings", icon: Settings, exact: false },
];

export function HrSubNav() {
  const pathname = useRelativePathname();

  return (
    <nav className="flex flex-wrap gap-1 border-b border-black/10 pb-3">
      {links.map((link) => {
        const active = link.exact
          ? pathname === link.href
          : pathname.startsWith(link.href);
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
