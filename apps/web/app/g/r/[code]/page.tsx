import { PublicPassView } from "@/components/guests-intel/public-pass-view";
import { generateQrSvg } from "@/lib/guests-intel/qr";
import { getIssueByCode } from "@/lib/guests-intel/store";
import { guestPassPath } from "@/lib/guests-intel/types";
import { publicAppUrl } from "@/lib/public-app-url";
import { createServiceClient } from "@/lib/supabase/service";
import { getVenueLogoUrl } from "@/lib/venue/branding";
import { venueThemeStyle } from "@/lib/venue/theme";
import type { Venue } from "@/lib/types/database";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ code: string }>;
};

export default async function PublicGuestPassPage({ params }: PageProps) {
  const { code } = await params;
  const service = createServiceClient();
  const found = await getIssueByCode(service, decodeURIComponent(code));

  if (!found) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-4 py-12">
        <div className="max-w-md rounded-2xl border border-black/10 bg-white px-6 py-8 text-center shadow-sm">
          <h1 className="font-serif text-2xl text-[#3D421F]">Pass not found</h1>
          <p className="mt-2 text-sm text-black/60">
            This guest pass is invalid. Please ask the venue for a new one.
          </p>
        </div>
      </main>
    );
  }

  const { data: venue } = await service
    .from("venues")
    .select("*")
    .eq("id", found.issue.venue_id)
    .maybeSingle();
  const venueRow = (venue ?? null) as Venue | null;
  const passUrl = `${publicAppUrl()}${guestPassPath(found.issue.code)}`;
  const qrSvg = await generateQrSvg(passUrl);

  return (
    <main
      className="flex min-h-dvh items-center justify-center px-4 py-12"
      style={{
        ...venueThemeStyle(venueRow),
        backgroundColor:
          "color-mix(in srgb, var(--venue-secondary, #F0F3DD) 35%, white)",
      }}
    >
      <PublicPassView
        venueName={venueRow?.name?.trim() || "Venue"}
        venueLogoUrl={venueRow ? getVenueLogoUrl(venueRow) : null}
        guest={found.guest}
        reward={found.reward}
        issue={found.issue}
        qrSvg={qrSvg}
      />
    </main>
  );
}
