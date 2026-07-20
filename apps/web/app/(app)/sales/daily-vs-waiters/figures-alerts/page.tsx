import { FiguresAlertsPanel } from "@/components/sales/figures-alerts-panel";
import {
  SalesSchemaSetupNotice,
  getSalesDataLoadErrorMessage,
} from "@/components/sales/sales-schema-setup-notice";
import { Card } from "@/components/ui/card";
import { totalTaxRateFromSettings } from "@/lib/sales/daily-sales-calculations";
import {
  getVenueSalesTaxSettings,
  listVenueDailySales,
} from "@/lib/sales/daily-sales-store";
import { listVenueDailyTenderTotals } from "@/lib/sales/daily-tender-totals-store";
import { listVenueDailyDiscounts } from "@/lib/sales/discounts-store";
import { canAccessDailyVsWaiters } from "@/lib/sales/permissions";
import { getSalesPageContext } from "@/lib/sales/page-context";
import { listVenueWaiterDailySales } from "@/lib/sales/waiter-sales-store";
import { getVenueLogoUrl } from "@/lib/venue/branding";
import { buildExportUserLabel } from "@/lib/exports/user-label";

export default async function FiguresAlertsPage() {
  const { supabase, venue, permissions } = await getSalesPageContext();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!canAccessDailyVsWaiters(permissions, venue.id)) {
    return (
      <div className="mx-auto max-w-4xl">
        <p className="text-sm text-black/60">
          You do not have access to Figures Alerts for this venue.
        </p>
      </div>
    );
  }

  try {
    const [
      dailyRecords,
      waiterRecords,
      dailyTenderTotals,
      discountsRecords,
      taxSettings,
    ] = await Promise.all([
      listVenueDailySales(supabase, venue.id),
      listVenueWaiterDailySales(supabase, venue.id),
      listVenueDailyTenderTotals(supabase, venue.id),
      listVenueDailyDiscounts(supabase, venue.id),
      getVenueSalesTaxSettings(supabase, venue.id),
    ]);

    const totalTaxPct = totalTaxRateFromSettings(taxSettings);

    const { data: profile } = user
      ? await supabase
          .from("profiles")
          .select("full_name, email")
          .eq("id", user.id)
          .single()
      : { data: null };

    const userDisplayName = buildExportUserLabel(
      profile?.full_name,
      profile?.email ?? user?.email,
    );

    return (
      <div className="space-y-4">
        <div>
          <h2 className="font-serif text-xl font-bold text-[#3D421F]">
            Figures Alerts
          </h2>
          <p className="mt-1 text-sm text-black/60">
            Central view of mismatches across tender verification, tax
            collection, waiter balance checks, daily vs waiters, and discounts.
          </p>
        </div>

        <FiguresAlertsPanel
          venueName={venue.name}
          venueLogoUrl={getVenueLogoUrl(venue)}
          userDisplayName={userDisplayName}
          dailyRecords={dailyRecords}
          waiterRecords={waiterRecords}
          dailyTenderTotals={dailyTenderTotals}
          discountsRecords={discountsRecords}
          taxSettings={taxSettings}
          totalTaxPct={totalTaxPct}
        />
      </div>
    );
  } catch (error) {
    if (getSalesDataLoadErrorMessage(error) === "schema_missing") {
      return (
        <div className="mx-auto max-w-4xl">
          <SalesSchemaSetupNotice />
        </div>
      );
    }

    console.error("[sales/daily-vs-waiters/figures-alerts]", error);

    return (
      <div className="mx-auto max-w-4xl">
        <Card className="p-6">
          <h2 className="font-serif text-xl text-[#3D421F]">
            Could not load figures alerts
          </h2>
          <p className="mt-2 text-sm text-black/60">
            Something went wrong loading verification data. Refresh the page or
            try again in a moment.
          </p>
        </Card>
      </div>
    );
  }
}
