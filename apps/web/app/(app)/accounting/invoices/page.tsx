import { ApDenied } from "@/components/accounting/invoices-sub-nav";
import { ApInvoicesTable } from "@/components/accounting/ap-invoices-table";
import { getAccountingPageContext } from "@/lib/accounting/page-context";
import { listApInvoices } from "@/lib/accounting/ap-store";
import { canAccessAp, canEditAp } from "@/lib/accounting/permissions";

export default async function ApInvoicesPage() {
  const { supabase, venue, permissions } = await getAccountingPageContext();

  if (!canAccessAp(permissions, venue.id)) {
    return <ApDenied />;
  }

  const invoices = await listApInvoices(supabase, { venueId: venue.id });
  const canEdit = canEditAp(permissions, venue.id);

  return (
    <ApInvoicesTable invoices={invoices} canEdit={canEdit} />
  );
}
