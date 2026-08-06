import { Suspense } from "react";
import { CashJournalEntryForm } from "@/components/sales/cash-journal-entry-form";
import {
  SalesSchemaSetupNotice,
  getSalesDataLoadErrorMessage,
} from "@/components/sales/sales-schema-setup-notice";
import { listVenueCashJournal } from "@/lib/sales/cash-journal-store";
import { listVenueCashSalesRows } from "@/lib/sales/daily-tender-totals-store";
import { listVenueDailySnapCashDrawerRows } from "@/lib/sales/daily-snap-store";
import { listVenueWaiterGratuityRows } from "@/lib/sales/waiter-sales-store";
import {
  canEditCashUp,
  canEditVenueDaily,
} from "@/lib/sales/permissions";
import { getSalesPageContext } from "@/lib/sales/page-context";

export default async function SalesCashJournalPage() {
  const { venue, permissions, supabase } = await getSalesPageContext();

  try {
    const [journalRecords, cashDrawerRows, cashSalesRows, cashGratuityRows] =
      await Promise.all([
        listVenueCashJournal(supabase, venue.id),
        listVenueDailySnapCashDrawerRows(supabase, venue.id),
        listVenueCashSalesRows(supabase, venue.id),
        listVenueWaiterGratuityRows(supabase, venue.id).catch((error) => {
          console.error("[sales/cash/journal] gratuity:", error);
          return [];
        }),
      ]);

    const canEdit =
      canEditCashUp(permissions, venue.id) ||
      canEditVenueDaily(permissions, venue.id);

    return (
      <Suspense fallback={null}>
        <CashJournalEntryForm
          journalRecords={journalRecords}
          cashDrawerRows={cashDrawerRows}
          cashSalesRows={cashSalesRows}
          cashGratuityRows={cashGratuityRows}
          canEdit={canEdit}
        />
      </Suspense>
    );
  } catch (error) {
    const message = getSalesDataLoadErrorMessage(error);
    if (message) {
      return <SalesSchemaSetupNotice />;
    }
    throw error;
  }
}
