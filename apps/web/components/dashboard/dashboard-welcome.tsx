import { VenueBrandIcon } from "@/components/brand/venue-brand-icon";
import type { Venue } from "@/lib/types/database";

type DashboardWelcomeProps = {
  venue: Venue;
  userName?: string | null;
};

export function DashboardWelcome({ venue, userName }: DashboardWelcomeProps) {
  const firstName = userName?.trim().split(/\s+/)[0] ?? null;

  return (
    <div className="flex flex-col items-center gap-3 pb-2 pt-6 text-center md:pt-10">
      <VenueBrandIcon
        slug={venue.slug}
        name={venue.name}
        isGlobal={venue.is_global}
        primaryColor={venue.primary_color}
        logoUrl={venue.logo_url}
        iconUrl={venue.icon_url}
        faviconUrl={venue.favicon_url}
        variant="mark"
        className="h-16 w-16 md:h-20 md:w-20"
        title={venue.name}
      />

      <h1 className="font-serif text-3xl font-semibold tracking-tight text-[#3D421F] md:text-4xl">
        {firstName ? `Welcome back, ${firstName}` : "Welcome to the Hub"}
      </h1>

      <p className="max-w-xl text-sm text-black/55 md:text-base">
        Your operations command center for {venue.name}. Pick a category below to
        jump into revenue, people, and management apps.
      </p>
    </div>
  );
}
