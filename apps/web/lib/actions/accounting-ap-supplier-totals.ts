"use server";

import { revalidatePath } from "next/cache";
import { getActionAuthContext } from "@/lib/auth/action-context";
import { canEditAp } from "@/lib/accounting/permissions";
import { createServiceClient } from "@/lib/supabase/service";

/** Save the venue's Suppliers Totals columns (shared by every user). */
export async function saveSupplierTotalsSelection(supplierIds: string[]) {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { ok: false as const, error: auth.error };
  if (!canEditAp(auth.permissions, auth.venue.id)) {
    return { ok: false as const, error: "You do not have permission to change this list." };
  }
  const ids = [...new Set(supplierIds)];
  const { error } = await createServiceClient()
    .from("ap_supplier_totals_settings")
    .upsert({
      venue_id: auth.venue.id,
      supplier_ids: ids,
      updated_by: auth.user.id,
      updated_at: new Date().toISOString(),
    });
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/accounting/invoices/supplier-totals", "page");
  return { ok: true as const };
}
