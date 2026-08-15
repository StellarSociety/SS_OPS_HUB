"use client";

import type { ReactNode } from "react";
import { ExternalLink, Store } from "lucide-react";
import {
  RightClickMenu,
  rightClickMenuItemClass,
} from "@/components/layout/right-click-menu";
import { ModuleIcon } from "@/components/modules/module-icon";
import { useScopedHref } from "@/components/providers/venue-scope-provider";
import { getModuleOverviewByCategory } from "@/lib/modules-registry";
import { cn } from "@/lib/utils";

const APPS_HUB_HREF = "/modules";

type AppsHubContextMenuProps = {
  className?: string;
  children: ReactNode;
};

export function AppsHubContextMenu({
  className,
  children,
}: AppsHubContextMenuProps) {
  const sections = getModuleOverviewByCategory();

  return (
    <RightClickMenu
      className={className}
      ariaLabel="Apps Hub shortcuts"
      menuClassName="w-72 max-h-[min(28rem,calc(100vh-16px))] overflow-y-auto"
      renderMenu={(close) => (
        <>
          <NewTabItem
            href={APPS_HUB_HREF}
            onSelect={close}
            icon={
              <Store className="h-3.5 w-3.5 shrink-0 text-black/40" aria-hidden />
            }
          >
            Open Apps Hub on another tab
          </NewTabItem>
          {sections.map((section) => (
            <div key={section.category.key}>
              <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-black/40">
                {section.category.label}
              </p>
              {section.modules.map((mod) => {
                const live = mod.status === "live" && Boolean(mod.href);
                if (!live || !mod.href) {
                  return (
                    <div
                      key={mod.key}
                      aria-disabled
                      className={cn(
                        rightClickMenuItemClass,
                        "cursor-default text-black/35 hover:bg-transparent hover:text-black/35",
                      )}
                    >
                      <ModuleIcon
                        iconKey={mod.iconKey}
                        className="h-3.5 w-3.5 text-black/25"
                      />
                      <span className="min-w-0 flex-1 leading-snug">{mod.label}</span>
                      <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-black/30">
                        Soon
                      </span>
                    </div>
                  );
                }
                return (
                  <NewTabItem
                    key={mod.key}
                    href={mod.href}
                    onSelect={close}
                    icon={
                      <ModuleIcon
                        iconKey={mod.iconKey}
                        className="h-3.5 w-3.5 text-black/40"
                      />
                    }
                    label={`Open ${mod.label} on another tab`}
                  >
                    {mod.label}
                  </NewTabItem>
                );
              })}
            </div>
          ))}
        </>
      )}
    >
      {children}
    </RightClickMenu>
  );
}

function NewTabItem({
  href,
  onSelect,
  icon,
  label,
  children,
}: {
  href: string;
  onSelect: () => void;
  icon: ReactNode;
  label?: string;
  children: ReactNode;
}) {
  const scopedHref = useScopedHref(href);

  return (
    <a
      href={scopedHref}
      target="_blank"
      rel="noopener noreferrer"
      role="menuitem"
      aria-label={label}
      className={rightClickMenuItemClass}
      onClick={onSelect}
    >
      {icon}
      <span className="min-w-0 flex-1 leading-snug">{children}</span>
      <ExternalLink className="h-3 w-3 shrink-0 text-black/30" aria-hidden />
    </a>
  );
}
