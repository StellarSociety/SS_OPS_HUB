import { CallProvider } from "@/components/connect/chat/chat-call";
import { ConnectWriteProvider } from "@/components/connect/connect-write-context";
import { canWriteConnectOnPhone } from "@/lib/connect/access";
import { MobileAccessDenied } from "@/components/mobile/mobile-access-denied";
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
  const { supabase, venue, user, phone } = await getMobileAppContext(venueSlug);

  // One gate for every phone page: the "Can use the mobile app" switch.
  if (!phone.canUseApp) {
    return <MobileAccessDenied />;
  }
  const accepted = await userHasAcceptedHubTerms({
    supabase,
    userId: user.id,
    venueId: venue.id,
  });

  return (
    <ConnectWriteProvider
      canWrite={canWriteConnectOnPhone(phone.permissions, venue.id)}
    >
      <CallProvider variant="mobile">
        {children}
        <HubTermsGate accepted={accepted} venue={venue} client="mobile" />
      </CallProvider>
    </ConnectWriteProvider>
  );
}
