"use client";

import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ScopedLink as Link } from "@/components/layout/scoped-link";
import { usePageAccess } from "@/components/providers/page-access-provider";
import { useRelativePathname } from "@/components/providers/venue-scope-provider";
import {
  BookOpen,
  Building2,
  ChevronDown,
  ClipboardList,
  Code2,
  Download,
  LayoutDashboard,
  Scale,
  Settings,
  Store,
  TrendingUp,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  moduleBrandedNavIconClass,
  moduleBrandedNavLinkClass,
} from "@/lib/sub-nav-ui";
import { NavigationPendingIndicator } from "@/components/layout/navigation-pending-indicator";
import { useNavTooltip } from "@/components/layout/use-nav-tooltip";
import { VenueBrandIcon, hasVenueBrandAssets } from "@/components/brand/venue-brand-icon";
import { AnimatedSymbol } from "@/components/ui/animated-symbol";
import { moduleCategoryMeta } from "@/lib/module-categories";
import {
  getModuleSidebarForPath,
  isModuleSidebarItemActive,
  type ModuleSidebarCategory,
  type ModuleSidebarDef,
  type ModuleSidebarItem,
} from "@/lib/module-sidebar";
import { SettingsNavContextMenu } from "@/components/layout/settings-nav-context-menu";
import { AppsHubContextMenu } from "@/components/layout/apps-hub-context-menu";
import { VenueSelector } from "@/components/layout/venue-selector";
import { InstallAppDialog } from "@/components/pwa/install-app-dialog";
import type { Venue } from "@/lib/types/database";

const SHELL_BAR_HEIGHT = "h-16";
const SIDEBAR_EXPANDED = "w-52";
const SIDEBAR_COLLAPSED = "w-16";

const hubNavItems = [
  { label: "Venue", href: "/dashboard", icon: LayoutDashboard },
] as const;

const appsHubItem = {
  label: "Apps Hub",
  href: "/modules",
  icon: Store,
} as const;

const appCategoryNavItems = [
  {
    label: "Operational",
    href: moduleCategoryMeta.operational.href,
    icon: ClipboardList,
  },
  {
    label: "Revenue",
    href: moduleCategoryMeta.revenue.href,
    icon: TrendingUp,
  },
  {
    label: "People",
    href: moduleCategoryMeta.people.href,
    icon: Users,
  },
  {
    label: "Management",
    href: moduleCategoryMeta.management.href,
    icon: Building2,
  },
] as const;

const footerNavItems = [
  { label: "User Guide", href: "/user-guide", icon: BookOpen },
  { label: "Developers", href: "/developers", icon: Code2 },
  { label: "Legal", href: "/legal", icon: Scale },
] as const;

function SidebarDivider({ collapsed }: { collapsed: boolean }) {
  return (
    <div
      className={cn("h-px shrink-0 bg-black/25", collapsed ? "mx-2 my-1.5" : "mx-1 my-1.5")}
      aria-hidden
    />
  );
}

function SidebarLink({
  href,
  label,
  sublabel,
  icon: Icon,
  active,
  collapsed,
  branded = false,
  compact = false,
  comingSoon = false,
  hasPopup = false,
}: {
  href: string;
  label: string;
  sublabel?: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  collapsed: boolean;
  branded?: boolean;
  compact?: boolean;
  comingSoon?: boolean;
  hasPopup?: boolean;
}) {
  const collapsedTitle = sublabel ? `${sublabel} ${label}` : label;
  const { triggerProps, tooltip } = useNavTooltip(
    comingSoon ? `${collapsedTitle} — coming soon` : collapsedTitle,
    collapsed,
  );

  if (comingSoon) {
    return (
      <div
        aria-disabled
        title={`${label} — coming soon`}
        className={cn(
          "relative flex cursor-default select-none items-center rounded-lg text-sm text-black/40",
          compact ? "py-1" : "py-2",
          collapsed ? "justify-center px-2" : "gap-2.5 px-3",
        )}
      >
        <AnimatedSymbol>
          <Icon
            className={cn(
              "shrink-0 opacity-60",
              collapsed ? "h-5 w-5" : "h-4 w-4",
            )}
          />
        </AnimatedSymbol>
        {!collapsed ? (
          <span className="min-w-0 flex-1 truncate">{label}</span>
        ) : null}
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-[18deg] whitespace-nowrap rounded-[3px] border border-[#b23b2e]/70 px-1 py-0.5 text-[7px] font-medium uppercase leading-none tracking-[0.06em] text-[#b23b2e]"
        >
          Coming Soon
        </span>
      </div>
    );
  }

  if (branded) {
    return (
      <Link
        href={href}
        aria-label={collapsed ? collapsedTitle : undefined}
        aria-haspopup={hasPopup ? "menu" : undefined}
        {...triggerProps}
        className={cn(
          moduleBrandedNavLinkClass(active, { fullWidth: !collapsed }),
          "relative",
          collapsed && "justify-center px-2",
        )}
      >
        <AnimatedSymbol>
          <Icon className={cn(moduleBrandedNavIconClass(active), collapsed && "h-5 w-5")} />
        </AnimatedSymbol>
        {tooltip}
        {!collapsed ? (
          sublabel ? (
            <span className="min-w-0 flex-1 leading-none">
              <span className="block truncate text-[9px] font-medium uppercase tracking-wide text-black/45">
                {sublabel}
              </span>
              <span className="mt-0.5 block truncate">{label}</span>
            </span>
          ) : (
            <span className="truncate">{label}</span>
          )
        ) : null}
        <NavigationPendingIndicator className={collapsed ? "absolute right-1 top-1" : "ml-auto"} />
      </Link>
    );
  }

  return (
    <Link
      href={href}
      aria-label={collapsed ? collapsedTitle : undefined}
      aria-haspopup={hasPopup ? "menu" : undefined}
      {...triggerProps}
      className={cn(
        "relative flex items-center rounded-lg text-sm transition-colors",
        compact ? "py-1" : "py-2",
        collapsed ? "justify-center px-2" : "gap-2.5 px-3",
        active
          ? "bg-[var(--venue-primary)]/15 font-medium text-[#3D421F]"
          : "text-black/60 hover:bg-black/5 hover:text-[#3D421F]",
      )}
    >
      <AnimatedSymbol>
        <Icon className={cn("shrink-0", collapsed ? "h-5 w-5" : "h-4 w-4")} />
      </AnimatedSymbol>
      {tooltip}
      {!collapsed ? (
        sublabel ? (
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-[10px] font-medium uppercase tracking-wide text-black/45">
              {sublabel}
            </span>
            <span className="block truncate">{label}</span>
          </span>
        ) : (
          <span className="truncate">{label}</span>
        )
      ) : null}
        <NavigationPendingIndicator className={collapsed ? "absolute right-1 top-1" : "ml-auto"} />
    </Link>
  );
}

function SidebarAction({
  label,
  icon: Icon,
  collapsed,
  compact = false,
  onClick,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  collapsed: boolean;
  compact?: boolean;
  onClick: () => void;
}) {
  const { triggerProps, tooltip } = useNavTooltip(label, collapsed);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={collapsed ? label : undefined}
      {...triggerProps}
      className={cn(
        "relative flex w-full items-center rounded-lg text-sm transition-colors",
        compact ? "py-1" : "py-2",
        collapsed ? "justify-center px-2" : "gap-2.5 px-3",
        "text-black/60 hover:bg-black/5 hover:text-[#3D421F]",
      )}
    >
      <AnimatedSymbol>
        <Icon className={cn("shrink-0", collapsed ? "h-5 w-5" : "h-4 w-4")} />
      </AnimatedSymbol>
      {tooltip}
      {!collapsed ? <span className="truncate">{label}</span> : null}
    </button>
  );
}

function SidebarTopLink({
  href,
  label,
  icon: Icon,
  collapsed,
  className,
  hasPopup = false,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  collapsed: boolean;
  className?: string;
  hasPopup?: boolean;
}) {
  const { triggerProps, tooltip } = useNavTooltip(label, collapsed);

  return (
    <Link
      href={href}
      aria-label={collapsed ? label : undefined}
      aria-haspopup={hasPopup ? "menu" : undefined}
      {...triggerProps}
      className={cn(
        "relative flex items-center rounded-lg py-2 text-xs font-medium uppercase tracking-wide text-black/45 transition-colors hover:bg-black/5 hover:text-[#3D421F]",
        collapsed ? "justify-center px-2" : "gap-2 px-3",
        className,
      )}
    >
      <AnimatedSymbol>
        <Icon className={cn("shrink-0", collapsed ? "h-5 w-5" : "h-3.5 w-3.5")} />
      </AnimatedSymbol>
      {!collapsed ? label : null}
      <NavigationPendingIndicator className={collapsed ? "absolute right-1 top-1" : "ml-auto"} />
      {tooltip}
    </Link>
  );
}

function SidebarCategoryLabel({
  label,
  expanded,
  onToggle,
}: {
  label: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className="flex w-full items-center justify-between gap-1 rounded-md px-3 pb-0.5 pt-2 text-left text-[10px] font-semibold uppercase tracking-wider text-black/40 transition-colors hover:bg-black/5 hover:text-black/60"
    >
      <span className="truncate">{label}</span>
      <ChevronDown
        className={cn(
          "h-3 w-3 shrink-0 transition-transform duration-200",
          expanded ? "rotate-0" : "-rotate-90",
        )}
        aria-hidden
      />
    </button>
  );
}

function activeCategoryKeys(
  categories: ModuleSidebarCategory[],
  itemByHref: Map<string, ModuleSidebarItem>,
  pathname: string,
): string[] {
  return categories
    .filter((category) =>
      category.itemHrefs.some((href) => {
        const item = itemByHref.get(href);
        return item ? isModuleSidebarItemActive(pathname, item) : false;
      }),
    )
    .map((category) => category.key);
}

/**
 * Renders a module's nav items. When the module defines `categories`, items are
 * grouped under their category label (matching the module shortcuts bar);
 * otherwise it falls back to a flat list using each item's `dividerAfter`.
 * Categories stay expanded when they fit; inactive groups auto-collapse only
 * when the scroll parent would otherwise overflow (avoids a scrollbar).
 */
function ModuleSidebarItems({
  moduleSidebar,
  pathname,
  collapsed,
}: {
  moduleSidebar: ModuleSidebarDef;
  pathname: string;
  collapsed: boolean;
}) {
  const { canOpenHref } = usePageAccess();
  const categories = moduleSidebar.categories ?? [];
  const fitAnchorRef = useRef<HTMLDivElement>(null);

  const visibleItems = useMemo(
    () =>
      moduleSidebar.items.filter(
        (item) => item.comingSoon || canOpenHref(item.href),
      ),
    [moduleSidebar.items, canOpenHref],
  );

  const itemByHref = useMemo(
    () => new Map(visibleItems.map((item) => [item.href, item])),
    [visibleItems],
  );

  const routeActiveKeys = useMemo(
    () => activeCategoryKeys(categories, itemByHref, pathname),
    [categories, itemByHref, pathname],
  );

  /** True when fully expanded content does not fit the nav viewport. */
  const [spaceTight, setSpaceTight] = useState(false);
  /** Manual open/closed overrides; cleared when fit mode flips. */
  const [userOverrides, setUserOverrides] = useState<Record<string, boolean>>(
    {},
  );
  const fullContentHeightRef = useRef(0);

  useEffect(() => {
    fullContentHeightRef.current = 0;
    setSpaceTight(false);
    setUserOverrides({});
  }, [moduleSidebar.moduleKey]);

  useEffect(() => {
    if (routeActiveKeys.length === 0) {
      return;
    }
    setUserOverrides((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const key of routeActiveKeys) {
        if (next[key] === false) {
          delete next[key];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [routeActiveKeys]);

  const defaultExpanded = (key: string) => {
    if (!spaceTight) {
      return true;
    }
    if (routeActiveKeys.includes(key)) {
      return true;
    }
    if (routeActiveKeys.length === 0) {
      return key === categories[0]?.key;
    }
    return false;
  };

  const isCategoryExpanded = (key: string) => {
    if (collapsed) {
      return true;
    }
    if (Object.hasOwn(userOverrides, key)) {
      return userOverrides[key]!;
    }
    return defaultExpanded(key);
  };

  useLayoutEffect(() => {
    if (collapsed || categories.length === 0) {
      return;
    }
    const nav = fitAnchorRef.current?.closest("nav");
    if (!nav) {
      return;
    }

    const measure = () => {
      const { scrollHeight, clientHeight } = nav;
      if (!spaceTight) {
        fullContentHeightRef.current = Math.max(
          fullContentHeightRef.current,
          scrollHeight,
        );
        if (scrollHeight > clientHeight + 2) {
          setSpaceTight(true);
          setUserOverrides({});
        }
        return;
      }
      if (
        fullContentHeightRef.current > 0 &&
        fullContentHeightRef.current <= clientHeight
      ) {
        setSpaceTight(false);
        setUserOverrides({});
      }
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [
    collapsed,
    categories.length,
    spaceTight,
    pathname,
    visibleItems.length,
  ]);

  const toggleCategory = (key: string) => {
    setUserOverrides((prev) => {
      const currently = Object.hasOwn(prev, key)
        ? prev[key]!
        : defaultExpanded(key);
      return { ...prev, [key]: !currently };
    });
  };

  if (categories.length === 0) {
    return (
      <>
        {visibleItems.map((item) => {
          const active = isModuleSidebarItemActive(pathname, item);
          const Icon = item.icon ?? moduleSidebar.icon;
          return (
            <Fragment key={item.href}>
              <SidebarLink
                href={item.href}
                label={item.label}
                icon={Icon}
                active={active}
                collapsed={collapsed}
                comingSoon={item.comingSoon}
              />
              {item.dividerAfter ? (
                <SidebarDivider collapsed={collapsed} />
              ) : null}
            </Fragment>
          );
        })}
      </>
    );
  }

  const categorizedHrefs = new Set(
    categories.flatMap((category) => category.itemHrefs),
  );
  const leadingItems = visibleItems.filter(
    (item) => !categorizedHrefs.has(item.href),
  );

  const renderItem = (href: string) => {
    const item = itemByHref.get(href);
    if (!item) {
      return null;
    }
    const Icon = item.icon ?? moduleSidebar.icon;
    return (
      <SidebarLink
        key={item.href}
        href={item.href}
        label={item.label}
        icon={Icon}
        active={isModuleSidebarItemActive(pathname, item)}
        collapsed={collapsed}
        comingSoon={item.comingSoon}
      />
    );
  };

  return (
    <div ref={fitAnchorRef} className="contents">
      {leadingItems.map((item) => renderItem(item.href))}
      {categories.map((category) => {
        const visibleHrefs = category.itemHrefs.filter((href) =>
          itemByHref.has(href),
        );
        if (visibleHrefs.length === 0) {
          return null;
        }
        const expanded = isCategoryExpanded(category.key);
        return (
          <Fragment key={category.key}>
            {collapsed ? (
              <SidebarDivider collapsed={collapsed} />
            ) : (
              <SidebarCategoryLabel
                label={category.label}
                expanded={expanded}
                onToggle={() => toggleCategory(category.key)}
              />
            )}
            {expanded
              ? visibleHrefs.map((href) => renderItem(href))
              : null}
          </Fragment>
        );
      })}
    </div>
  );
}

type AppSidebarProps = {
  venue: Venue;
  venues: Venue[];
  showSettings?: boolean;
  open?: boolean;
  logoUrl?: string;
  appName?: string;
};

export function AppSidebar({
  venue,
  venues,
  showSettings = false,
  open = true,
  logoUrl,
  appName,
}: AppSidebarProps) {
  const pathname = useRelativePathname();
  const collapsed = !open;
  const hasBrandAssets = hasVenueBrandAssets(venue);
  const moduleSidebar = getModuleSidebarForPath(pathname);
  const { canOpenHref } = usePageAccess();
  const ModuleIcon = moduleSidebar?.icon;
  const [installOpen, setInstallOpen] = useState(false);

  return (
    <aside
      className={cn(
        "hidden h-full shrink-0 flex-col overflow-hidden border-r border-black/5 bg-white/50 backdrop-blur-md transition-[width] duration-200 ease-out md:flex",
        open ? SIDEBAR_EXPANDED : SIDEBAR_COLLAPSED,
      )}
    >
      <div
        className={cn(
          "flex shrink-0 items-center justify-center border-b border-black/5",
          SHELL_BAR_HEIGHT,
          collapsed ? "px-2" : "px-4",
        )}
      >
        {collapsed ? (
          <VenueBrandIcon
            slug={venue.slug}
            name={venue.name}
            isGlobal={venue.is_global}
            primaryColor={venue.primary_color}
            logoUrl={venue.logo_url}
            iconUrl={venue.icon_url}
            faviconUrl={venue.favicon_url}
            variant="mark"
            className="h-10 w-10"
            title={venue.name}
          />
        ) : hasBrandAssets ? (
          <VenueBrandIcon
            slug={venue.slug}
            name={venue.name}
            isGlobal={venue.is_global}
            primaryColor={venue.primary_color}
            logoUrl={venue.logo_url}
            iconUrl={venue.icon_url}
            faviconUrl={venue.favicon_url}
            variant="wordmark"
            className="h-7 w-auto max-w-full"
            title={venue.name}
          />
        ) : (
          <p className="font-serif text-lg text-[#3D421F]">{venue.name}</p>
        )}
      </div>

      <nav
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto",
          collapsed ? "p-1.5" : "p-2.5",
        )}
      >
        <VenueSelector
          venues={venues}
          activeVenue={venue}
          collapsed={collapsed}
        />

        {moduleSidebar ? (
          <>
            <SidebarTopLink
              href="/dashboard"
              label="Venue"
              icon={LayoutDashboard}
              collapsed={collapsed}
            />
            <AppsHubContextMenu className="w-full">
              <SidebarTopLink
                href="/modules"
                label="Apps Hub"
                icon={Store}
                collapsed={collapsed}
                className="mb-1"
                hasPopup
              />
            </AppsHubContextMenu>
            <SidebarDivider collapsed={collapsed} />
            {ModuleIcon ? (
              collapsed ? (
                <div
                  title={moduleSidebar.label}
                  aria-label={moduleSidebar.label}
                  className="mx-1 mb-1 mt-2 flex items-center justify-center rounded-lg border border-[var(--venue-primary)]/25 bg-[var(--venue-primary)]/12 p-2 shadow-sm"
                >
                  <AnimatedSymbol>
                    <ModuleIcon className="h-5 w-5 shrink-0 text-[#3D421F]" />
                  </AnimatedSymbol>
                </div>
              ) : (
                <div className="mx-1 mb-1 mt-2 flex items-center gap-2.5 rounded-lg border border-[var(--venue-primary)]/25 bg-[var(--venue-primary)]/12 px-3 py-2.5 shadow-sm">
                  <AnimatedSymbol>
                    <ModuleIcon className="h-4 w-4 shrink-0 text-[#3D421F]" />
                  </AnimatedSymbol>
                  <p className="truncate font-serif text-sm font-semibold tracking-wide text-[#3D421F]">
                    {moduleSidebar.label}
                  </p>
                </div>
              )
            ) : null}
            <ModuleSidebarItems
              moduleSidebar={moduleSidebar}
              pathname={pathname}
              collapsed={collapsed}
            />
          </>
        ) : (
          <>
            {hubNavItems.map((item) => (
              <SidebarTopLink
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                collapsed={collapsed}
              />
            ))}
            <AppsHubContextMenu className="w-full">
              <SidebarTopLink
                href={appsHubItem.href}
                label={appsHubItem.label}
                icon={appsHubItem.icon}
                collapsed={collapsed}
                className="mb-1"
                hasPopup
              />
            </AppsHubContextMenu>
            <SidebarDivider collapsed={collapsed} />
            {appCategoryNavItems.map((item) => (
              <SidebarLink
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={pathname === item.href}
                collapsed={collapsed}
              />
            ))}
          </>
        )}
      </nav>

      <nav
        className={cn(
          "flex shrink-0 flex-col gap-0.5 border-t border-black/5",
          collapsed ? "p-1.5" : "px-2 py-1.5",
        )}
      >
        {showSettings && venue.is_global ? (
          <SettingsNavContextMenu
            currentLabel="Global"
            currentHref="/global/settings"
            className="w-full"
          >
            <SidebarLink
              href="/global/settings"
              label="Settings"
              sublabel="Global"
              icon={Settings}
              active={pathname.startsWith("/global/settings")}
              collapsed={collapsed}
              branded
              hasPopup
            />
          </SettingsNavContextMenu>
        ) : null}
        {moduleSidebar?.bottomItems
          ?.filter((item) => canOpenHref(item.href))
          .map((item) => {
          const Icon = item.icon ?? Settings;
          return (
            <SettingsNavContextMenu
              key={item.href}
              currentLabel={moduleSidebar.label}
              currentHref={item.href}
              className="w-full"
            >
              <SidebarLink
                href={item.href}
                label={item.label}
                sublabel={moduleSidebar.label}
                icon={Icon}
                active={isModuleSidebarItemActive(pathname, item)}
                collapsed={collapsed}
                branded
                hasPopup
              />
            </SettingsNavContextMenu>
          );
        })}
        {!moduleSidebar && !venue.is_global ? (
          <SettingsNavContextMenu
            currentLabel="Venue"
            currentHref="/settings"
            className="w-full"
          >
            <SidebarLink
              href="/settings"
              label="Settings"
              sublabel="Venue"
              icon={Settings}
              active={pathname.startsWith("/settings")}
              collapsed={collapsed}
              branded
              hasPopup
            />
          </SettingsNavContextMenu>
        ) : null}
        {(showSettings && venue.is_global) ||
        moduleSidebar?.bottomItems?.length ||
        (!moduleSidebar && !venue.is_global) ? (
          <SidebarDivider collapsed={collapsed} />
        ) : null}
        <SidebarAction
          label="Download"
          icon={Download}
          collapsed={collapsed}
          compact
          onClick={() => setInstallOpen(true)}
        />
        {footerNavItems.map((item) => (
          <SidebarLink
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
            active={pathname.startsWith(item.href)}
            collapsed={collapsed}
            compact
          />
        ))}
      </nav>
      <InstallAppDialog
        open={installOpen}
        onOpenChange={setInstallOpen}
        logoUrl={logoUrl}
        appName={appName}
      />
    </aside>
  );
}
