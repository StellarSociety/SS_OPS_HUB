"use client";

import { List, Upload, Users } from "lucide-react";
import { usePathname } from "next/navigation";
import { SubNavTab } from "@/components/layout/sub-nav-tab";

const links = [
  { href: "/hr", label: "Staff directory", icon: Users, exact: true },
  { href: "/hr/import", label: "Import", icon: Upload, exact: false },
  { href: "/hr/lookups", label: "Lookups", icon: List, exact: false },
];

export function HrSubNav() {
  const pathname = usePathname();

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
