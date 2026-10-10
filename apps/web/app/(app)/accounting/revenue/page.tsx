import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import { RevenueTable } from "@/components/accounting/revenue-table";
import { Card } from "@/components/ui/card";
import { getAccountingPageContext } from "@/lib/accounting/page-context";
import { revenueDaysFromSales } from "@/lib/accounting/revenue-from-sales";
import { ACCOUNTING_MODULE_KEY } from "@/lib/accounting/types";
import { canAccessModule } from "@/lib/module-access";
import { getSalesDataLoadErrorMessage } from "@/components/sales/sales-schema-setup-notice";
import {
  getVenueSalesTaxSettings,
  listVenueDailySales,
} from "@/lib/sales/daily-sales-store";

export default async function AccountingRevenuePage() {
  const { venue, permissions, supabase } = await getAccountingPageContext();

  if (!canAccessModule(permissions, ACCOUNTING_MODULE_KEY, venue.id)) {
    return <AccessDeniedBounce />;
  }

  // Load first, render after: JSX built inside try/catch would not catch
  // render errors anyway.
  let loaded:
    | { days: ReturnType<typeof revenueDaysFromSales>; taxSettings: Awaited<ReturnType<typeof getVenueSalesTaxSettings>> }
    | { error: unknown };
  try {
    const [records, taxSettings] = await Promise.all([
      listVenueDailySales(supabase, venue.id),
      getVenueSalesTaxSettings(supabase, venue.id),
    ]);
    loaded = { days: revenueDaysFromSales(records, taxSettings), taxSettings };
  } catch (error) {
    loaded = { error };
  }

  if ("error" in loaded) {
    if (getSalesDataLoadErrorMessage(loaded.error) === "schema_missing") {
      return (
        <Card className="p-6">
          <h2 className="font-serif text-xl text-[#3D421F]">
            Daily sales are not set up
          </h2>
          <p className="mt-2 text-sm text-black/60">
            Revenue reads the Daily Sales database. That table is not available
            yet.
          </p>
        </Card>
      );
    }

    console.error("[accounting/revenue]", loaded.error);

    return (
      <Card className="p-6">
        <h2 className="font-serif text-xl text-[#3D421F]">
          Could not load revenue
        </h2>
        <p className="mt-2 text-sm text-black/60">
          Something went wrong loading daily sales. Refresh the page or try
          again in a moment.
        </p>
      </Card>
    );
  }

  return (
    <div className="mx-auto w-full max-w-none space-y-5">
      <div className="space-y-1">
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-[#3D421F] md:text-3xl">
          Revenue
        </h1>
        <p className="text-sm text-black/55">
          Daily gross sales by revenue center, with tax, service charge and
          net revenue.
        </p>
      </div>
      <RevenueTable days={loaded.days} taxSettings={loaded.taxSettings} />
    </div>
  );
}
