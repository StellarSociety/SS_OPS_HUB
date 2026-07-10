"use client";

import { useState } from "react";
import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
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
  children: React.ReactNode;
};

export function AppShellLayout({
  venue,
  venues,
  user,
  showSettings = false,
  notifications,
  unreadCount,
  children,
}: AppShellLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="flex h-full flex-col overflow-hidden md:flex-row">
      <AppSidebar
        venue={venue}
        venues={venues}
        showSettings={showSettings}
        open={sidebarOpen}
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <AppHeader
          venue={venue}
          user={user}
          notifications={notifications}
          unreadCount={unreadCount}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((open) => !open)}
        />
        <main className="min-h-0 flex-1 overflow-y-auto p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
