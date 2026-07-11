import { DailyVsWaitersTable } from "@/components/sales/daily-vs-waiters-table";
import {
  SalesSchemaSetupNotice,
  getSalesDataLoadErrorMessage,
} from "@/components/sales/sales-schema-setup-notice";
import { totalTaxRateFromSettings } from "@/lib/sales/daily-sales-calculations";
import {
  getVenueSalesTaxSettings,
  listVenueDailySales,
} from "@/lib/sales/daily-sales-store";
import { listVenueDailyVsWaitersComments } from "@/lib/sales/daily-vs-waiters-store";
import {
  canAccessDailyVsWaiters,
  canEditDailyVsWaiters,
} from "@/lib/sales/permissions";
import { getSalesPageContext } from "@/lib/sales/page-context";
import { listVenueWaiterDailySales } from "@/lib/sales/waiter-sales-store";
import { Card } from "@/components/ui/card";
import { getVenueLogoUrl } from "@/lib/venue/branding";

export default async function DailyVsWaitersPage() {
  const { supabase, venue, permissions } = await getSalesPageContext();

  if (!canAccessDailyVsWaiters(permissions, venue.id)) {
    return (
      <div className="mx-auto max-w-4xl">
        <p className="text-sm text-black/60">
          You do not have access to Daily vs Waiters for this venue.
        </p>
      </div>
    );
  }

  try {
    const [dailyRecords, waiterRecords, taxSettings, comments] = await Promise.all([
      listVenueDailySales(supabase, venue.id),
      listVenueWaiterDailySales(supabase, venue.id),
      getVenueSalesTaxSettings(supabase, venue.id),
      listVenueDailyVsWaitersComments(supabase, venue.id),
    ]);

    const totalTaxPct = totalTaxRateFromSettings(taxSettings);
    const canEdit = canEditDailyVsWaiters(permissions, venue.id);

    return (
      <div className="mx-auto w-full max-w-none space-y-6">
        <div>
          <h1 className="font-serif text-3xl text-[#3D421F]">Daily vs Waiters</h1>
          <p className="mt-1 text-sm text-black/60">
            Reconcile daily sales with waiter totals — {venue.name}
          </p>
          <hr className="mt-4 border-black/10" />
        </div>

        <DailyVsWaitersTable
          venueName={venue.name}
          venueLogoUrl={getVenueLogoUrl(venue)}
          dailyRecords={dailyRecords}
          waiterRecords={waiterRecords}
          comments={comments}
          totalTaxPct={totalTaxPct}
          canEdit={canEdit}
        />
      </div>
    );
  } catch (error) {
    if (getSalesDataLoadErrorMessage(error) === "schema_missing") {
      return (
        <div className="mx-auto max-w-4xl space-y-4">
          <div>
            <h1 className="font-serif text-3xl text-[#3D421F]">Daily vs Waiters</h1>
            <p className="mt-1 text-sm text-black/60">
              Reconcile daily sales with waiter totals — {venue.name}
            </p>
          </div>
          <SalesSchemaSetupNotice />
        </div>
      );
    }

    console.error("[sales/daily-vs-waiters]", error);

    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <div>
          <h1 className="font-serif text-3xl text-[#3D421F]">Daily vs Waiters</h1>
          <p className="mt-1 text-sm text-black/60">
            Reconcile daily sales with waiter totals — {venue.name}
          </p>
        </div>
        <Card className="p-6">
          <h2 className="font-serif text-xl text-[#3D421F]">
            Could not load comparison data
          </h2>
          <p className="mt-2 text-sm text-black/60">
            Something went wrong loading daily vs waiters data. Refresh the page
            or try again in a moment.
          </p>
        </Card>
      </div>
    );
  }
}
