import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SettingsSubNav } from "@/components/settings/settings-sub-nav";
import { VenueModulesPanel } from "@/components/settings/venue-modules-panel";
import { listVenueModules, listVenues } from "@/lib/access/store";
import { ACTIVE_VENUE_COOKIE } from "@/lib/constants";
import { createServiceClient } from "@/lib/supabase/service";

export default async function SettingsVenueModulesPage() {
  const service = createServiceClient();

  const cookieStore = await cookies();
  const slug = cookieStore.get(ACTIVE_VENUE_COOKIE)?.value;
  if (!slug) redirect("/select-venue");

  const [venues, venueModules] = await Promise.all([
    listVenues(service),
    listVenueModules(service),
  ]);

  const venue = venues.find((v) => v.slug === slug && !v.is_global);
  if (!venue) redirect("/select-venue");

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-serif text-3xl text-[#3D421F]">Venue modules</h1>
        <p className="mt-1 text-sm text-black/60">
          Enable or disable modules for {venue.name}. Users still need individual
          permissions — this controls what the venue can launch with.
        </p>
      </div>

      <SettingsSubNav />

      <VenueModulesPanel venue={venue} venueModules={venueModules} />
    </div>
  );
}
