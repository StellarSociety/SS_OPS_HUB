import { Suspense } from "react";
import { DailySnapPanel } from "@/components/sales/daily-snap-panel";
import {
  SalesSchemaSetupNotice,
  getSalesDataLoadErrorMessage,
} from "@/components/sales/sales-schema-setup-notice";
import { totalTaxRateFromSettings } from "@/lib/sales/daily-sales-calculations";
import {
  getVenueSalesTaxSettings,
  listVenueDailySales,
} from "@/lib/sales/daily-sales-store";
import {
  getVenueDailySnapNotes,
  listVenueDailySnapDiscountLines,
  listVenueDailySnapEvents,
  listVenueMonthlyForecasts,
} from "@/lib/sales/daily-snap-store";
import { listVenueDailyDiscounts } from "@/lib/sales/discounts-store";
import { canAccessCashUp, canEditCashUp } from "@/lib/sales/permissions";
import { getSalesPageContext } from "@/lib/sales/page-context";
import { listActiveVenueTenders } from "@/lib/sales/tenders-store";
import { listVenueWaiterDailySales } from "@/lib/sales/waiter-sales-store";
import { listActiveVenueWaiters } from "@/lib/sales/waiters-store";
import { Card } from "@/components/ui/card";
import { getVenueLogoUrl } from "@/lib/venue/branding";
import { getLocalTodayIsoDate } from "@/lib/sales/sales-entry-dates";

type DailySnapPageProps = {
  searchParams: Promise<{ date?: string }>;
};

export default async function SalesDailySnapPage({ searchParams }: DailySnapPageProps) {
  const { venue, permissions, supabase } = await getSalesPageContext();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const params = await searchParams;
  const selectedDate = params.date ?? getLocalTodayIsoDate();

  if (!canAccessCashUp(permissions, venue.id)) {
    return (
      <div className="mx-auto max-w-4xl">
        <p className="text-sm text-black/60">
          You do not have access to Daily Snap for this venue.
        </p>
      </div>
    );
  }

  try {
    const [
      dailyRecords,
      discountsRecords,
      waiterRecords,
      waiters,
      tenders,
      forecasts,
      taxSettings,
      notes,
      discountLines,
      events,
    ] = await Promise.all([
      listVenueDailySales(supabase, venue.id),
      listVenueDailyDiscounts(supabase, venue.id),
      listVenueWaiterDailySales(supabase, venue.id),
      listActiveVenueWaiters(supabase, venue.id),
      listActiveVenueTenders(supabase, venue.id),
      listVenueMonthlyForecasts(supabase, venue.id),
      getVenueSalesTaxSettings(supabase, venue.id),
      getVenueDailySnapNotes(supabase, venue.id, selectedDate),
      listVenueDailySnapDiscountLines(supabase, venue.id, selectedDate),
      listVenueDailySnapEvents(supabase, venue.id, selectedDate),
    ]);

    const totalTaxPct = totalTaxRateFromSettings(taxSettings);
    const canEdit = canEditCashUp(permissions, venue.id);

    const { data: profile } = user
      ? await supabase
          .from("profiles")
          .select("full_name, email")
          .eq("id", user.id)
          .single()
      : { data: null };

    const userDisplayName =
      profile?.full_name?.trim() ||
      profile?.email ||
      user?.email ||
      "Unknown";

    return (
      <div className="mx-auto w-full max-w-none space-y-6">
        <div>
          <h1 className="font-serif text-3xl text-[#3D421F]">Daily Snap</h1>
          <p className="mt-1 text-sm text-black/60">
            End-of-day closing report — {venue.name}
          </p>
          <hr className="mt-4 border-black/10" />
        </div>

        <Suspense fallback={<Card className="p-6">Loading Daily Snap…</Card>}>
          <DailySnapPanel
            key={selectedDate}
            venueName={venue.name}
            venueLogoUrl={getVenueLogoUrl(venue)}
            dailyRecords={dailyRecords}
            discountsRecords={discountsRecords}
            waiterRecords={waiterRecords}
            waiters={waiters}
            tenders={tenders}
            forecasts={forecasts}
            notes={notes}
            discountLines={discountLines}
            events={events}
            totalTaxPct={totalTaxPct}
            canEdit={canEdit}
            userDisplayName={userDisplayName}
          />
        </Suspense>
      </div>
    );
  } catch (error) {
    if (getSalesDataLoadErrorMessage(error) === "schema_missing") {
      return (
        <div className="mx-auto max-w-4xl space-y-4">
          <div>
            <h1 className="font-serif text-3xl text-[#3D421F]">Daily Snap</h1>
            <p className="mt-1 text-sm text-black/60">
              End-of-day closing report — {venue.name}
            </p>
          </div>
          <SalesSchemaSetupNotice />
        </div>
      );
    }

    console.error("[sales/daily-snap]", error);

    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <div>
          <h1 className="font-serif text-3xl text-[#3D421F]">Daily Snap</h1>
          <p className="mt-1 text-sm text-black/60">
            End-of-day closing report — {venue.name}
          </p>
        </div>
        <Card className="p-6">
          <h2 className="font-serif text-xl text-[#3D421F]">
            Could not load Daily Snap
          </h2>
          <p className="mt-2 text-sm text-black/60">
            Something went wrong loading the closing report. Refresh the page or
            try again in a moment.
          </p>
        </Card>
      </div>
    );
  }
}
