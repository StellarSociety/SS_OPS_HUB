import { SettingsSubNav } from "@/components/settings/settings-sub-nav";
import { VenueModulesPanel } from "@/components/settings/venue-modules-panel";
import { listVenueModules, listVenues } from "@/lib/access/store";
import { createServiceClient } from "@/lib/supabase/service";

export default async function SettingsVenueModulesPage() {
  const service = createServiceClient();

  const [venues, venueModules] = await Promise.all([
    listVenues(service),
    listVenueModules(service),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-serif text-3xl text-[#3D421F]">Venue modules</h1>
        <p className="mt-1 text-sm text-black/60">
          Superadmin: enable or disable modules per venue. Users still need
          individual permissions — this controls what the venue can launch with.
        </p>
      </div>

      <SettingsSubNav />

      <VenueModulesPanel venues={venues} venueModules={venueModules} />
    </div>
  );
}
