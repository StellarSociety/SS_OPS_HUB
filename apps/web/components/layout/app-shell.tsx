import { AppShellLayout } from "@/components/layout/app-shell-layout";
import type { ShellUser } from "@/components/layout/user-profile-menu";
import { VenueFavicon } from "@/components/brand/venue-favicon";
import { VenueProvider } from "@/components/providers/venue-provider";
import { getVenueBadgeUrl } from "@/lib/venue/branding";
import { venueThemeStyle } from "@/lib/venue/theme";
import type { NotificationRow } from "@/lib/notifications/types";
import type { Venue } from "@/lib/types/database";

type AppShellProps = {
  venue: Venue;
  venues: Venue[];
  user: ShellUser;
  showSettings?: boolean;
  notifications: NotificationRow[];
  unreadCount: number;
  children: React.ReactNode;
};

export function AppShell({
  venue,
  venues,
  user,
  showSettings = false,
  notifications,
  unreadCount,
  children,
}: AppShellProps) {
  const faviconUrl = getVenueBadgeUrl(venue);

  return (
    <VenueProvider initialVenue={venue}>
      <VenueFavicon url={faviconUrl} />
      <div
        className="h-dvh overflow-hidden bg-[var(--venue-secondary,#F0F3DD)]/30"
        style={venueThemeStyle(venue)}
      >
        <AppShellLayout
          venue={venue}
          venues={venues}
          user={user}
          showSettings={showSettings}
          notifications={notifications}
          unreadCount={unreadCount}
        >
          {children}
        </AppShellLayout>
      </div>
    </VenueProvider>
  );
}
