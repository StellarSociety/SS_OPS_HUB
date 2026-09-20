import { HubTermsGate } from "@/components/hub-terms/hub-terms-gate";
import { userHasAcceptedHubTerms } from "@/lib/hub-terms";
import { getMobileAppContext } from "@/lib/mobile/page-context";

export default async function MobileVenueLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ venueSlug: string }>;
}) {
  const { venueSlug } = await params;
  const { supabase, venue, user } = await getMobileAppContext(venueSlug);
  const accepted = await userHasAcceptedHubTerms({
    supabase,
    userId: user.id,
    venueId: venue.id,
  });

  return (
    <>
      {children}
      <HubTermsGate accepted={accepted} venue={venue} client="mobile" />
    </>
  );
}
