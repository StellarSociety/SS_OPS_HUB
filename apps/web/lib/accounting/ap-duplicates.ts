import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApDocumentType, ApInvoiceStatus } from "@/lib/accounting/ap-types";

/** A document that shares a supplier reference with another one. */
export type ApDuplicateDoc = {
  id: string;
  invoice_no: string;
  document_type: ApDocumentType;
  supplier_id: string;
  supplier_name: string;
  supplier_invoice_no: string | null;
  delivery_note_no: string | null;
  invoice_date: string;
  status: ApInvoiceStatus;
  subtotal_net: number;
  total_gross: number;
  memo: string | null;
  created_at: string;
};

export type ApDuplicateGroup = {
  key: string;
  /** What repeats: the supplier's invoice / credit note number, or the delivery note number. */
  field: "invoice_no" | "credit_note_no" | "delivery_note_no";
  number: string;
  supplierName: string;
  docs: ApDuplicateDoc[];
};

const SELECT =
  "id, invoice_no, document_type, supplier_id, supplier_invoice_no, delivery_note_no, invoice_date, status, subtotal_net, total_gross, memo, created_at, suppliers ( name )";

/** Compare references ignoring case and spacing ("CI- 123" = "ci-123"). */
export function normalizeDocNumber(value: string | null | undefined): string {
  return String(value ?? "").toLowerCase().replace(/\s+/g, "");
}

type Row = Omit<ApDuplicateDoc, "supplier_name"> & {
  suppliers: { name: string } | null;
};

function toDoc(r: Row): ApDuplicateDoc {
  const { suppliers, ...rest } = r;
  return {
    ...rest,
    subtotal_net: Number(rest.subtotal_net),
    total_gross: Number(rest.total_gross),
    supplier_name: suppliers?.name ?? "—",
  };
}

/**
 * Reference keys a document can collide on. Invoices and delivery notes share
 * the supplier invoice number space (a delivery note becomes the invoice once
 * its number arrives); credit notes have their own.
 */
function keysFor(d: ApDuplicateDoc): { key: string; field: ApDuplicateGroup["field"]; number: string }[] {
  const out: { key: string; field: ApDuplicateGroup["field"]; number: string }[] = [];
  const inv = normalizeDocNumber(d.supplier_invoice_no);
  if (inv) {
    const field = d.document_type === "credit_note" ? "credit_note_no" : "invoice_no";
    out.push({ key: `${d.supplier_id}|${field}|${inv}`, field, number: d.supplier_invoice_no!.trim() });
  }
  const dn = normalizeDocNumber(d.delivery_note_no);
  if (dn) {
    out.push({ key: `${d.supplier_id}|delivery_note_no|${dn}`, field: "delivery_note_no", number: d.delivery_note_no!.trim() });
  }
  return out;
}

/** All non-void AP documents for a venue, paged past the 1,000-row API cap. */
async function listVenueDocs(client: SupabaseClient, venueId: string): Promise<ApDuplicateDoc[]> {
  const docs: ApDuplicateDoc[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await client
      .from("ap_invoices")
      .select(SELECT)
      .eq("venue_id", venueId)
      .neq("status", "void")
      .order("invoice_date", { ascending: false })
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    docs.push(...((data ?? []) as unknown as Row[]).map(toDoc));
    if (!data || data.length < 1000) break;
  }
  return docs;
}

/** Groups of documents that share a supplier reference (Expenses → Alerts). */
export async function listApDuplicateGroups(
  client: SupabaseClient,
  venueId: string,
): Promise<ApDuplicateGroup[]> {
  const docs = await listVenueDocs(client, venueId);
  const groups = new Map<string, ApDuplicateGroup>();
  for (const d of docs) {
    for (const k of keysFor(d)) {
      const g = groups.get(k.key) ?? {
        key: k.key,
        field: k.field,
        number: k.number,
        supplierName: d.supplier_name,
        docs: [],
      };
      g.docs.push(d);
      groups.set(k.key, g);
    }
  }
  return [...groups.values()]
    .filter((g) => g.docs.length > 1)
    .sort(
      (a, b) =>
        b.docs[0].invoice_date.localeCompare(a.docs[0].invoice_date) ||
        a.supplierName.localeCompare(b.supplierName),
    );
}

/** Existing documents a new/edited document's references would duplicate. */
export async function findApDuplicateDocs(
  client: SupabaseClient,
  params: {
    entityId: string;
    supplierId: string;
    documentType: ApDocumentType;
    supplierInvoiceNo?: string | null;
    deliveryNoteNo?: string | null;
    excludeId?: string;
  },
): Promise<ApDuplicateDoc[]> {
  const probe: ApDuplicateDoc = {
    id: params.excludeId ?? "",
    invoice_no: "",
    document_type: params.documentType,
    supplier_id: params.supplierId,
    supplier_name: "",
    supplier_invoice_no: params.supplierInvoiceNo?.trim() || null,
    delivery_note_no: params.deliveryNoteNo?.trim() || null,
    invoice_date: "",
    status: "draft",
    subtotal_net: 0,
    total_gross: 0,
    memo: null,
    created_at: "",
  };
  const wanted = new Set(keysFor(probe).map((k) => k.key));
  if (wanted.size === 0) return [];

  const { data, error } = await client
    .from("ap_invoices")
    .select(SELECT)
    .eq("entity_id", params.entityId)
    .eq("supplier_id", params.supplierId)
    .neq("status", "void");
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Row[])
    .map(toDoc)
    .filter((d) => d.id !== params.excludeId)
    .filter((d) => keysFor(d).some((k) => wanted.has(k.key)))
    .sort((a, b) => b.invoice_date.localeCompare(a.invoice_date));
}
