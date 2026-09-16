import { GuestFeedbackPublicPage } from "@/components/sentiment/guest-feedback-public-page";
import { resolveVenueAddress } from "@/lib/sentiment/guest-feedback/venue-address";
import {
  getSettingsByCode,
  listPromotions,
  listQuestions,
} from "@/lib/sentiment/guest-feedback/store";
import { loadGuestFeedbackOutboundLinks } from "@/lib/sentiment/guest-feedback/outbound-links";
import { livePromotions } from "@/lib/sentiment/guest-feedback/types";
import { createServiceClient } from "@/lib/supabase/service";
import { getVenueLogoUrl } from "@/lib/venue/branding";
import { venueThemeStyle } from "@/lib/venue/theme";
import type { Venue } from "@/lib/types/database";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ code: string }>;
};

export async function generateMetadata({ params }: PageProps) {
  const { code } = await params;
  const service = createServiceClient();
  const settings = await getSettingsByCode(service, code).catch(() => null);
  if (!settings || !settings.enabled) {
    return { title: "Guest feedback" };
  }
  const { data: venue } = await service
    .from("venues")
    .select("name")
    .eq("id", settings.venue_id)
    .maybeSingle();
  return {
    title: settings.form_title || `${venue?.name ?? "Venue"} feedback`,
  };
}

export default async function PublicGuestFeedbackPage({ params }: PageProps) {
  const { code } = await params;
  const service = createServiceClient();
  const settings = await getSettingsByCode(service, code);

  if (!settings || !settings.enabled) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-4 py-12">
        <div className="max-w-md rounded-2xl border border-black/10 bg-white px-6 py-8 text-center shadow-sm">
          <h1 className="font-serif text-2xl text-[#3D421F]">Page unavailable</h1>
          <p className="mt-2 text-sm text-black/60">
            This guest feedback page is closed or the link is no longer valid.
          </p>
        </div>
      </main>
    );
  }

  const [{ data: venue }, questions, promotions, socials] = await Promise.all([
    service.from("venues").select("*").eq("id", settings.venue_id).maybeSingle(),
    listQuestions(service, settings.venue_id),
    listPromotions(service, settings.venue_id),
    loadGuestFeedbackOutboundLinks(service, { id: settings.venue_id }),
  ]);
  const venueRow = (venue ?? null) as Venue | null;
  const venueAddress = venueRow
    ? await resolveVenueAddress(service, venueRow)
    : null;

  return (
    <main
      className="min-h-dvh"
      style={{
        ...venueThemeStyle(venueRow),
        backgroundColor:
          "color-mix(in srgb, var(--venue-secondary, #F0F3DD) 35%, white)",
      }}
    >
      <GuestFeedbackPublicPage
        view={{
          code: settings.public_code,
          venueName: venueRow?.name?.trim() || "Venue",
          venueAddress,
          venueLogoUrl: venueRow ? getVenueLogoUrl(venueRow) : null,
          settings,
          questions,
          promotions: livePromotions(promotions),
          socials,
        }}
      />
    </main>
  );
}
