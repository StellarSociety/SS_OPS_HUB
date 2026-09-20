import { redirect } from "next/navigation";
import { HubTermsWebPage } from "@/components/hub-terms/hub-terms-web-page";
import { getRenderClient, getRenderUser, getRenderVenue } from "@/lib/auth/render-user";
import { userHasAcceptedHubTerms } from "@/lib/hub-terms";

export default async function HubTermsPage() {
  const supabase = await getRenderClient();
  const user = await getRenderUser();
  const venue = await getRenderVenue();
  if (!user) redirect("/login");
  if (!venue) redirect("/select-venue");

  const alreadyAccepted = await userHasAcceptedHubTerms({
    supabase,
    userId: user.id,
    venueId: venue.id,
  });

  return (
    <HubTermsWebPage venue={venue} alreadyAccepted={alreadyAccepted} />
  );
}
