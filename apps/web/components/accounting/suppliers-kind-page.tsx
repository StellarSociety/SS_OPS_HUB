import { Suspense } from "react";
import { ApDenied } from "@/components/accounting/invoices-sub-nav";
import { ApSuppliersTable } from "@/components/accounting/ap-suppliers-table";
import {
  listPostableExpenseAccounts,
  listSuppliers,
  listTaxCodes,
} from "@/lib/accounting/ap-store";
import { PURCHASE_TAX_CODES, type SupplierKind } from "@/lib/accounting/ap-types";
import { getAccountingPageContext } from "@/lib/accounting/page-context";
import { canAccessAp, canEditAp } from "@/lib/accounting/permissions";

export async function SuppliersKindPage({ kind }: { kind: SupplierKind }) {
  const { supabase, venue, permissions } = await getAccountingPageContext();

  if (!canAccessAp(permissions, venue.id)) {
    return <ApDenied />;
  }

  const [suppliers, accounts, taxCodesAll] = await Promise.all([
    listSuppliers(supabase, { venueId: venue.id, activeOnly: false }),
    listPostableExpenseAccounts(supabase),
    listTaxCodes(supabase),
  ]);

  const taxCodes = taxCodesAll.filter((t) =>
    (PURCHASE_TAX_CODES as readonly string[]).includes(t.code.toUpperCase()),
  );

  return (
    <Suspense fallback={null}>
      <ApSuppliersTable
        kind={kind}
        suppliers={suppliers}
        accounts={accounts}
        taxCodes={taxCodes}
        canEdit={canEditAp(permissions, venue.id)}
      />
    </Suspense>
  );
}
