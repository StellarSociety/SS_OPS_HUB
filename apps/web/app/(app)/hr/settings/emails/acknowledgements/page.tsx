import { AcknowledgementPageSettingsPanel } from "@/components/hr/acknowledgement-page-settings-panel";
import { getAcknowledgementPageSettings } from "@/lib/actions/hr-acknowledgements";
import { getHrPageContext } from "@/lib/hr/page-context";
import { canAdminLookups, canEditStaff } from "@/lib/hr/permissions";
import { getVenueLogoUrl } from "@/lib/venue/branding";

export default async function HrEmailsAcknowledgementsSettingsPage() {
  const { venue, permissions } = await getHrPageContext();

  const canConfigure =
    canEditStaff(permissions, venue.id) ||
    canAdminLookups(permissions, venue.id);

  const settings = await getAcknowledgementPageSettings();
  const venueLogoUrl = getVenueLogoUrl(venue);

  return (
    <div className="space-y-4">
      {canConfigure ? (
        <AcknowledgementPageSettingsPanel
          settings={settings}
          venueName={venue.name ?? "Venue"}
          venueLogoUrl={venueLogoUrl}
        />
      ) : (
        <p className="text-sm text-black/55">
          You need staff edit access to change these settings.
        </p>
      )}
    </div>
  );
}
