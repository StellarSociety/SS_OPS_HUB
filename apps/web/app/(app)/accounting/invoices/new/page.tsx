import { ApDenied } from "@/components/accounting/invoices-sub-nav";
import { ApInvoiceForm } from "@/components/accounting/ap-invoice-form";
import {
  getApInvoice,
  listPostableExpenseAccounts,
  listSuppliers,
  listTaxCodes,
  listTaxRates,
} from "@/lib/accounting/ap-store";
import { getAccountingPageContext } from "@/lib/accounting/page-context";
import { canAccessAp, canEditAp } from "@/lib/accounting/permissions";
import { listLegalEntities, listVenueEntities } from "@/lib/accounting/store";
import { PURCHASE_TAX_CODES } from "@/lib/accounting/ap-types";

type PageProps = {
  searchParams: Promise<{ id?: string }>;
};

export default async function NewApInvoicePage({ searchParams }: PageProps) {
  const { supabase, venue, permissions } = await getAccountingPageContext();

  if (!canAccessAp(permissions, venue.id)) {
    return <ApDenied />;
  }

  const canEdit = canEditAp(permissions, venue.id);
  const params = await searchParams;
  const editId = params.id?.trim() || undefined;

  const [suppliers, accounts, taxCodesAll, taxRates, venueEntities, legalEntities] =
    await Promise.all([
      listSuppliers(supabase, { venueId: venue.id, activeOnly: false }),
      listPostableExpenseAccounts(supabase),
      listTaxCodes(supabase),
      listTaxRates(supabase),
      listVenueEntities(supabase),
      listLegalEntities(supabase),
    ]);

  const mapping = venueEntities.find((ve) => ve.venue_id === venue.id);
  const entity = mapping
    ? legalEntities.find((e) => e.id === mapping.entity_id) ?? null
    : null;

  const taxCodes = taxCodesAll.filter((t) =>
    (PURCHASE_TAX_CODES as readonly string[]).includes(t.code.toUpperCase()),
  );

  let invoice = null;
  if (editId) {
    invoice = await getApInvoice(supabase, editId);
    if (!invoice || invoice.status !== "draft") {
      invoice = null;
    }
  }

  return (
    <ApInvoiceForm
      suppliers={suppliers.filter((s) => s.active || s.id === invoice?.supplier_id)}
      accounts={accounts}
      taxCodes={taxCodes}
      taxRates={taxRates}
      venue={{ id: venue.id, name: venue.name, slug: venue.slug }}
      entity={
        entity
          ? { id: entity.id, entity_code: entity.entity_code, name: entity.name }
          : null
      }
      canEdit={canEdit}
      invoice={invoice}
    />
  );
}
