"use client";

import { Blocks, LayoutGrid, Users } from "lucide-react";
import { usePathname } from "next/navigation";
import { SubNavTab } from "@/components/layout/sub-nav-tab";

const items = [
  { label: "Overview", href: "/settings", icon: LayoutGrid },
  { label: "Users & access", href: "/settings/users", icon: Users },
  { label: "Venue modules", href: "/settings/venue-modules", icon: Blocks },
];

export function SettingsSubNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-2 border-b border-black/10 pb-3">
      {items.map((item) => {
        const active =
          item.href === "/settings"
            ? pathname === "/settings"
            : pathname.startsWith(item.href);
        return (
          <SubNavTab
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
            active={active}
            variant="pill"
          />
        );
      })}
    </nav>
  );
}
