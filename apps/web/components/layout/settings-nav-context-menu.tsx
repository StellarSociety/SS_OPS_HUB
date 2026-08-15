"use client";

import type { ComponentType, ReactNode } from "react";
import { Building2, ExternalLink, Settings } from "lucide-react";
import { ScopedLink as Link } from "@/components/layout/scoped-link";
import {
  RightClickMenu,
  rightClickMenuItemClass,
} from "@/components/layout/right-click-menu";
import { useScopedHref, useVenueScope } from "@/components/providers/venue-scope-provider";
import { getModuleSidebarForPath } from "@/lib/module-sidebar";

export const VENUE_SETTINGS_HREF = "/settings";
export const GLOBAL_SETTINGS_HREF = "/global/settings";

export type SettingsNavTarget = {
  currentLabel: string;
  currentHref: string;
};

export function isVenueOrGlobalSettingsHref(href: string): boolean {
  return href === VENUE_SETTINGS_HREF || href === GLOBAL_SETTINGS_HREF;
}

/** Resolve a settings landing page from a nav href, or null when it is not settings. */
export function resolveSettingsNavTarget(href: string): SettingsNavTarget | null {
  if (href === VENUE_SETTINGS_HREF) {
    return { currentLabel: "Venue", currentHref: VENUE_SETTINGS_HREF };
  }
  if (href === GLOBAL_SETTINGS_HREF) {
    return { currentLabel: "Global", currentHref: GLOBAL_SETTINGS_HREF };
  }

  const moduleSidebar = getModuleSidebarForPath(href);
  const settingsItem = moduleSidebar?.bottomItems?.[0];
  if (!moduleSidebar || !settingsItem) {
    return null;
  }

  const settingsPrefix =
    settingsItem.activePathPrefix ?? `${moduleSidebar.basePath}/settings`;
  const isSettingsLanding =
    href === settingsItem.href ||
    href === settingsPrefix ||
    href === `${moduleSidebar.basePath}/settings`;
  if (!isSettingsLanding) {
    return null;
  }

  return {
    currentLabel: moduleSidebar.label,
    currentHref: settingsItem.href,
  };
}

type SettingsNavContextMenuProps = {
  /** Scope or module name shown in the first two actions, e.g. "Human Resources". */
  currentLabel: string;
  currentHref: string;
  className?: string;
  children: ReactNode;
};

export function SettingsNavContextMenu({
  currentLabel,
  currentHref,
  className,
  children,
}: SettingsNavContextMenuProps) {
  const { scope } = useVenueScope();
  const venueSettingsName =
    scope === "global" ? "Global Settings" : "Venue Settings";
  const currentSettingsName = `${currentLabel} Settings`;
  const includeVenueSettings = !isVenueOrGlobalSettingsHref(currentHref);
  const venueHref =
    scope === "global" ? GLOBAL_SETTINGS_HREF : VENUE_SETTINGS_HREF;

  return (
    <RightClickMenu
      className={className}
      ariaLabel="Settings shortcuts"
      menuClassName="w-72"
      renderMenu={(close) => (
        <>
          <MenuLink href={currentHref} newTab onSelect={close} icon={ExternalLink}>
            Open {currentSettingsName} on another tab
          </MenuLink>
          <MenuLink href={currentHref} onSelect={close} icon={Settings}>
            Open {currentSettingsName}
          </MenuLink>
          {includeVenueSettings ? (
            <>
              <div className="my-1 border-t border-black/5" />
              <MenuLink
                href={venueHref}
                newTab
                onSelect={close}
                icon={ExternalLink}
              >
                Open {venueSettingsName} on another tab
              </MenuLink>
              <MenuLink href={venueHref} onSelect={close} icon={Building2}>
                Open {venueSettingsName}
              </MenuLink>
            </>
          ) : null}
        </>
      )}
    >
      {children}
    </RightClickMenu>
  );
}

/** Wraps children with the settings context menu when `href` is a settings landing page. */
export function MaybeSettingsNavMenu({
  href,
  className = "contents",
  children,
}: {
  href?: string;
  className?: string;
  children: ReactNode;
}) {
  const target = href ? resolveSettingsNavTarget(href) : null;
  if (!target) {
    return children;
  }
  return (
    <SettingsNavContextMenu
      currentLabel={target.currentLabel}
      currentHref={target.currentHref}
      className={className}
    >
      {children}
    </SettingsNavContextMenu>
  );
}

function MenuLink({
  href,
  newTab = false,
  onSelect,
  icon: Icon,
  children,
}: {
  href: string;
  newTab?: boolean;
  onSelect: () => void;
  icon: ComponentType<{ className?: string }>;
  children: ReactNode;
}) {
  const scopedHref = useScopedHref(href);
  const content = (
    <>
      <Icon className="h-3.5 w-3.5 shrink-0 text-black/40" aria-hidden />
      <span className="min-w-0 leading-snug">{children}</span>
    </>
  );

  if (newTab) {
    return (
      <a
        href={scopedHref}
        target="_blank"
        rel="noopener noreferrer"
        role="menuitem"
        className={rightClickMenuItemClass}
        onClick={onSelect}
      >
        {content}
      </a>
    );
  }

  return (
    <Link
      href={href}
      role="menuitem"
      className={rightClickMenuItemClass}
      onClick={onSelect}
    >
      {content}
    </Link>
  );
}
