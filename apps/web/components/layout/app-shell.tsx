import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import {
  VenueProvider,
  venueThemeStyle,
} from "@/components/providers/venue-provider";
import type { Venue } from "@/lib/types/database";

type AppShellProps = {
  venue: Venue;
  children: React.ReactNode;
};

export function AppShell({ venue, children }: AppShellProps) {
  return (
    <VenueProvider initialVenue={venue}>
      <div
        className="flex min-h-screen flex-col bg-[var(--venue-secondary,#F0F3DD)]/30 md:flex-row"
        style={venueThemeStyle(venue)}
      >
        <AppSidebar venue={venue} />
        <div className="flex min-h-screen flex-1 flex-col">
          <AppHeader venue={venue} />
          <main className="flex-1 p-4 md:p-8">{children}</main>
        </div>
      </div>
    </VenueProvider>
  );
}
