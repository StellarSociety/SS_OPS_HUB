"use client";

import { useState } from "react";
import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { useRelativePathname } from "@/components/providers/venue-scope-provider";
import { Toaster } from "@/components/ui/toast";
import type { ShellUser } from "@/components/layout/user-profile-menu";
import type { NotificationRow } from "@/lib/notifications/types";
import type { Venue } from "@/lib/types/database";

type AppShellLayoutProps = {
  venue: Venue;
  venues: Venue[];
  user: ShellUser;
  showSettings?: boolean;
  notifications: NotificationRow[];
  unreadCount: number;
  logoUrl?: string;
  appName?: string;
  children: React.ReactNode;
};

export function AppShellLayout({
  venue,
  venues,
  user,
  showSettings = false,
  notifications,
  unreadCount,
  logoUrl,
  appName,
  children,
}: AppShellLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // Connecteam opens full width: the app sidebar stays hidden unless the
  // menu button brings it back for this visit.
  const pathname = useRelativePathname();
  const fullWidthApp = pathname === "/connect" || pathname.startsWith("/connect/");
  const [fullWidthSidebar, setFullWidthSidebar] = useState(false);
  const sidebarVisible = fullWidthApp ? fullWidthSidebar : true;

  return (
    <div className="flex h-full flex-col overflow-hidden md:flex-row">
      {sidebarVisible ? (
        <AppSidebar
          venue={venue}
          venues={venues}
          showSettings={showSettings}
          open={fullWidthApp ? true : sidebarOpen}
          logoUrl={logoUrl}
          appName={appName}
        />
      ) : null}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <AppHeader
          venue={venue}
          user={user}
          notifications={notifications}
          unreadCount={unreadCount}
          sidebarOpen={fullWidthApp ? fullWidthSidebar : sidebarOpen}
          showHomeLink={fullWidthApp}
          onToggleSidebar={() =>
            fullWidthApp
              ? setFullWidthSidebar((open) => !open)
              : setSidebarOpen((open) => !open)
          }
        />
        <div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
          <main
            className={
              fullWidthApp
                ? "h-full overflow-y-auto overflow-x-hidden p-2 md:p-3"
                : "h-full overflow-y-auto overflow-x-hidden px-4 pb-4 pt-3 md:px-8 md:pb-8 md:pt-4"
            }
          >
            {children}
          </main>
          <Toaster />
        </div>
      </div>
    </div>
  );
}
