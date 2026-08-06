import { ModulePageTitle } from "@/components/layout/module-page-title";
import { ScopedLink as Link } from "@/components/layout/scoped-link";
import { CashSalesReportPreview } from "@/components/sales/cash-sales-report-preview";
import {
  SalesSchemaSetupNotice,
  getSalesDataLoadErrorMessage,
} from "@/components/sales/sales-schema-setup-notice";
import { Card } from "@/components/ui/card";
import { buildExportUserLabel } from "@/lib/exports/user-label";
import { getSalesPageContext } from "@/lib/sales/page-context";
import { canAccessVenueDaily } from "@/lib/sales/permissions";
import { listVenueCashSalesRows } from "@/lib/sales/daily-tender-totals-store";
import { getVenueLogoUrl } from "@/lib/venue/branding";
import { ArrowLeft } from "lucide-react";

export default async function MonthlyCashSalesReportPage() {
  const { venue, permissions, supabase, user } = await getSalesPageContext();

  if (!canAccessVenueDaily(permissions, venue.id)) {
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
          <ModulePageTitle className="mt-2">Monthly cash sales</ModulePageTitle>
          <hr className="mt-4 border-black/10" />
        </div>
        <p className="text-sm text-black/60">
          You need Daily Sales access to view this cash sales report.
        </p>
      </div>
    );
  }

  try {
    const [cashRecords, profileResult] = await Promise.all([
      listVenueCashSalesRows(supabase, venue.id),
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
      <CashSalesReportPreview
        venueName={venue.name}
        venueLogoUrl={getVenueLogoUrl(venue)}
        userDisplayName={userDisplayName}
        records={cashRecords}
      />
    );
  } catch (error) {
    if (getSalesDataLoadErrorMessage(error) === "schema_missing") {
      return <SalesSchemaSetupNotice />;
    }

    console.error("[sales/reports/revenue/monthly-cash-sales]", error);

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
          <ModulePageTitle className="mt-2">Monthly cash sales</ModulePageTitle>
          <hr className="mt-4 border-black/10" />
        </div>
        <Card className="p-6">
          <h2 className="font-serif text-xl text-[#3D421F]">
            Could not load cash sales report
          </h2>
          <p className="mt-2 text-sm text-black/60">
            Something went wrong loading cash tender data. Refresh the page or
            try again in a moment.
          </p>
        </Card>
      </div>
    );
  }
}
