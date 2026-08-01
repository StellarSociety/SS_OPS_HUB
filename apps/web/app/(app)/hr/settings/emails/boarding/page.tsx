import { BoardingEmailSettingsPanel } from "@/components/hr/boarding-email-settings-panel";
import { getBoardingEmailSettings } from "@/lib/actions/hr-boarding-email";
import { getHrPageContext } from "@/lib/hr/page-context";
import { canAdminLookups, canEditStaff } from "@/lib/hr/permissions";
import { getVenueLogoUrl } from "@/lib/venue/branding";

export default async function HrEmailsBoardingSettingsPage() {
  const { venue, permissions } = await getHrPageContext();

  const canConfigure =
    canEditStaff(permissions, venue.id) ||
    canAdminLookups(permissions, venue.id);

  const settings = await getBoardingEmailSettings();
  const venueLogoUrl = getVenueLogoUrl(venue);

  return (
    <div className="space-y-4">
      {canConfigure ? (
        <BoardingEmailSettingsPanel
          settings={settings}
          venueLogoUrl={venueLogoUrl}
          venueName={venue.name}
        />
      ) : (
        <p className="text-sm text-black/55">
          You need staff edit access to change these settings.
        </p>
      )}
    </div>
  );
}
