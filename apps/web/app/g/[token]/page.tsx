import { PublicGuestForm } from "@/components/guests-intel/public-guest-form";
import { getSettingsByToken } from "@/lib/guests-intel/store";
import { createServiceClient } from "@/lib/supabase/service";
import { getVenueLogoUrl } from "@/lib/venue/branding";
import { venueThemeStyle } from "@/lib/venue/theme";
import type { Venue } from "@/lib/types/database";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ token: string }>;
};

export default async function PublicGuestFormPage({ params }: PageProps) {
  const { token } = await params;
  const service = createServiceClient();
  const settings = await getSettingsByToken(service, token);

  if (!settings || !settings.public_form_enabled) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-4 py-12">
        <div className="max-w-md rounded-2xl border border-black/10 bg-white px-6 py-8 text-center shadow-sm">
          <h1 className="font-serif text-2xl text-[#3D421F]">Form unavailable</h1>
          <p className="mt-2 text-sm text-black/60">
            This guest form is closed or the link is no longer valid.
          </p>
        </div>
      </main>
    );
  }

  const { data: venue } = await service
    .from("venues")
    .select("*")
    .eq("id", settings.venue_id)
    .maybeSingle();
  const venueRow = (venue ?? null) as Venue | null;

  return (
    <main
      className="flex min-h-dvh items-center justify-center px-4 py-12"
      style={{
        ...venueThemeStyle(venueRow),
        backgroundColor:
          "color-mix(in srgb, var(--venue-secondary, #F0F3DD) 35%, white)",
      }}
    >
      <PublicGuestForm
        token={token}
        venueName={venueRow?.name?.trim() || "Venue"}
        venueLogoUrl={venueRow ? getVenueLogoUrl(venueRow) : null}
        settings={settings}
      />
    </main>
  );
}
