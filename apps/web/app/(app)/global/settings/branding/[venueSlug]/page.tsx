import { notFound } from "next/navigation";
import { VenueBrandingPanel } from "@/components/settings/venue-branding-panel";
import { Card } from "@/components/ui/card";
import { listVenues } from "@/lib/access/store";
import { operationalVenues } from "@/lib/access/global-settings";
import { createServiceClient } from "@/lib/supabase/service";
import { normalizeVenueRows } from "@/lib/venue/normalize";

type PageProps = {
  params: Promise<{ venueSlug: string }>;
};

export default async function GlobalVenueBrandingPage({ params }: PageProps) {
  const { venueSlug } = await params;

  try {
    const service = createServiceClient();
    const venues = operationalVenues(normalizeVenueRows(await listVenues(service)));
    const venue = venues.find((item) => item.slug === venueSlug);

    if (!venue) {
      notFound();
    }

    return <VenueBrandingPanel venue={venue} />;
  } catch (error) {
    console.error("[global/settings/branding]", error);

    return (
      <Card className="p-6">
        <h3 className="font-serif text-xl text-[#3D421F]">
          Could not load branding
        </h3>
        <p className="mt-2 text-sm text-black/60">
          Something went wrong loading venue branding. Run database migrations
          and refresh.
        </p>
      </Card>
    );
  }
}
