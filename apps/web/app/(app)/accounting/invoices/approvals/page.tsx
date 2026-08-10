import { ApDenied } from "@/components/accounting/invoices-sub-nav";
import { ApApprovalsClient } from "@/components/accounting/ap-approvals-client";
import { listApInvoices } from "@/lib/accounting/ap-store";
import { getAccountingPageContext } from "@/lib/accounting/page-context";
import { canAccessAp, canEditAp } from "@/lib/accounting/permissions";

export default async function ApApprovalsPage() {
  const { supabase, venue, permissions } = await getAccountingPageContext();

  if (!canAccessAp(permissions, venue.id)) {
    return <ApDenied />;
  }

  const invoices = await listApInvoices(supabase, {
    venueId: venue.id,
    status: "submitted",
  });

  return (
    <ApApprovalsClient
      invoices={invoices}
      canEdit={canEditAp(permissions, venue.id)}
    />
  );
}
