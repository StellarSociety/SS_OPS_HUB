import { SalesForecastPanel } from "@/components/sales/sales-forecast-panel";
import { ModulePageTitle } from "@/components/layout/module-page-title";
import {
  SalesSchemaSetupNotice,
  getSalesDataLoadErrorMessage,
} from "@/components/sales/sales-schema-setup-notice";
import {
  enrichDailySalesRows,
  totalTaxRateFromSettings,
} from "@/lib/sales/daily-sales-calculations";
import {
  getVenueSalesTaxSettings,
  listVenueDailySales,
} from "@/lib/sales/daily-sales-store";
import { listVenueMonthlyForecasts } from "@/lib/sales/daily-snap-store";
import { canAccessCashUp, canEditCashUp } from "@/lib/sales/permissions";
import { getSalesPageContext } from "@/lib/sales/page-context";
import { Card } from "@/components/ui/card";

export default async function SalesForecastPage() {
  const { venue, permissions, supabase } = await getSalesPageContext();

  if (!canAccessCashUp(permissions, venue.id)) {
    return (
      <div className="mx-auto max-w-4xl">
        <p className="text-sm text-black/60">
          You do not have access to Forecasts for this venue.
        </p>
      </div>
    );
  }

  try {
    const [forecasts, dailyRecords, taxSettings] = await Promise.all([
      listVenueMonthlyForecasts(supabase, venue.id),
      listVenueDailySales(supabase, venue.id),
      getVenueSalesTaxSettings(supabase, venue.id),
    ]);

    const totalTaxPct = totalTaxRateFromSettings(taxSettings);
    const dailyRows = enrichDailySalesRows(dailyRecords, totalTaxPct).map((row) => ({
      sale_date: row.sale_date,
      totalVenueGs: row.totalVenueGs,
      totalCovers: row.totalCovers,
      totalFoodGs: row.totalFoodGs,
      totalBeveragesGs: row.totalBeveragesGs,
      totalWineGs: row.totalWineGs,
      totalShishaGs: row.totalShishaGs,
      totalTobaccoGs: row.totalTobaccoGs,
      totalOthersGs: row.totalOthersGs,
      totalServiceFeesGs: row.totalServiceFeesGs,
      totalVenueAllDayAsph: row.totalVenueAllDayAsph,
    }));

    const currentYear = new Date().getFullYear();

    return (
      <div className="mx-auto w-full max-w-none space-y-6">
        <div>
          <ModulePageTitle>Forecasts</ModulePageTitle>
          <p className="mt-1 text-sm text-black/60">
            Yearly revenue, covers, and ASPH planning — {venue.name}
          </p>
          <hr className="mt-4 border-black/10" />
        </div>

        <SalesForecastPanel
          forecasts={forecasts}
          dailyRows={dailyRows}
          canEdit={canEditCashUp(permissions, venue.id)}
          initialYear={currentYear}
        />
      </div>
    );
  } catch (error) {
    if (getSalesDataLoadErrorMessage(error) === "schema_missing") {
      return <SalesSchemaSetupNotice />;
    }

    console.error("[sales/forecast]", error);

    return (
      <Card className="p-6">
        <h2 className="font-serif text-xl text-[#3D421F]">
          Could not load forecasts
        </h2>
        <p className="mt-2 text-sm text-black/60">
          Something went wrong loading forecast data. Refresh the page or try
          again in a moment.
        </p>
      </Card>
    );
  }
}
