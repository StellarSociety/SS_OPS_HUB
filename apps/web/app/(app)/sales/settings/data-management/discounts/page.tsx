import { DiscountsImportPanel } from "@/components/sales/discounts-import-panel";
import {
  SalesSchemaSetupNotice,
  getSalesDataLoadErrorMessage,
} from "@/components/sales/sales-schema-setup-notice";
import { listVenueDailyDiscounts } from "@/lib/sales/discounts-store";
import { canEditDiscounts } from "@/lib/sales/permissions";
import { getSalesPageContext } from "@/lib/sales/page-context";
import { Card } from "@/components/ui/card";

export default async function DiscountsDataManagementPage() {
  const { venue, permissions, supabase } = await getSalesPageContext();

  try {
    const records = await listVenueDailyDiscounts(supabase, venue.id);

    return (
      <DiscountsImportPanel
        venueName={venue.name}
        canEdit={canEditDiscounts(permissions, venue.id)}
        records={records}
      />
    );
  } catch (error) {
    if (getSalesDataLoadErrorMessage(error) === "schema_missing") {
      return <SalesSchemaSetupNotice />;
    }

    console.error("[sales/settings/data-management/discounts]", error);

    return (
      <Card className="p-6">
        <h3 className="font-serif text-xl text-[#3D421F]">
          Could not load discounts import
        </h3>
        <p className="mt-2 text-sm text-black/60">
          Something went wrong loading discounts data for import. Refresh the
          page or try again in a moment.
        </p>
      </Card>
    );
  }
}
