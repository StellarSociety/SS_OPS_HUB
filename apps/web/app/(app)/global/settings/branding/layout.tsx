import { BrandingVenueSubNav } from "@/components/settings/branding-venue-sub-nav";
import { listVenues } from "@/lib/access/store";
import { operationalVenues } from "@/lib/access/global-settings";
import { createServiceClient } from "@/lib/supabase/service";
import { normalizeVenueRows } from "@/lib/venue/normalize";

export default async function GlobalBrandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const service = createServiceClient();
  const venues = operationalVenues(normalizeVenueRows(await listVenues(service)));

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-serif text-2xl text-[#3D421F]">Venue branding</h2>
        <p className="mt-1 text-sm text-black/60">
          Pick a venue tab below to edit its identity, colors, and brand assets.
        </p>
      </div>
      <BrandingVenueSubNav venues={venues} />
      {children}
    </div>
  );
}
