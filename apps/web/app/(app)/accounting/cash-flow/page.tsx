import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import { CashFlowDashboard } from "@/components/accounting/cash-flow-dashboard";
import { getAccountingPageContext } from "@/lib/accounting/page-context";
import { revenueDaysFromSales } from "@/lib/accounting/revenue-from-sales";
import { ACCOUNTING_MODULE_KEY } from "@/lib/accounting/types";
import { canAccessModule } from "@/lib/module-access";
import {
  getVenueSalesTaxSettings,
  listVenueDailySales,
} from "@/lib/sales/daily-sales-store";
import { DEFAULT_TAX_SETTINGS } from "@/lib/sales/daily-sales-types";

export default async function CashFlowPage() {
  const { venue, permissions, supabase } = await getAccountingPageContext();

  if (!canAccessModule(permissions, ACCOUNTING_MODULE_KEY, venue.id)) {
    return <AccessDeniedBounce />;
  }

  let revenueDays: ReturnType<typeof revenueDaysFromSales> = [];
  try {
    const records = await listVenueDailySales(supabase, venue.id);
    let taxSettings: Parameters<typeof revenueDaysFromSales>[1] = {
      ...DEFAULT_TAX_SETTINGS,
    };
    try {
      taxSettings = await getVenueSalesTaxSettings(supabase, venue.id);
    } catch (settingsError) {
      console.error("[accounting/cash-flow] tax settings", settingsError);
    }
    revenueDays = revenueDaysFromSales(records, taxSettings);
  } catch (error) {
    console.error("[accounting/cash-flow] daily sales", error);
  }

  return (
    <div className="mx-auto w-full max-w-none">
      <CashFlowDashboard
        asOf={new Date().toISOString().slice(0, 10)}
        revenueDays={revenueDays}
      />
    </div>
  );
}
