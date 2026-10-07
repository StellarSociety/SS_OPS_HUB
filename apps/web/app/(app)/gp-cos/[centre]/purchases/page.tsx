import { notFound } from "next/navigation";
import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import { CosCentreHeader } from "@/components/sales/cos/cos-centre-header";
import {
  CosPurchasesTable,
  type CosPurchasesScope,
} from "@/components/sales/cos/cos-purchases-table";
import { Card } from "@/components/ui/card";
import { dubaiTodayIso } from "@/lib/hr/benefits/flight-ticket";
import {
  monthIndexForWeek,
  weeksInMonth,
} from "@/lib/sales/cos-calculations";
import { cosWeekForDate, cosWeekRange } from "@/lib/sales/cos-overview-data";
import { canViewCos, getCosPageContext } from "@/lib/sales/cos-page-context";
import { getCosLedgerPurchases } from "@/lib/sales/cos-purchases-data";
import { getVenueCosSettings } from "@/lib/sales/cos-store";
import { COST_CENTRES, type CostCentre } from "@/lib/sales/cos-types";

export default async function CosPurchasesPage({
  params,
  searchParams,
}: {
  params: Promise<{ centre: string }>;
  searchParams: Promise<{
    scope?: string;
    year?: string;
    week?: string;
    month?: string;
  }>;
}) {
  const { centre } = await params;
  if (!(COST_CENTRES as readonly string[]).includes(centre)) notFound();
  const costCentre = centre as CostCentre;

  const { venue, permissions, supabase } = await getCosPageContext();
  if (!canViewCos(permissions, venue.id)) return <AccessDeniedBounce />;

  const sp = await searchParams;
  const today = dubaiTodayIso();
  const fiscalYear = Number(sp.year) || Number(today.slice(0, 4));
  const weekNo = Math.min(
    52,
    Math.max(1, Number(sp.week) || cosWeekForDate(fiscalYear, today)),
  );
  const monthIndex =
    sp.month != null && sp.month !== ""
      ? Math.min(11, Math.max(0, Number(sp.month)))
      : monthIndexForWeek(weekNo);
  const scope: CosPurchasesScope = sp.scope === "month" ? "month" : "week";

  let from: string;
  let to: string;
  if (scope === "month") {
    const weeks = weeksInMonth(monthIndex);
    from = cosWeekRange(fiscalYear, weeks[0]).start;
    to = cosWeekRange(fiscalYear, weeks[weeks.length - 1]).end;
  } else {
    ({ start: from, end: to } = cosWeekRange(fiscalYear, weekNo));
  }

  const weeks = Array.from({ length: 52 }, (_, i) => ({
    weekNo: i + 1,
    ...cosWeekRange(fiscalYear, i + 1),
  }));

  let ledgerIds: string[] = [];
  let rows: Awaited<ReturnType<typeof getCosLedgerPurchases>> | null = null;
  try {
    const settings = await getVenueCosSettings(supabase, venue.id, costCentre);
    ledgerIds = settings?.ledger_account_ids ?? [];
    rows = await getCosLedgerPurchases(venue.id, ledgerIds, from, to);
  } catch (error) {
    console.error("[gp-cos/purchases]", error);
  }

  return (
    <div className="mx-auto w-full max-w-none space-y-6">
      <CosCentreHeader
        centre={costCentre}
        section="purchases"
        subtitle={<>Supplier invoices from Accounts — {venue.name}</>}
      />
      {rows ? (
        <CosPurchasesTable
          centre={costCentre}
          scope={scope}
          fiscalYear={fiscalYear}
          weekNo={weekNo}
          monthIndex={monthIndex}
          from={from}
          to={to}
          weeks={weeks}
          rows={rows}
          ledgerCount={ledgerIds.length}
        />
      ) : (
        <Card className="p-6">
          <h2 className="font-serif text-xl text-[#3D421F]">
            Could not load purchases
          </h2>
          <p className="mt-2 text-sm text-black/60">
            Refresh the page or try again in a moment.
          </p>
        </Card>
      )}
    </div>
  );
}
