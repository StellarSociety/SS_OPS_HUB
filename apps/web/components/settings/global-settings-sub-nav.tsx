"use client";

import { AppWindow, LayoutGrid, Palette } from "lucide-react";
import { useRelativePathname } from "@/components/providers/venue-scope-provider";
import { SubNavTab } from "@/components/layout/sub-nav-tab";

const items = [
  { label: "Overview", href: "/global/settings", icon: LayoutGrid },
  { label: "Branding", href: "/global/settings/branding", icon: Palette },
  { label: "Apps", href: "/global/settings/apps", icon: AppWindow },
] as const;

export function GlobalSettingsSubNav() {
  const pathname = useRelativePathname();

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
