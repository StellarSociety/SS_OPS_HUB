import { Suspense } from "react";
import { CashExpensesPanel } from "@/components/sales/cash-expenses-panel";
import {
  SalesSchemaSetupNotice,
  getSalesDataLoadErrorMessage,
} from "@/components/sales/sales-schema-setup-notice";
import { Card } from "@/components/ui/card";
import { listVenueCashExpenseLines } from "@/lib/sales/cash-expenses-store";
import { listVenueCashJournal } from "@/lib/sales/cash-journal-store";
import {
  canEditCashUp,
  canEditVenueDaily,
} from "@/lib/sales/permissions";
import { getSalesPageContext } from "@/lib/sales/page-context";

export default async function SalesCashExpensesPage() {
  const { venue, permissions, supabase } = await getSalesPageContext();

  try {
    const [journalRecords, expenseLines] = await Promise.all([
      listVenueCashJournal(supabase, venue.id),
      listVenueCashExpenseLines(supabase, venue.id),
    ]);
    const canEdit =
      canEditCashUp(permissions, venue.id) ||
      canEditVenueDaily(permissions, venue.id);

    return (
      <Suspense fallback={null}>
        <CashExpensesPanel
          journalRecords={journalRecords}
          expenseLines={expenseLines}
          canEdit={canEdit}
        />
      </Suspense>
    );
  } catch (error) {
    if (getSalesDataLoadErrorMessage(error) === "schema_missing") {
      return <SalesSchemaSetupNotice />;
    }

    console.error("[sales/cash/expenses]", error);

    return (
      <Card className="p-6">
        <h2 className="font-serif text-xl text-[#3D421F]">
          Could not load cash expenses
        </h2>
        <p className="mt-2 text-sm text-black/60">
          Something went wrong loading journal expense totals. Refresh the page
          or try again in a moment.
        </p>
      </Card>
    );
  }
}
