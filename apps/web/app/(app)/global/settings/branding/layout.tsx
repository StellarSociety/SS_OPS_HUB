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
        <h2 className="font-serif text-2xl text-[#3D421F]">Branding</h2>
        <p className="mt-1 text-sm text-black/60">
          Group logo and favicon for sign-in, app icon for Home Screen, then
          pick a venue tab to edit its identity, colors, and brand assets.
        </p>
      </div>
      <BrandingVenueSubNav venues={venues} />
      {children}
    </div>
  );
}
