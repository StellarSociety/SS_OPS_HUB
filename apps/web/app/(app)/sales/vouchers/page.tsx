import { ModulePageTitle } from "@/components/layout/module-page-title";
import {
  SalesSchemaSetupNotice,
  getSalesDataLoadErrorMessage,
} from "@/components/sales/sales-schema-setup-notice";
import { VouchersPanel } from "@/components/sales/vouchers-panel";
import { Card } from "@/components/ui/card";
import {
  listVenueDailyTenderTotals,
  type VenueDailyTenderTotal,
} from "@/lib/sales/daily-tender-totals-store";
import { getSalesPageContext } from "@/lib/sales/page-context";
import {
  canAccessVenueDaily,
  canAccessVouchers,
  canAccessWaiterDaily,
  canEditVouchers,
} from "@/lib/sales/permissions";
import { listVenueTenders } from "@/lib/sales/tenders-store";
import { listVenueWaiterDailySales } from "@/lib/sales/waiter-sales-store";
import type { VenueWaiterDailySalesEntry } from "@/lib/sales/waiter-sales-types";
import { buildVoucherTenderTotalsMerged } from "@/lib/sales/vouchers-calculations";
import { listVenueVouchers } from "@/lib/sales/vouchers-store";

export default async function SalesVouchersPage() {
  const { venue, permissions, supabase } = await getSalesPageContext();

  if (!canAccessVouchers(permissions, venue.id)) {
    return (
      <div className="mx-auto max-w-4xl">
        <p className="text-sm text-black/60">
          You do not have access to Vouchers for this venue.
        </p>
      </div>
    );
  }

  try {
    const canReadDailyTenders = canAccessVenueDaily(permissions, venue.id);
    const canReadWaiters = canAccessWaiterDaily(permissions, venue.id);

    const [vouchers, tenders, dailyTenderTotals, waiterEntries] =
      await Promise.all([
        listVenueVouchers(supabase, venue.id),
        listVenueTenders(supabase, venue.id),
        canReadDailyTenders
          ? listVenueDailyTenderTotals(supabase, venue.id)
          : Promise.resolve([] as VenueDailyTenderTotal[]),
        canReadWaiters
          ? listVenueWaiterDailySales(supabase, venue.id)
          : Promise.resolve([] as VenueWaiterDailySalesEntry[]),
      ]);

    const voucherTenderTotals = buildVoucherTenderTotalsMerged(
      tenders,
      dailyTenderTotals,
      waiterEntries,
    );

    return (
      <div className="mx-auto w-full space-y-6 lg:w-2/3">
        <div>
          <ModulePageTitle>Vouchers</ModulePageTitle>
          <p className="mt-1 text-sm text-black/60">
            Allocate daily Voucher Issue / Redeem tenders into detailed voucher
            records — {venue.name}
          </p>
          <hr className="mt-4 border-black/10" />
        </div>

        <VouchersPanel
          venueName={venue.name}
          vouchers={vouchers}
          tenders={tenders}
          tenderTotals={voucherTenderTotals}
          canEdit={canEditVouchers(permissions, venue.id)}
        />
      </div>
    );
  } catch (error) {
    if (getSalesDataLoadErrorMessage(error) === "schema_missing") {
      return <SalesSchemaSetupNotice />;
    }

    console.error("[sales/vouchers]", error);

    return (
      <Card className="p-6">
        <h2 className="font-serif text-xl text-[#3D421F]">
          Could not load vouchers
        </h2>
        <p className="mt-2 text-sm text-black/60">
          Something went wrong loading voucher data. Refresh the page or try
          again in a moment.
        </p>
      </Card>
    );
  }
}
