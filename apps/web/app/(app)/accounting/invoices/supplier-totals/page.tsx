import { ApDenied } from "@/components/accounting/invoices-sub-nav";
import { ApSupplierTotals } from "@/components/accounting/ap-supplier-totals";
import { dubaiTodayIso } from "@/lib/hr/benefits/flight-ticket";
import { getSupplierTotalsData } from "@/lib/accounting/ap-supplier-totals";
import { getAccountingPageContext } from "@/lib/accounting/page-context";
import { canAccessAp, canEditAp } from "@/lib/accounting/permissions";
import { cosFiscalYearForDate } from "@/lib/sales/cos-insights-data";
import { createServiceClient } from "@/lib/supabase/service";

export default async function ApSupplierTotalsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const { venue, permissions } = await getAccountingPageContext();
  if (!canAccessAp(permissions, venue.id)) return <ApDenied />;

  const today = dubaiTodayIso();
  const currentYear = cosFiscalYearForDate(today);
  const fiscalYear = Number((await searchParams).year) || currentYear;
  const data = await getSupplierTotalsData(
    createServiceClient(),
    venue.id,
    fiscalYear,
    today,
  );

  return (
    <ApSupplierTotals
      data={data}
      currentYear={currentYear}
      canEdit={canEditAp(permissions, venue.id)}
    />
  );
}
