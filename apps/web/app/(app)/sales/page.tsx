import { SalesModuleShortcuts } from "@/components/sales/sales-module-shortcuts";
import { SalesOverviewCharts } from "@/components/sales/sales-overview-charts";
import {
  SalesSchemaSetupNotice,
  getSalesDataLoadErrorMessage,
} from "@/components/sales/sales-schema-setup-notice";
import { totalTaxRateFromSettings } from "@/lib/sales/daily-sales-calculations";
import {
  getVenueSalesTaxSettings,
  listVenueDailySales,
} from "@/lib/sales/daily-sales-store";
import { moduleSidebarRegistry } from "@/lib/module-sidebar";
import { canAccessSalesModule } from "@/lib/sales/permissions";
import { getSalesPageContext } from "@/lib/sales/page-context";
import { Card } from "@/components/ui/card";

export default async function SalesOverviewPage() {
  const { venue, permissions, supabase } = await getSalesPageContext();
  const salesModule = moduleSidebarRegistry.find(
    (module) => module.moduleKey === "sales",
  );
  const SalesModuleIcon = salesModule?.icon;

  if (!canAccessSalesModule(permissions, venue.id)) {
    return (
      <div className="mx-auto max-w-4xl">
        <p className="text-sm text-black/60">
          You do not have access to Sales &amp; Revenue for this venue.
        </p>
      </div>
    );
  }

  try {
    const [records, taxSettings] = await Promise.all([
      listVenueDailySales(supabase, venue.id),
      getVenueSalesTaxSettings(supabase, venue.id),
    ]);

    const totalTaxPct = totalTaxRateFromSettings(taxSettings);

    return (
      <div className="mx-auto w-full max-w-none space-y-6">
        <div>
          <h1 className="flex items-center gap-2.5 font-serif text-3xl text-[#3D421F]">
            {SalesModuleIcon ? (
              <SalesModuleIcon
                className="h-7 w-7 shrink-0 text-[var(--venue-primary,#818a40)]"
                strokeWidth={1.5}
                aria-hidden
              />
            ) : null}
            Sales &amp; Revenue
          </h1>
          <p className="mt-1 text-sm text-black/60">
            Overview — {venue.name}
          </p>
          <hr className="mt-4 border-black/10" />
          <SalesModuleShortcuts />
          <hr className="mt-4 border-black/10" />
        </div>

        <SalesOverviewCharts records={records} totalTaxPct={totalTaxPct} />
      </div>
    );
  } catch (error) {
    if (getSalesDataLoadErrorMessage(error) === "schema_missing") {
      return <SalesSchemaSetupNotice />;
    }

    console.error("[sales/overview]", error);

    return (
      <Card className="p-6">
        <h2 className="font-serif text-xl text-[#3D421F]">
          Could not load sales overview
        </h2>
        <p className="mt-2 text-sm text-black/60">
          Something went wrong loading overview data. Refresh the page or try
          again in a moment.
        </p>
      </Card>
    );
  }
}
