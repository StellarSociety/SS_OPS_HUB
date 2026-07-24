import { ModulePageTitle } from "@/components/layout/module-page-title";
import { ScopedLink as Link } from "@/components/layout/scoped-link";
import { GratuityReportPreview } from "@/components/sales/gratuity-report-preview";
import {
  SalesSchemaSetupNotice,
  getSalesDataLoadErrorMessage,
} from "@/components/sales/sales-schema-setup-notice";
import { Card } from "@/components/ui/card";
import { buildExportUserLabel } from "@/lib/exports/user-label";
import { getSalesPageContext } from "@/lib/sales/page-context";
import { canAccessWaiterDaily } from "@/lib/sales/permissions";
import { listVenueWaiterGratuityRows } from "@/lib/sales/waiter-sales-store";
import { getVenueLogoUrl } from "@/lib/venue/branding";
import { ArrowLeft } from "lucide-react";

export default async function MonthlyGratuityByDayReportPage() {
  const { venue, permissions, supabase, user } = await getSalesPageContext();

  if (!canAccessWaiterDaily(permissions, venue.id)) {
    return (
      <div className="mx-auto w-full max-w-none space-y-6">
        <div>
          <Link
            href="/sales/reports"
            className="inline-flex items-center gap-1.5 text-sm text-black/55 transition-colors hover:text-[#3D421F]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Reports
          </Link>
          <ModulePageTitle className="mt-2">
            Monthly gratuity by day
          </ModulePageTitle>
          <hr className="mt-4 border-black/10" />
        </div>
        <p className="text-sm text-black/60">
          You need Waiter Sales access to view this gratuity report.
        </p>
      </div>
    );
  }

  try {
    const [gratuityRecords, profileResult] = await Promise.all([
      listVenueWaiterGratuityRows(supabase, venue.id),
      supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", user.id)
        .single(),
    ]);

    const userDisplayName = buildExportUserLabel(
      profileResult.data?.full_name,
      profileResult.data?.email ?? user.email,
    );

    return (
      <GratuityReportPreview
        venueName={venue.name}
        venueLogoUrl={getVenueLogoUrl(venue)}
        userDisplayName={userDisplayName}
        waiterRecords={gratuityRecords}
      />
    );
  } catch (error) {
    if (getSalesDataLoadErrorMessage(error) === "schema_missing") {
      return <SalesSchemaSetupNotice />;
    }

    console.error("[sales/reports/gratuity/monthly-by-day]", error);

    return (
      <div className="mx-auto w-full max-w-none space-y-6">
        <div>
          <Link
            href="/sales/reports"
            className="inline-flex items-center gap-1.5 text-sm text-black/55 transition-colors hover:text-[#3D421F]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Reports
          </Link>
          <ModulePageTitle className="mt-2">
            Monthly gratuity by day
          </ModulePageTitle>
          <hr className="mt-4 border-black/10" />
        </div>
        <Card className="p-6">
          <h2 className="font-serif text-xl text-[#3D421F]">
            Could not load gratuity report
          </h2>
          <p className="mt-2 text-sm text-black/60">
            Something went wrong loading waiter gratuity data. Refresh the page
            or try again in a moment.
          </p>
        </Card>
      </div>
    );
  }
}
