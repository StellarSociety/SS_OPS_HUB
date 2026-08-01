import { EmailChromeSettingsPanel } from "@/components/hr/email-chrome-settings-panel";
import { getEmailChromeSettings } from "@/lib/actions/hr-email-chrome";
import { getHrPageContext } from "@/lib/hr/page-context";
import { canAdminLookups, canEditPayroll, canEditStaff } from "@/lib/hr/permissions";
import { getVenueLogoUrl } from "@/lib/venue/branding";

export default async function HrEmailsHeaderFooterSettingsPage() {
  const { user, venue, permissions } = await getHrPageContext();

  const canConfigure =
    canEditPayroll(permissions, venue.id) ||
    canEditStaff(permissions, venue.id) ||
    canAdminLookups(permissions, venue.id);

  const settings = await getEmailChromeSettings();
  const venueLogoUrl = getVenueLogoUrl(venue);

  return (
    <div className="space-y-4">
      {canConfigure ? (
        <EmailChromeSettingsPanel
          settings={settings}
          venueName={venue.name ?? "Venue"}
          venueLogoUrl={venueLogoUrl}
          defaultTestTo={user.email ?? ""}
        />
      ) : (
        <p className="text-sm text-black/55">
          You need staff or payroll edit access to change these settings.
        </p>
      )}
    </div>
  );
}
