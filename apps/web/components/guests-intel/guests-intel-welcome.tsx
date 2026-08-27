import { VenueBrandIcon } from "@/components/brand/venue-brand-icon";
import type { Venue } from "@/lib/types/database";

type GuestsIntelWelcomeProps = {
  venue: Venue;
  userName?: string | null;
};

export function GuestsIntelWelcome({ venue, userName }: GuestsIntelWelcomeProps) {
  const firstName = userName?.trim().split(/\s+/)[0] ?? null;
  const hubTitle = venue.is_global
    ? "All Venues Operational HUB"
    : `${venue.name} Operational HUB`;

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
        {firstName ? `Welcome back, ${firstName}` : "Welcome to Guests Intel"}
      </h1>

      <p className="font-serif text-2xl tracking-wide text-[#3D421F] md:text-3xl">
        {hubTitle}
      </p>

      <p className="max-w-xl text-sm text-black/55 md:text-base">
        Collect guest details for {venue.name}, share a form QR, and issue a
        redeemable pass by email.
      </p>
    </div>
  );
}
