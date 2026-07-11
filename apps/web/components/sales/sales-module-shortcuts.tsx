"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  getModuleSidebarForPath,
  isModuleSidebarItemActive,
  type ModuleSidebarItem,
} from "@/lib/module-sidebar";
import { NavigationPendingIndicator } from "@/components/layout/navigation-pending-indicator";
import { subNavLabelClass, moduleBrandedNavLinkClass, moduleBrandedNavIconClass } from "@/lib/sub-nav-ui";
import { cn } from "@/lib/utils";

type SalesModuleShortcutsProps = {
  moduleLabel?: string;
};

function shortcutBoxClass(active: boolean, branded = false) {
  if (branded) {
    return moduleBrandedNavLinkClass(active);
  }

  return cn(
    "inline-flex h-[46px] shrink-0 items-center gap-1.5 rounded-lg border px-3 shadow-sm backdrop-blur-md transition-colors",
    subNavLabelClass,
    active
      ? "border-[var(--venue-primary)]/30 bg-[var(--venue-primary)]/15 text-[#3D421F]"
      : "border-black/10 bg-white/60 text-black/55 hover:bg-white/80 hover:text-[#3D421F]",
  );
}

function ShortcutLink({
  item,
  active,
  sublabel,
  fallbackIcon,
  branded = false,
}: {
  item: ModuleSidebarItem;
  active: boolean;
  sublabel?: string;
  fallbackIcon: LucideIcon;
  branded?: boolean;
}) {
  const Icon = item.icon ?? fallbackIcon;

  return (
    <Link href={item.href} className={shortcutBoxClass(active, branded)}>
      <Icon
        className={cn(
          branded ? moduleBrandedNavIconClass(active) : "h-3.5 w-3.5 shrink-0 opacity-80",
        )}
        aria-hidden
      />
      {sublabel ? (
        <span className="min-w-0 leading-none">
          <span className="block text-[9px] font-medium uppercase tracking-wide text-black/45">
            {sublabel}
          </span>
          <span className="mt-0.5 block">{item.label}</span>
        </span>
      ) : (
        <span className="whitespace-nowrap">{item.label}</span>
      )}
      <NavigationPendingIndicator />
    </Link>
  );
}

export function SalesModuleShortcuts({
  moduleLabel = "Sales & Revenue",
}: SalesModuleShortcutsProps) {
  const pathname = usePathname();
  const moduleSidebar = getModuleSidebarForPath("/sales");

  if (!moduleSidebar) {
    return null;
  }

  const shortcuts = moduleSidebar.items.filter((item) => !item.exact);
  const bottomItems = moduleSidebar.bottomItems ?? [];

  return (
    <nav
      aria-label="Sales apps"
      className="flex h-[46px] w-full flex-wrap items-center justify-between gap-2"
    >
      <div className="flex flex-wrap items-center gap-2">
        {shortcuts.map((item) => (
          <ShortcutLink
            key={item.href}
            item={item}
            active={isModuleSidebarItemActive(pathname, item)}
            fallbackIcon={moduleSidebar.icon}
          />
        ))}
      </div>
      {bottomItems.length > 0 ? (
        <div className="flex items-center gap-2">
          {bottomItems.map((item) => (
            <ShortcutLink
              key={item.href}
              item={item}
              active={isModuleSidebarItemActive(pathname, item)}
              sublabel={moduleLabel}
              fallbackIcon={Settings}
              branded
            />
          ))}
        </div>
      ) : null}
    </nav>
  );
}
