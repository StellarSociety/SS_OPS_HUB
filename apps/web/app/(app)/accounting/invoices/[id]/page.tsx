import { notFound } from "next/navigation";
import { ApDenied } from "@/components/accounting/invoices-sub-nav";
import { ApInvoiceDetail } from "@/components/accounting/ap-invoice-detail";
import { getApInvoice } from "@/lib/accounting/ap-store";
import { getAccountingPageContext } from "@/lib/accounting/page-context";
import {
  canAccessAp,
  canAdminAp,
  canEditAp,
} from "@/lib/accounting/permissions";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function ApInvoiceDetailPage({ params }: PageProps) {
  const { supabase, venue, permissions } = await getAccountingPageContext();

  if (!canAccessAp(permissions, venue.id)) {
    return <ApDenied />;
  }

  const { id } = await params;
  const invoice = await getApInvoice(supabase, id);
  if (!invoice || invoice.venue_id !== venue.id) {
    notFound();
  }

  return (
    <ApInvoiceDetail
      invoice={invoice}
      canEdit={canEditAp(permissions, venue.id)}
      canAdmin={canAdminAp(permissions, venue.id)}
    />
  );
}
