"use server";

import { getActionAuthContext } from "@/lib/auth/action-context";
import { getApInvoice } from "@/lib/accounting/ap-store";
import {
  canAccessAp,
  canAdminAp,
  canEditAp,
} from "@/lib/accounting/permissions";
import { createServiceClient } from "@/lib/supabase/service";

/** One AP document with lines and journal, for the details dialog. */
export async function getApInvoiceDetail(id: string) {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { ok: false as const, error: auth.error };
  if (!canAccessAp(auth.permissions, auth.venue.id)) {
    return { ok: false as const, error: "You do not have access to Accounts Payable." };
  }
  const invoice = await getApInvoice(createServiceClient(), id);
  if (!invoice || invoice.venue_id !== auth.venue.id) {
    return { ok: false as const, error: "Document not found." };
  }
  return {
    ok: true as const,
    invoice,
    canEdit: canEditAp(auth.permissions, auth.venue.id),
    canAdmin: canAdminAp(auth.permissions, auth.venue.id),
  };
}
