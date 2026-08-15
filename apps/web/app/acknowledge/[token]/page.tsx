import { PublicAcknowledgementForm } from "@/components/hr/public-acknowledgement-form";
import {
  getAcknowledgementRecordByToken,
  loadAcknowledgementPageSettings,
} from "@/lib/hr/acknowledgement-store";
import { createServiceClient } from "@/lib/supabase/service";
import { getVenueLogoUrl } from "@/lib/venue/branding";
import { venueThemeStyle } from "@/lib/venue/theme";
import type { Venue } from "@/lib/types/database";

type PageProps = {
  params: Promise<{ token: string }>;
};

export default async function PublicAcknowledgementPage({ params }: PageProps) {
  const { token } = await params;
  const record = await getAcknowledgementRecordByToken(token);

  if (!record) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[#F0F3DD]/40 px-4 py-12">
        <div className="max-w-md rounded-2xl border border-black/10 bg-white px-6 py-8 text-center shadow-sm">
          <h1 className="font-serif text-2xl text-[#3D421F]">
            Link not found
          </h1>
          <p className="mt-2 text-sm text-black/60">
            This acknowledgement link is invalid or has expired. Please contact
            Human Resources if you still need to respond.
          </p>
        </div>
      </main>
    );
  }

  const service = createServiceClient();
  const [{ data: venue }, settings] = await Promise.all([
    service
      .from("venues")
      .select("*")
      .eq("id", record.venueId)
      .maybeSingle(),
    loadAcknowledgementPageSettings(service, record.venueId),
  ]);

  const venueRow = (venue ?? null) as Venue | null;
  const venueName = venueRow?.name?.trim() || "Venue";
  const venueLogoUrl = venueRow ? getVenueLogoUrl(venueRow) : null;

  return (
    <main
      className="flex min-h-dvh items-center justify-center px-4 py-12"
      style={{
        ...venueThemeStyle(venueRow),
        backgroundColor: "color-mix(in srgb, var(--venue-secondary, #F0F3DD) 35%, white)",
      }}
    >
      <PublicAcknowledgementForm
        token={token}
        record={record}
        settings={settings}
        venueName={venueName}
        venueLogoUrl={venueLogoUrl}
      />
    </main>
  );
}
