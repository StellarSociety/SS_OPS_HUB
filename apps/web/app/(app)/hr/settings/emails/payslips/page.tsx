import { PayslipEmailSettingsPanel } from "@/components/hr/payslip-email-settings-panel";
import { getPayslipEmailSettings } from "@/lib/actions/hr-payslip-email";
import { getHrPageContext } from "@/lib/hr/page-context";
import { canAdminLookups, canEditPayroll } from "@/lib/hr/permissions";
import { getVenueLogoUrl } from "@/lib/venue/branding";

export default async function HrEmailsPayslipsSettingsPage() {
  const { venue, permissions } = await getHrPageContext();

  const canConfigure =
    canEditPayroll(permissions, venue.id) ||
    canAdminLookups(permissions, venue.id);

  const settings = await getPayslipEmailSettings();
  const venueLogoUrl = getVenueLogoUrl(venue);

  return (
    <div className="space-y-4">
      {canConfigure ? (
        <PayslipEmailSettingsPanel
          settings={settings}
          venueLogoUrl={venueLogoUrl}
          venueName={venue.name}
        />
      ) : (
        <p className="text-sm text-black/55">
          You need payroll edit access to change these settings.
        </p>
      )}
    </div>
  );
}
