"use client";

import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { NotificationCenter } from "@/components/layout/notification-center";
import {
  UserProfileMenu,
  type ShellUser,
} from "@/components/layout/user-profile-menu";
import { getModuleSidebarForPath } from "@/lib/module-sidebar";
import type { NotificationRow } from "@/lib/notifications/types";
import type { Venue } from "@/lib/types/database";
import { cn } from "@/lib/utils";

const SHELL_BAR_HEIGHT = "h-16";

type AppHeaderProps = {
  venue: Venue;
  user: ShellUser;
  notifications: NotificationRow[];
  unreadCount: number;
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
};

export function AppHeader({
  venue,
  user,
  notifications,
  unreadCount,
  sidebarOpen = true,
  onToggleSidebar,
}: AppHeaderProps) {
  const pathname = usePathname();
  const moduleSidebar = getModuleSidebarForPath(pathname);
  const inModuleApp = Boolean(moduleSidebar);
  const ModuleIcon = moduleSidebar?.icon;
  const title = inModuleApp
    ? moduleSidebar!.label
    : venue.is_global
      ? "All Venues Operational HUB"
      : `${venue.name} Operational HUB`;

  const sidebarToggle = onToggleSidebar ? (
    <button
      type="button"
      onClick={onToggleSidebar}
      className="hidden rounded-md p-2 text-black/60 hover:bg-black/5 md:-ml-2 md:block"
      aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
    >
      <Menu
        className={cn(
          "h-5 w-5 transition-transform duration-200",
          sidebarOpen ? "rotate-0" : "rotate-90",
        )}
      />
    </button>
  ) : null;

  return (
    <header
      className={cn(
        "grid shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b border-black/5 bg-white/60 px-4 backdrop-blur-md md:px-6",
        SHELL_BAR_HEIGHT,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          className="rounded-md p-2 text-black/60 hover:bg-black/5 md:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        {sidebarToggle}
      </div>
      <h1 className="flex min-w-0 items-center justify-center gap-2 px-4 text-center font-serif text-2xl tracking-wide text-[#3D421F] md:text-3xl">
        {ModuleIcon ? (
          <ModuleIcon
            className="h-7 w-7 shrink-0 text-[var(--venue-primary,#818a40)]"
            strokeWidth={1.5}
            aria-hidden
          />
        ) : null}
        <span className="truncate">{title}</span>
      </h1>
      <div className="flex items-center justify-end gap-2">
        <NotificationCenter
          venueId={venue.id}
          isGlobalVenue={venue.is_global}
          initialNotifications={notifications}
          initialUnreadCount={unreadCount}
        />
        <UserProfileMenu user={user} />
      </div>
    </header>
  );
}
