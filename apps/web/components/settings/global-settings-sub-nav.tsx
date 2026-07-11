"use client";

import { LayoutGrid, Palette } from "lucide-react";
import { usePathname } from "next/navigation";
import { SubNavTab } from "@/components/layout/sub-nav-tab";

const items = [
  { label: "Overview", href: "/global/settings", icon: LayoutGrid },
  { label: "Branding", href: "/global/settings/branding", icon: Palette },
] as const;

export function GlobalSettingsSubNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-2 border-b border-black/10 pb-3">
      {items.map((item) => {
        const active =
          item.href === "/global/settings"
            ? pathname === "/global/settings"
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
