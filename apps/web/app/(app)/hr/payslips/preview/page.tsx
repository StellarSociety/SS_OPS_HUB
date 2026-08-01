import { ModulePageTitle } from "@/components/layout/module-page-title";
import { PayslipPdfPreviewClient } from "@/components/hr/payslip-pdf-preview-client";
import { ScopedLink as Link } from "@/components/layout/scoped-link";
import { getPayslipLetterheadSettings } from "@/lib/actions/hr-payslip-letterhead";
import { canViewPayslips } from "@/lib/hr/permissions";
import { getHrPageContext } from "@/lib/hr/page-context";
import { getVenueLogoUrl } from "@/lib/venue/branding";

export const dynamic = "force-dynamic";

export default async function HrPayslipPdfPreviewPage() {
  const { venue, permissions } = await getHrPageContext();

  if (!canViewPayslips(permissions, venue.id)) {
    return (
      <div className="mx-auto max-w-4xl">
        <p className="text-sm text-black/60">
          You do not have access to Payslips for this venue.
        </p>
      </div>
    );
  }

  const venueLogoUrl = getVenueLogoUrl({
    slug: venue.slug,
    logo_url: venue.logo_url,
    icon_url: venue.icon_url,
    favicon_url: venue.favicon_url,
  });
  const letterhead = await getPayslipLetterheadSettings();

  return (
    <div className="mx-auto w-full max-w-none space-y-6">
      <div>
        <ModulePageTitle>Payslip PDF</ModulePageTitle>
        <p className="mt-1 text-sm text-black/60">
          Design preview — sample employee data. Edit letterhead in{" "}
          <Link
            href="/hr/settings/pay/payslip-document"
            className="text-[var(--venue-primary,#818a40)] underline-offset-2 hover:underline"
          >
            HR → Settings → Pay → Payslip document
          </Link>
          .
        </p>
        <hr className="mt-4 border-black/10" />
      </div>

      <PayslipPdfPreviewClient
        key={[
          letterhead.companyName,
          letterhead.companyAddress,
          letterhead.stampUrl ?? "",
          letterhead.footerDisclaimer,
        ].join("|")}
        venueLogoUrl={venueLogoUrl}
        venueStampUrl={letterhead.stampUrl}
        employerLegalName={letterhead.companyName}
        companyAddress={letterhead.companyAddress}
        footerDisclaimer={letterhead.footerDisclaimer}
      />
    </div>
  );
}
