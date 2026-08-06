import { ModulePageTitle } from "@/components/layout/module-page-title";
import { CashSubNav } from "@/components/sales/cash-sub-nav";
import { buildExportUserLabel } from "@/lib/exports/user-label";
import { listVenueCashExpenseLines } from "@/lib/sales/cash-expenses-store";
import { mergeCashJournalSyncedRecords } from "@/lib/sales/cash-journal-report";
import { listVenueCashJournal } from "@/lib/sales/cash-journal-store";
import { listVenueCashSalesRows } from "@/lib/sales/daily-tender-totals-store";
import { listVenueDailySnapCashDrawerRows } from "@/lib/sales/daily-snap-store";
import { listVenueWaiterGratuityRows } from "@/lib/sales/waiter-sales-store";
import { getSalesPageContext } from "@/lib/sales/page-context";
import { getVenueLogoUrl } from "@/lib/venue/branding";

export default async function SalesCashLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { venue, supabase, user } = await getSalesPageContext();

  const [
    profileResult,
    journalRows,
    cashDrawerRows,
    cashSalesRows,
    cashGratuityRows,
    expenseLines,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .single(),
    listVenueCashJournal(supabase, venue.id).catch((error) => {
      console.error("[sales/cash/layout] journal:", error);
      return [];
    }),
    listVenueDailySnapCashDrawerRows(supabase, venue.id).catch((error) => {
      console.error("[sales/cash/layout] drawer:", error);
      return [];
    }),
    listVenueCashSalesRows(supabase, venue.id).catch((error) => {
      console.error("[sales/cash/layout] cash sales:", error);
      return [];
    }),
    listVenueWaiterGratuityRows(supabase, venue.id).catch((error) => {
      console.error("[sales/cash/layout] gratuity:", error);
      return [];
    }),
    listVenueCashExpenseLines(supabase, venue.id).catch((error) => {
      console.error("[sales/cash/layout] expense lines:", error);
      return [];
    }),
  ]);

  const userDisplayName = buildExportUserLabel(
    profileResult.data?.full_name,
    profileResult.data?.email ?? user.email,
  );

  const exportRecords = mergeCashJournalSyncedRecords({
    journalRows,
    cashDrawerRows,
    cashSalesRows,
    cashGratuityRows,
  });

  return (
    <div className="mx-auto w-full max-w-none space-y-6">
      <div>
        <ModulePageTitle>Cash</ModulePageTitle>
        <p className="mt-1 text-sm text-black/60">
          Cash journal and expenses — {venue.name}
        </p>
        <hr className="mt-4 border-black/10" />
      </div>

      <CashSubNav
        venueName={venue.name}
        venueLogoUrl={getVenueLogoUrl(venue)}
        userDisplayName={userDisplayName}
        records={exportRecords}
        expenseLines={expenseLines}
      />

      {children}
    </div>
  );
}
