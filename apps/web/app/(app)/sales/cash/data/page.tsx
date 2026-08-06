import { CashDataTable } from "@/components/sales/cash-data-table";
import {
  SalesSchemaSetupNotice,
  getSalesDataLoadErrorMessage,
} from "@/components/sales/sales-schema-setup-notice";
import { listVenueCashExpenseLines } from "@/lib/sales/cash-expenses-store";
import { mergeCashJournalSyncedRecords } from "@/lib/sales/cash-journal-report";
import { listVenueCashJournal } from "@/lib/sales/cash-journal-store";
import { listVenueCashSalesRows } from "@/lib/sales/daily-tender-totals-store";
import { listVenueDailySnapCashDrawerRows } from "@/lib/sales/daily-snap-store";
import { listVenueWaiterGratuityRows } from "@/lib/sales/waiter-sales-store";
import { getSalesPageContext } from "@/lib/sales/page-context";
import { Card } from "@/components/ui/card";

export default async function SalesCashDataPage() {
  const { venue, supabase } = await getSalesPageContext();

  try {
    const [
      journalRows,
      cashDrawerRows,
      cashSalesRows,
      cashGratuityRows,
      expenseLines,
    ] = await Promise.all([
      listVenueCashJournal(supabase, venue.id),
      listVenueDailySnapCashDrawerRows(supabase, venue.id),
      listVenueCashSalesRows(supabase, venue.id),
      listVenueWaiterGratuityRows(supabase, venue.id).catch((error) => {
        console.error("[sales/cash/data] gratuity:", error);
        return [];
      }),
      listVenueCashExpenseLines(supabase, venue.id).catch((error) => {
        console.error("[sales/cash/data] expense lines:", error);
        return [];
      }),
    ]);

    const records = mergeCashJournalSyncedRecords({
      journalRows,
      cashDrawerRows,
      cashSalesRows,
      cashGratuityRows,
    });

    return <CashDataTable records={records} expenseLines={expenseLines} />;
  } catch (error) {
    if (getSalesDataLoadErrorMessage(error) === "schema_missing") {
      return <SalesSchemaSetupNotice />;
    }

    console.error("[sales/cash/data]", error);

    return (
      <Card className="p-6">
        <h2 className="font-serif text-xl text-[#3D421F]">
          Could not load cash journal
        </h2>
        <p className="mt-2 text-sm text-black/60">
          Something went wrong loading the data table. Refresh the page or try
          again in a moment.
        </p>
      </Card>
    );
  }
}
