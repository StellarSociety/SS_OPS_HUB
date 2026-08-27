import { GuestFeedbackSimulator } from "@/components/sentiment/guest-feedback-simulator";
import { getGuestFeedbackPage } from "@/lib/sentiment/guest-feedback/page-context";
import { getVenueLogoUrl } from "@/lib/venue/branding";
import { venueThemeStyle } from "@/lib/venue/theme";

export default async function GuestFeedbackSimulatorPage() {
  const { venue, settings, questions, livePromos, venueAddress, socials } =
    await getGuestFeedbackPage();

  if (venue.is_global || !settings) {
    return (
      <p className="text-sm text-black/55">
        Guest Feedback is available on venue workspaces, not Global.
      </p>
    );
  }

  return (
    <div className="h-full min-h-0 overflow-hidden">
      <GuestFeedbackSimulator
        themeStyle={venueThemeStyle(venue)}
        view={{
          code: settings.public_code,
          venueName: venue.name,
          venueAddress,
          venueLogoUrl: getVenueLogoUrl(venue),
          settings,
          questions,
          promotions: livePromos,
          socials,
        }}
      />
    </div>
  );
}
