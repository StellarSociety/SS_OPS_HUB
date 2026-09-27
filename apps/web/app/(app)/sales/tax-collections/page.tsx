import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import {
  SalesSchemaSetupNotice,
  getSalesDataLoadErrorMessage,
} from "@/components/sales/sales-schema-setup-notice";
import { TaxCollectionsTable } from "@/components/sales/tax-collections-table";
import { Card } from "@/components/ui/card";
import { canAccessTaxCollections } from "@/lib/sales/permissions";
import { getSalesPageContext } from "@/lib/sales/page-context";
import {
  getVenueSalesTaxSettings,
  listVenueDailySales,
} from "@/lib/sales/daily-sales-store";
import { taxCollectionDaysFromSales } from "@/lib/sales/tax-collections";

export default async function TaxCollectionsPage() {
  const { venue, permissions, supabase } = await getSalesPageContext();

  if (!canAccessTaxCollections(permissions, venue.id)) {
    return <AccessDeniedBounce />;
  }

  try {
    const [records, taxSettings] = await Promise.all([
      listVenueDailySales(supabase, venue.id),
      getVenueSalesTaxSettings(supabase, venue.id),
    ]);
    const days = taxCollectionDaysFromSales(records, taxSettings);

    return (
      <div className="mx-auto w-full max-w-none">
        <TaxCollectionsTable days={days} taxSettings={taxSettings} />
      </div>
    );
  } catch (error) {
    if (getSalesDataLoadErrorMessage(error) === "schema_missing") {
      return <SalesSchemaSetupNotice />;
    }

    console.error("[sales/tax-collections]", error);

    return (
      <Card className="p-6">
        <h2 className="font-serif text-xl text-[#3D421F]">
          Could not load tax collections
        </h2>
        <p className="mt-2 text-sm text-black/60">
          Something went wrong loading daily sales. Refresh the page or try
          again in a moment.
        </p>
      </Card>
    );
  }
}
