import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApInvoice, ApInvoiceStatus, Supplier, TaxCode, TaxRate } from "./ap-types";
import type { Account } from "./types";

export async function listTaxCodes(client: SupabaseClient): Promise<TaxCode[]> {
  const { data, error } = await client
    .from("tax_codes")
    .select("*")
    .eq("active", true)
    .order("code");
  if (error) throw new Error(error.message);
  return (data ?? []) as TaxCode[];
}

export async function listTaxRates(client: SupabaseClient): Promise<TaxRate[]> {
  const { data, error } = await client.from("tax_rates").select("*");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    ...r,
    rate: Number(r.rate),
  })) as TaxRate[];
}

export async function listSuppliers(
  client: SupabaseClient,
  opts?: { venueId?: string; entityId?: string; activeOnly?: boolean },
): Promise<Supplier[]> {
  let query = client.from("suppliers").select("*").order("name");
  if (opts?.venueId) query = query.eq("venue_id", opts.venueId);
  if (opts?.entityId) query = query.eq("entity_id", opts.entityId);
  if (opts?.activeOnly !== false) query = query.eq("active", true);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as Supplier[];
}

export async function listPostableExpenseAccounts(
  client: SupabaseClient,
): Promise<Account[]> {
  const { data, error } = await client
    .from("accounts")
    .select("*")
    .eq("active", true)
    .eq("is_postable", true)
    .in("account_type", ["expense", "cost_of_sales", "asset"])
    .order("code");
  if (error) throw new Error(error.message);
  return (data ?? []) as Account[];
}

export async function listApInvoices(
  client: SupabaseClient,
  opts: {
    venueId?: string;
    status?: ApInvoiceStatus | ApInvoiceStatus[];
    supplierId?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
  } = {},
): Promise<ApInvoice[]> {
  let query = client
    .from("ap_invoices")
    .select(
      `
      *,
      suppliers ( id, name, trn, payment_terms_days ),
      venues ( id, name, slug ),
      legal_entities ( id, entity_code, name )
    `,
    )
    .order("invoice_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (opts.venueId) query = query.eq("venue_id", opts.venueId);
  if (opts.supplierId) query = query.eq("supplier_id", opts.supplierId);
  if (opts.status) {
    if (Array.isArray(opts.status)) {
      query = query.in("status", opts.status);
    } else {
      query = query.eq("status", opts.status);
    }
  }
  if (opts.dateFrom) query = query.gte("invoice_date", opts.dateFrom);
  if (opts.dateTo) query = query.lte("invoice_date", opts.dateTo);
  if (opts.search?.trim()) {
    const q = opts.search.trim();
    query = query.or(
      `invoice_no.ilike.%${q}%,supplier_invoice_no.ilike.%${q}%,memo.ilike.%${q}%`,
    );
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map(normalizeInvoice) as ApInvoice[];
}

export async function getApInvoice(
  client: SupabaseClient,
  id: string,
): Promise<ApInvoice | null> {
  const { data, error } = await client
    .from("ap_invoices")
    .select(
      `
      *,
      suppliers ( id, name, trn, payment_terms_days ),
      venues ( id, name, slug ),
      legal_entities ( id, entity_code, name ),
      ap_invoice_lines (
        *,
        accounts ( id, code, name ),
        tax_codes ( id, code, label )
      ),
      journal_entries ( id, entry_no, status, entry_date )
    `,
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  const inv = normalizeInvoice(data) as ApInvoice;
  if (inv.ap_invoice_lines) {
    inv.ap_invoice_lines = [...inv.ap_invoice_lines].sort(
      (a, b) => a.line_no - b.line_no,
    );
  }
  return inv;
}

export async function getSystemDefaultAccountIds(
  client: SupabaseClient,
): Promise<Record<string, string>> {
  const { data, error } = await client
    .from("system_default_accounts")
    .select("key, account_id");
  if (error) throw new Error(error.message);
  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    map[row.key as string] = row.account_id as string;
  }
  return map;
}

export async function getVenueEntity(
  client: SupabaseClient,
  venueId: string,
): Promise<{ entity_id: string; emirate_of_supply: string } | null> {
  const { data, error } = await client
    .from("venue_entities")
    .select("entity_id, emirate_of_supply")
    .eq("venue_id", venueId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function getUserApApprovalLimit(
  client: SupabaseClient,
  userId: string,
  venueId: string,
): Promise<number | null> {
  const { data } = await client
    .from("accounting_approval_limits")
    .select("max_amount")
    .eq("user_id", userId)
    .eq("feature_key", "ap")
    .or(`venue_id.eq.${venueId},venue_id.is.null`)
    .order("venue_id", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return data.max_amount == null ? Number.POSITIVE_INFINITY : Number(data.max_amount);
}

function normalizeInvoice(row: Record<string, unknown>): Record<string, unknown> {
  return {
    ...row,
    fx_rate: Number(row.fx_rate ?? 1),
    subtotal_net: Number(row.subtotal_net ?? 0),
    tax_total: Number(row.tax_total ?? 0),
    total_gross: Number(row.total_gross ?? 0),
    ap_invoice_lines: Array.isArray(row.ap_invoice_lines)
      ? row.ap_invoice_lines.map((l: Record<string, unknown>) => ({
          ...l,
          quantity: Number(l.quantity ?? 0),
          unit_price: Number(l.unit_price ?? 0),
          net_amount: Number(l.net_amount ?? 0),
          tax_amount: Number(l.tax_amount ?? 0),
          gross_amount: Number(l.gross_amount ?? 0),
          dimensions: (l.dimensions ?? {}) as Record<string, string>,
        }))
      : row.ap_invoice_lines,
  };
}

export function needsActionStatuses(): ApInvoiceStatus[] {
  return ["draft", "submitted", "approved"];
}
