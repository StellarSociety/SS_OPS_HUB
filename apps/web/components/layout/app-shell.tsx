import { AccessLogger } from "@/components/layout/access-logger";
import { AppShellLayout } from "@/components/layout/app-shell-layout";
import { OnlinePresence } from "@/components/layout/online-presence";
import type { ShellUser } from "@/components/layout/user-profile-menu";
import { VenueFavicon } from "@/components/brand/venue-favicon";
import { PageAccessProvider } from "@/components/providers/page-access-provider";
import { VenueProvider } from "@/components/providers/venue-provider";
import { VenueScopeProvider } from "@/components/providers/venue-scope-provider";
import { getVenueBadgeUrl } from "@/lib/venue/branding";
import { venueThemeStyle } from "@/lib/venue/theme";
import type { NotificationRow } from "@/lib/notifications/types";
import type { UserPermission } from "@/lib/role-permissions";
import type { Venue } from "@/lib/types/database";
import type { VenueScope } from "@/lib/venue/scope-routing";

type AppShellProps = {
  venue: Venue;
  venues: Venue[];
  user: ShellUser;
  showSettings?: boolean;
  notifications: NotificationRow[];
  unreadCount: number;
  scope: VenueScope;
  scopeSlug: string | null;
  scopeBase: string;
  permissions: UserPermission[];
  children: React.ReactNode;
};

export function AppShell({
  venue,
  venues,
  user,
  showSettings = false,
  notifications,
  unreadCount,
  scope,
  scopeSlug,
  scopeBase,
  permissions,
  children,
}: AppShellProps) {
  const faviconUrl = getVenueBadgeUrl(venue);

  return (
    <VenueScopeProvider scope={scope} slug={scopeSlug} base={scopeBase}>
      <PageAccessProvider permissions={permissions} venueId={venue.id}>
        <VenueProvider initialVenue={venue}>
          <VenueFavicon url={faviconUrl} />
          <AccessLogger />
          <OnlinePresence />
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
      </PageAccessProvider>
    </VenueScopeProvider>
  );
}
