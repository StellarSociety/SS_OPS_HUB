import { notFound } from "next/navigation";
import { AccessDeniedBounce } from "@/components/access-denied-bounce";
import { CosCentreHeader } from "@/components/sales/cos/cos-centre-header";
import {
  CosSalesDiscountsTable,
  type CosSalesScope,
} from "@/components/sales/cos/cos-sales-discounts-table";
import { Card } from "@/components/ui/card";
import { dubaiTodayIso } from "@/lib/hr/benefits/flight-ticket";
import {
  monthIndexForWeek,
  weeksInMonth,
} from "@/lib/sales/cos-calculations";
import { cosWeekForDate, cosWeekRange } from "@/lib/sales/cos-overview-data";
import { canViewCos, getCosPageContext } from "@/lib/sales/cos-page-context";
import { getCosDailySales } from "@/lib/sales/cos-sales-data";
import { COST_CENTRES, type CostCentre } from "@/lib/sales/cos-types";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function CosSalesDiscountsPage({
  params,
  searchParams,
}: {
  params: Promise<{ centre: string }>;
  searchParams: Promise<{
    scope?: string;
    year?: string;
    week?: string;
    month?: string;
    from?: string;
    to?: string;
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
  const currentWeek = cosWeekForDate(fiscalYear, today);
  const weekNo = Math.min(52, Math.max(1, Number(sp.week) || currentWeek));
  const monthIndex =
    sp.month != null && sp.month !== ""
      ? Math.min(11, Math.max(0, Number(sp.month)))
      : monthIndexForWeek(weekNo);
  const scope: CosSalesScope =
    sp.scope === "month" || sp.scope === "range" ? sp.scope : "week";

  let from: string;
  let to: string;
  if (scope === "month") {
    const weeks = weeksInMonth(monthIndex);
    from = cosWeekRange(fiscalYear, weeks[0]).start;
    to = cosWeekRange(fiscalYear, weeks[weeks.length - 1]).end;
  } else if (
    scope === "range" &&
    sp.from &&
    sp.to &&
    ISO_DATE.test(sp.from) &&
    ISO_DATE.test(sp.to) &&
    sp.from <= sp.to
  ) {
    from = sp.from;
    to = sp.to;
  } else {
    ({ start: from, end: to } = cosWeekRange(fiscalYear, weekNo));
  }

  const weeks = Array.from({ length: 52 }, (_, i) => {
    const r = cosWeekRange(fiscalYear, i + 1);
    return { weekNo: i + 1, start: r.start, end: r.end };
  });

  let result: Awaited<ReturnType<typeof getCosDailySales>> | null = null;
  try {
    result = await getCosDailySales(supabase, venue.id, costCentre, from, to);
  } catch (error) {
    console.error("[gp-cos/sales]", error);
  }

  return (
    <div className="mx-auto w-full max-w-none space-y-6">
      <CosCentreHeader
        centre={costCentre}
        section="sales"
        subtitle={<>Daily net sales &amp; discounts from Revenue — {venue.name}</>}
      />
      {result ? (
        <CosSalesDiscountsTable
          key={`${scope}:${from}:${to}`}
          centre={costCentre}
          scope={scope}
          fiscalYear={fiscalYear}
          weekNo={weekNo}
          monthIndex={monthIndex}
          from={from}
          to={to}
          today={today}
          weeks={weeks}
          rows={result.rows}
          totalTaxPct={result.totalTaxPct}
        />
      ) : (
        <Card className="p-6">
          <h2 className="font-serif text-xl text-[#3D421F]">
            Could not load daily sales
          </h2>
          <p className="mt-2 text-sm text-black/60">
            Check you have access to Revenue daily sales, then refresh.
          </p>
        </Card>
      )}
    </div>
  );
}
