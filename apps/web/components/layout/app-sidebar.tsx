"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  Building2,
  ClipboardList,
  Code2,
  LayoutDashboard,
  LayoutGrid,
  Scale,
  Settings,
  TrendingUp,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { VenueBrandIcon, hasVenueBrandAssets } from "@/components/brand/venue-brand-icon";
import { moduleCategoryMeta } from "@/lib/module-categories";
import { getModuleSidebarForPath, isModuleSidebarItemActive } from "@/lib/module-sidebar";
import { VenueSelector } from "@/components/layout/venue-selector";
import type { Venue } from "@/lib/types/database";

const SHELL_BAR_HEIGHT = "h-16";
const SIDEBAR_EXPANDED = "w-52";
const SIDEBAR_COLLAPSED = "w-16";

const hubNavItems = [
  { label: "Dashboards", href: "/dashboard", icon: LayoutDashboard },
] as const;

const appsHubItem = {
  label: "Apps Hub",
  href: "/modules",
  icon: LayoutGrid,
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

const settingsNavItem = {
  label: "Venue Settings",
  href: "/settings",
  icon: Settings,
  adminOnly: true,
} as const;

const footerNavItems = [
  { label: "User Guide", href: "/user-guide", icon: BookOpen },
  { label: "Developers", href: "/developers", icon: Code2 },
  { label: "Legal", href: "/legal", icon: Scale },
] as const;

function SidebarDivider({ collapsed }: { collapsed: boolean }) {
  return (
    <div
      className={cn("h-px bg-black/10", collapsed ? "mx-2 my-1" : "my-1")}
      aria-hidden
    />
  );
}

function SidebarLink({
  href,
  label,
  icon: Icon,
  active,
  collapsed,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  collapsed: boolean;
}) {
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      aria-label={collapsed ? label : undefined}
      className={cn(
        "flex items-center rounded-lg py-2 text-sm transition-colors",
        collapsed ? "justify-center px-2" : "gap-2.5 px-3",
        active
          ? "bg-[var(--venue-primary)]/15 font-medium text-[#3D421F]"
          : "text-black/60 hover:bg-black/5 hover:text-[#3D421F]",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed ? <span className="truncate">{label}</span> : null}
    </Link>
  );
}

type AppSidebarProps = {
  venue: Venue;
  venues: Venue[];
  showSettings?: boolean;
  open?: boolean;
};

export function AppSidebar({
  venue,
  venues,
  showSettings = false,
  open = true,
}: AppSidebarProps) {
  const pathname = usePathname();
  const collapsed = !open;
  const hasBrandAssets = hasVenueBrandAssets(venue.slug);
  const moduleSidebar = getModuleSidebarForPath(pathname);
  const ModuleIcon = moduleSidebar?.icon;

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
            variant="badge"
            className="h-10 w-10"
            title={venue.name}
          />
        ) : hasBrandAssets ? (
          <VenueBrandIcon
            slug={venue.slug}
            name={venue.name}
            isGlobal={venue.is_global}
            primaryColor={venue.primary_color}
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
            <Link
              href="/modules"
              title={collapsed ? "Apps Hub" : undefined}
              aria-label={collapsed ? "Apps Hub" : undefined}
              className={cn(
                "mb-1 flex items-center rounded-lg py-2 text-xs font-medium uppercase tracking-wide text-black/45 transition-colors hover:bg-black/5 hover:text-[#3D421F]",
                collapsed ? "justify-center px-2" : "gap-2 px-3",
              )}
            >
              <LayoutGrid className="h-3.5 w-3.5 shrink-0" />
              {!collapsed ? "Apps Hub" : null}
            </Link>
            {!collapsed && ModuleIcon ? (
              <div className="mx-1 mb-1 mt-2 flex items-center gap-2.5 rounded-lg border border-[var(--venue-primary)]/25 bg-[var(--venue-primary)]/12 px-3 py-2.5 shadow-sm">
                <ModuleIcon className="h-4 w-4 shrink-0 text-[#3D421F]" />
                <p className="truncate font-serif text-sm font-semibold uppercase tracking-wide text-[#3D421F]">
                  {moduleSidebar.label}
                </p>
              </div>
            ) : null}
            {moduleSidebar.items.map((item) => {
              const active = isModuleSidebarItemActive(pathname, item);
              const Icon = item.icon ?? moduleSidebar.icon;
              return (
                <SidebarLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  icon={Icon}
                  active={active}
                  collapsed={collapsed}
                />
              );
            })}
            {moduleSidebar.bottomItems?.length ? (
              <>
                <div className="flex-1" />
                <SidebarDivider collapsed={collapsed} />
                {moduleSidebar.bottomItems.map((item) => {
                  const active = isModuleSidebarItemActive(pathname, item);
                  const Icon = item.icon ?? Settings;
                  return (
                    <SidebarLink
                      key={item.href}
                      href={item.href}
                      label={item.label}
                      icon={Icon}
                      active={active}
                      collapsed={collapsed}
                    />
                  );
                })}
              </>
            ) : null}
          </>
        ) : (
          <>
            {hubNavItems.map((item) => (
              <SidebarLink
                key={item.href}
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={pathname.startsWith(item.href)}
                collapsed={collapsed}
              />
            ))}
            <SidebarLink
              href={appsHubItem.href}
              label={appsHubItem.label}
              icon={appsHubItem.icon}
              active={pathname === appsHubItem.href}
              collapsed={collapsed}
            />
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
            {showSettings ? (
              <>
                <SidebarDivider collapsed={collapsed} />
                <SidebarLink
                  href={settingsNavItem.href}
                  label={settingsNavItem.label}
                  icon={settingsNavItem.icon}
                  active={pathname.startsWith(settingsNavItem.href)}
                  collapsed={collapsed}
                />
              </>
            ) : null}
          </>
        )}
      </nav>

      <nav
        className={cn(
          "flex shrink-0 flex-col gap-0 border-t border-black/5",
          collapsed ? "p-1.5" : "p-2",
        )}
      >
        {footerNavItems.map((item) => (
          <SidebarLink
            key={item.href}
            href={item.href}
            label={item.label}
            icon={item.icon}
            active={pathname.startsWith(item.href)}
            collapsed={collapsed}
          />
        ))}
      </nav>
    </aside>
  );
}
