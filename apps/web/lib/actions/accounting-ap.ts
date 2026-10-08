"use server";

import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { getActionAuthContext } from "@/lib/auth/action-context";
import {
  buildApJournalLines,
  flipJournalLines,
  type ApApprovalContext,
} from "@/lib/accounting/posting-ap";
import { postJournal, reverseJournal } from "@/lib/accounting/posting";
import {
  getSystemDefaultAccountIds,
  getUserApApprovalLimit,
  getVenueEntity,
  listTaxCodes,
  listTaxRates,
} from "@/lib/accounting/ap-store";
import {
  isSupplierKind,
  type ApDocumentType,
  type ApInvoiceLineInput,
} from "@/lib/accounting/ap-types";
import {
  canAccessAp,
  canAdminAp,
  canEditAp,
  getApAccessLevel,
} from "@/lib/accounting/permissions";
import { addDaysIso, roundMoney } from "@/lib/accounting/money";
import {
  computePurchaseLineTax,
  resolveTaxRate,
} from "@/lib/accounting/tax";
import {
  findApDuplicateDocs,
  type ApDuplicateDoc,
} from "@/lib/accounting/ap-duplicates";
import { isAppAdmin } from "@/lib/role-permissions";
import { convertImageToWebp } from "@/lib/storage/convert-to-webp";
import { createServiceClient } from "@/lib/supabase/service";

const ATTACHMENT_BUCKET = "ap-invoice-attachments";

function fail(message: string) {
  return { ok: false as const, error: message };
}

function revalidateAp(invoiceId?: string) {
  revalidatePath("/accounting/invoices", "page");
  revalidatePath("/accounting/invoices/insights", "page");
  revalidatePath("/accounting/invoices/suppliers", "page");
  revalidatePath("/accounting/invoices/suppliers/general", "page");
  revalidatePath("/accounting/invoices/suppliers/opex", "page");
  revalidatePath("/accounting/invoices/new", "page");
  if (invoiceId) {
    revalidatePath(`/accounting/invoices/${invoiceId}`, "page");
  }
}

type ApCtx = {
  userId: string;
  venueId: string;
  permissions: import("@/lib/role-permissions").UserPermission[];
  service: ReturnType<typeof createServiceClient>;
};

async function requireApAccess(min: "view" | "edit" = "view"): Promise<
  | { error: string }
  | {
      userId: string;
      venueId: string;
      permissions: import("@/lib/role-permissions").UserPermission[];
      service: ReturnType<typeof createServiceClient>;
    }
> {
  const auth = await getActionAuthContext();
  if ("error" in auth) return { error: auth.error };

  if (min === "view") {
    if (!canAccessAp(auth.permissions, auth.venue.id)) {
      return { error: "You do not have access to Accounts Payable." };
    }
  } else if (!canEditAp(auth.permissions, auth.venue.id)) {
    return { error: "You do not have permission to edit AP invoices." };
  }

  return {
    userId: auth.user.id,
    venueId: auth.venue.id,
    permissions: auth.permissions,
    service: createServiceClient(),
  };
}

async function buildApprovalCtx(
  service: ReturnType<typeof createServiceClient>,
  permissions: Parameters<typeof getApAccessLevel>[0],
  userId: string,
  venueId: string,
): Promise<ApApprovalContext> {
  const accessLevel = getApAccessLevel(permissions, venueId);
  const limit = await getUserApApprovalLimit(service, userId, venueId);
  return {
    isAppAdmin: isAppAdmin(permissions),
    accessLevel,
    approvalLimit: limit,
  };
}

async function nextApInvoiceNo(
  service: ReturnType<typeof createServiceClient>,
  entityId: string,
  invoiceDate: string,
): Promise<string> {
  const { data: seq, error } = await service
    .from("sequences")
    .select("*")
    .eq("entity_id", entityId)
    .eq("doc_type", "AP")
    .single();

  if (error || !seq) throw new Error("AP sequence not configured for entity");

  const year = invoiceDate.slice(0, 4);
  let nextValue = Number(seq.current_value) + 1;
  let lastReset = seq.last_reset_period as string | null;
  if (seq.reset_rule === "yearly" && lastReset !== year) {
    nextValue = 1;
    lastReset = year;
  }

  const { error: updErr } = await service
    .from("sequences")
    .update({
      current_value: nextValue,
      last_reset_period: lastReset,
      updated_at: new Date().toISOString(),
    })
    .eq("id", seq.id)
    .eq("current_value", seq.current_value);

  if (updErr) throw new Error(updErr.message);

  const padded = String(nextValue).padStart(Number(seq.padding) || 6, "0");
  return `${seq.prefix}${year}-${padded}`;
}

function computeLineAmounts(
  line: ApInvoiceLineInput,
  taxCodes: Awaited<ReturnType<typeof listTaxCodes>>,
  taxRates: Awaited<ReturnType<typeof listTaxRates>>,
  invoiceDate: string,
) {
  const taxCode = taxCodes.find((t) => t.id === line.taxCodeId);
  if (!taxCode) throw new Error("Invalid tax code on line");
  const rate = resolveTaxRate(taxRates, taxCode.id, invoiceDate);
  const qty = roundMoney(line.quantity);
  const unit = roundMoney(line.unitPrice);
  const net =
    line.netAmount > 0 ? roundMoney(line.netAmount) : roundMoney(qty * unit);
  const computed = computePurchaseLineTax({ netAmount: net, taxCode, rate });
  return { ...computed, quantity: qty, unitPrice: unit, taxCode };
}

// ---------------------------------------------------------------------------
// Suppliers
// ---------------------------------------------------------------------------

export async function upsertSupplier(input: {
  id?: string;
  name: string;
  nickname?: string | null;
  kind?: "cos" | "opex_general" | "opex" | "uncategorized";
  trn?: string | null;
  defaultExpenseAccountId?: string | null;
  paymentTermsDays?: number;
  defaultTaxCodeId?: string | null;
  active?: boolean;
  notes?: string | null;
}) {
  const ctx = await requireApAccess("edit");
  if ("error" in ctx) return fail(ctx.error);

  const name = input.name.trim();
  if (!name) return fail("Supplier name is required.");
  const kind = input.kind && isSupplierKind(input.kind) ? input.kind : "cos";

  const trn = input.trn?.trim() || null;
  if (trn && !/^\d{15}$/.test(trn)) {
    return fail("TRN must be exactly 15 digits.");
  }

  const mapping = await getVenueEntity(ctx.service, ctx.venueId);
  if (!mapping) {
    return fail("This venue is not mapped to a legal entity. Configure Accounting Settings.");
  }

  let defaultTaxCodeId = input.defaultTaxCodeId || null;
  if (!defaultTaxCodeId) {
    const { data: standardPurchase } = await ctx.service
      .from("tax_codes")
      .select("id")
      .eq("code", "SP")
      .maybeSingle();
    defaultTaxCodeId = standardPurchase?.id ?? null;
  }

  const payload = {
    entity_id: mapping.entity_id,
    venue_id: ctx.venueId,
    name,
    nickname: input.nickname?.trim() || null,
    kind,
    trn,
    default_expense_account_id: input.defaultExpenseAccountId || null,
    payment_terms_days: input.paymentTermsDays ?? 30,
    default_tax_code_id: defaultTaxCodeId,
    active: input.active ?? true,
    notes: input.notes?.trim() || null,
    updated_at: new Date().toISOString(),
  };

  let before: Record<string, unknown> | null = null;
  if (input.id) {
    const { data } = await ctx.service
      .from("suppliers")
      .select("*")
      .eq("id", input.id)
      .maybeSingle();
    before = data;
  }

  const query = input.id
    ? ctx.service
        .from("suppliers")
        .update(payload)
        .eq("id", input.id)
        .select("*")
        .single()
    : ctx.service
        .from("suppliers")
        .insert({ ...payload, created_by: ctx.userId })
        .select("*")
        .single();

  const { data, error } = await query;
  if (error) return fail(error.message);

  await writeAuditLog({
    actor_id: ctx.userId,
    action: input.id ? "update" : "create",
    module_key: "accounting",
    entity: "suppliers",
    entity_id: data.id,
    venue_id: ctx.venueId,
    before,
    after: data,
  });

  revalidateAp();
  return { ok: true as const, supplier: data };
}

export async function checkSupplierInvoiceDuplicate(input: {
  supplierId: string;
  supplierInvoiceNo: string;
  deliveryNoteNo?: string;
  documentType?: ApDocumentType;
  excludeId?: string;
}) {
  const ctx = await requireApAccess("view");
  if ("error" in ctx) return fail(ctx.error);
  if (!input.supplierId) {
    return { ok: true as const, duplicate: false, matches: [] as ApDuplicateDoc[] };
  }

  const mapping = await getVenueEntity(ctx.service, ctx.venueId);
  if (!mapping) {
    return { ok: true as const, duplicate: false, matches: [] as ApDuplicateDoc[] };
  }

  const matches = await findApDuplicateDocs(ctx.service, {
    entityId: mapping.entity_id,
    supplierId: input.supplierId,
    documentType: input.documentType ?? "invoice",
    supplierInvoiceNo: input.supplierInvoiceNo,
    deliveryNoteNo: input.deliveryNoteNo,
    excludeId: input.excludeId,
  });
  return { ok: true as const, duplicate: matches.length > 0, matches };
}

// ---------------------------------------------------------------------------
// Attachment
// ---------------------------------------------------------------------------

async function uploadAttachment(
  service: ReturnType<typeof createServiceClient>,
  file: File,
  invoiceId: string,
): Promise<string> {
  const bytes = Buffer.from(await file.arrayBuffer());
  const isPdf =
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf");

  let buffer: Buffer;
  let contentType: string;
  let extension: string;

  if (isPdf) {
    buffer = bytes;
    contentType = "application/pdf";
    extension = "pdf";
  } else {
    const webp = await convertImageToWebp(bytes);
    buffer = webp.buffer;
    contentType = webp.contentType;
    extension = webp.extension;
  }

  const path = `${invoiceId}/bill.${extension}`;
  const { error } = await service.storage
    .from(ATTACHMENT_BUCKET)
    .upload(path, buffer, { contentType, upsert: true });

  if (error) throw new Error(error.message);

  // Remove stale sibling extensions
  const siblings = ["pdf", "webp", "jpg", "jpeg", "png", "gif"];
  for (const ext of siblings) {
    if (ext === extension) continue;
    await service.storage
      .from(ATTACHMENT_BUCKET)
      .remove([`${invoiceId}/bill.${ext}`]);
  }

  const { data } = service.storage.from(ATTACHMENT_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// ---------------------------------------------------------------------------
// Save / update invoice
// ---------------------------------------------------------------------------

/** FormData wrapper so File attachments work reliably via server actions. */
export async function saveApInvoiceForm(formData: FormData) {
  const linesRaw = String(formData.get("lines") ?? "[]");
  let lines: ApInvoiceLineInput[] = [];
  try {
    lines = JSON.parse(linesRaw) as ApInvoiceLineInput[];
  } catch {
    return fail("Invalid line items.");
  }

  const attachment = formData.get("attachment");
  const id = String(formData.get("id") ?? "").trim() || undefined;
  const fxRaw = String(formData.get("fxRate") ?? "").trim();

  const docType = String(formData.get("documentType") ?? "invoice");
  return saveApInvoice({
    id,
    documentType: (["invoice", "delivery_note", "credit_note"] as const).includes(
      docType as ApDocumentType,
    )
      ? (docType as ApDocumentType)
      : "invoice",
    supplierId: String(formData.get("supplierId") ?? ""),
    supplierInvoiceNo: String(formData.get("supplierInvoiceNo") ?? ""),
    deliveryNoteNo: String(formData.get("deliveryNoteNo") ?? ""),
    invoiceDate: String(formData.get("invoiceDate") ?? ""),
    dueDate: String(formData.get("dueDate") ?? "") || undefined,
    currency: String(formData.get("currency") ?? "AED") || "AED",
    fxRate: fxRaw ? Number(fxRaw) : undefined,
    memo: String(formData.get("memo") ?? "") || undefined,
    lines,
    attachment: attachment instanceof File && attachment.size > 0 ? attachment : null,
    allowDuplicate: formData.get("allowDuplicate") === "1",
  });
}

export async function saveApInvoice(input: {
  id?: string;
  documentType?: ApDocumentType;
  supplierId: string;
  supplierInvoiceNo: string;
  deliveryNoteNo?: string;
  invoiceDate: string;
  dueDate?: string;
  currency?: string;
  fxRate?: number;
  memo?: string;
  lines: ApInvoiceLineInput[];
  attachment?: File | null;
  /** The user saw the duplicate warning and chose to keep both. */
  allowDuplicate?: boolean;
}) {
  const ctx = await requireApAccess("edit");
  if ("error" in ctx) return fail(ctx.error);

  const mapping = await getVenueEntity(ctx.service, ctx.venueId);
  if (!mapping) {
    return fail("This venue is not mapped to a legal entity.");
  }

  const isDeliveryNote = input.documentType === "delivery_note";
  const supplierInvoiceNo = input.supplierInvoiceNo.trim();
  const deliveryNoteNo = isDeliveryNote
    ? (input.deliveryNoteNo ?? "").trim()
    : "";

  if (!input.supplierId) return fail("Supplier is required.");
  if (isDeliveryNote && !deliveryNoteNo) {
    return fail("Delivery note number is required.");
  }
  // Delivery notes may be saved before the invoice number arrives.
  if (!supplierInvoiceNo && !isDeliveryNote) {
    return fail("Invoice number is required.");
  }
  if (!input.invoiceDate) return fail("Invoice date is required.");

  // Ignore untouched blank rows; every remaining line must be complete.
  const filledLines = input.lines.filter(
    (l) => l.accountId || l.description.trim() || l.netAmount > 0 || l.unitPrice > 0,
  );
  if (!filledLines.length) return fail("Add at least one line.");
  for (const [idx, l] of filledLines.entries()) {
    if (!l.accountId) return fail(`Line ${idx + 1}: choose an account.`);
    if (!l.taxCodeId) return fail(`Line ${idx + 1}: choose a tax code.`);
    if (!(l.netAmount > 0 || l.quantity * l.unitPrice > 0)) {
      return fail(`Line ${idx + 1}: enter an amount.`);
    }
  }

  const { data: supplier } = await ctx.service
    .from("suppliers")
    .select("*")
    .eq("id", input.supplierId)
    .single();
  if (!supplier) return fail("Supplier not found.");

  const documentType = input.documentType ?? "invoice";
  // Credit notes are stored with negative amounts.
  const sign = documentType === "credit_note" ? -1 : 1;

  if (!input.allowDuplicate) {
    const matches = await findApDuplicateDocs(ctx.service, {
      entityId: mapping.entity_id,
      supplierId: input.supplierId,
      documentType,
      supplierInvoiceNo,
      deliveryNoteNo,
      excludeId: input.id,
    });
    if (matches.length) {
      return {
        ok: false as const,
        error: "This document number already exists.",
        duplicates: matches,
      };
    }
  }

  const taxCodes = await listTaxCodes(ctx.service);
  const taxRates = await listTaxRates(ctx.service);

  let subtotalNet = 0;
  let taxTotal = 0;
  let totalGross = 0;
  const lineRows = filledLines.map((line, idx) => {
    const computed = computeLineAmounts(
      line,
      taxCodes,
      taxRates,
      input.invoiceDate,
    );
    const net = roundMoney(sign * computed.netAmount);
    const tax = roundMoney(sign * computed.taxAmount);
    const gross = roundMoney(sign * computed.grossAmount);
    subtotalNet = roundMoney(subtotalNet + net);
    taxTotal = roundMoney(taxTotal + tax);
    totalGross = roundMoney(totalGross + gross);
    return {
      line_no: idx + 1,
      description: line.description.trim() || `Line ${idx + 1}`,
      account_id: line.accountId,
      quantity: computed.quantity,
      unit_price: computed.unitPrice,
      net_amount: net,
      tax_code_id: line.taxCodeId,
      tax_amount: tax,
      gross_amount: gross,
      dimensions: line.dimensions ?? {},
    };
  });

  const dueDate =
    input.dueDate ||
    addDaysIso(input.invoiceDate, Number(supplier.payment_terms_days) || 30);

  const currency = (input.currency || "AED").toUpperCase();
  const fxRate = currency === "AED" ? 1 : roundMoney(input.fxRate ?? 0, 8);
  if (currency !== "AED" && !(fxRate > 0)) {
    return fail("FX rate is required for non-AED invoices.");
  }

  let invoiceId = input.id ?? null;
  let before: Record<string, unknown> | null = null;
  let invoiceNo: string;

  if (invoiceId) {
    const { data: existing } = await ctx.service
      .from("ap_invoices")
      .select("*")
      .eq("id", invoiceId)
      .single();
    if (!existing) return fail("Invoice not found.");
    if (existing.status === "void" || existing.status === "reversed") {
      return fail(`A ${existing.status} document can't be edited.`);
    }
    if (existing.status === "posted") {
      // Edits to a posted document: reverse its journal, reopen, re-post below.
      const reopened = await reopenPostedApDocument(ctx, existing);
      if (!reopened.ok) return reopened;
    }
    before = existing;
    invoiceNo = existing.invoice_no;

    const { error: updErr } = await ctx.service
      .from("ap_invoices")
      .update({
        document_type: documentType,
        supplier_id: input.supplierId,
        supplier_invoice_no: supplierInvoiceNo || null,
        delivery_note_no: deliveryNoteNo || null,
        invoice_date: input.invoiceDate,
        due_date: dueDate,
        currency,
        fx_rate: fxRate,
        memo: input.memo?.trim() || null,
        subtotal_net: subtotalNet,
        tax_total: taxTotal,
        total_gross: totalGross,
        rejection_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", invoiceId);
    if (updErr) return fail(updErr.message);

    await ctx.service
      .from("ap_invoice_lines")
      .delete()
      .eq("ap_invoice_id", invoiceId);
  } else {
    invoiceNo = await nextApInvoiceNo(
      ctx.service,
      mapping.entity_id,
      input.invoiceDate,
    );
    const { data: created, error: createErr } = await ctx.service
      .from("ap_invoices")
      .insert({
        entity_id: mapping.entity_id,
        venue_id: ctx.venueId,
        invoice_no: invoiceNo,
        document_type: documentType,
        supplier_id: input.supplierId,
        supplier_invoice_no: supplierInvoiceNo || null,
        delivery_note_no: deliveryNoteNo || null,
        invoice_date: input.invoiceDate,
        due_date: dueDate,
        currency,
        fx_rate: fxRate,
        memo: input.memo?.trim() || null,
        status: "draft",
        subtotal_net: subtotalNet,
        tax_total: taxTotal,
        total_gross: totalGross,
        created_by: ctx.userId,
      })
      .select("*")
      .single();
    if (createErr || !created) return fail(createErr?.message ?? "Create failed");
    invoiceId = created.id;
  }

  const { error: linesErr } = await ctx.service.from("ap_invoice_lines").insert(
    lineRows.map((l) => ({ ...l, ap_invoice_id: invoiceId })),
  );
  if (linesErr) return fail(linesErr.message);

  if (input.attachment && input.attachment.size > 0) {
    try {
      const url = await uploadAttachment(
        ctx.service,
        input.attachment,
        invoiceId!,
      );
      await ctx.service
        .from("ap_invoices")
        .update({ attachment_url: url })
        .eq("id", invoiceId);
    } catch (e) {
      return fail(e instanceof Error ? e.message : "Attachment upload failed");
    }
  }

  // No approval step: every saved document goes straight to the ledger.
  const posted = await postApDocument(ctx, invoiceId!);
  if (!posted.ok) {
    revalidateAp(invoiceId!);
    return fail(`Saved as draft ${invoiceNo}, but posting failed: ${posted.error}`);
  }

  const { data: after } = await ctx.service
    .from("ap_invoices")
    .select("*")
    .eq("id", invoiceId)
    .single();

  await writeAuditLog({
    actor_id: ctx.userId,
    action: input.id ? "update" : "create",
    module_key: "accounting",
    entity: "ap_invoices",
    entity_id: invoiceId!,
    venue_id: ctx.venueId,
    before,
    after: after ?? undefined,
  });

  revalidateAp(invoiceId!);
  return { ok: true as const, id: invoiceId!, invoiceNo };
}

export async function postApInvoice(invoiceId: string) {
  const ctx = await requireApAccess("edit");
  if ("error" in ctx) return fail(ctx.error);
  return postApDocument(ctx, invoiceId);
}

type PostingRefs = {
  taxCodes: Awaited<ReturnType<typeof listTaxCodes>>;
  taxRates: Awaited<ReturnType<typeof listTaxRates>>;
  defaults: Awaited<ReturnType<typeof getSystemDefaultAccountIds>>;
};

async function loadPostingRefs(ctx: ApCtx): Promise<PostingRefs> {
  const [taxCodes, taxRates, defaults] = await Promise.all([
    listTaxCodes(ctx.service),
    listTaxRates(ctx.service),
    getSystemDefaultAccountIds(ctx.service),
  ]);
  return { taxCodes, taxRates, defaults };
}

/** Post a draft AP document to the ledger (no approval step). */
async function postApDocument(ctx: ApCtx, invoiceId: string, refs?: PostingRefs) {
  const { data: inv } = await ctx.service
    .from("ap_invoices")
    .select("*, ap_invoice_lines(*), suppliers(id, name)")
    .eq("id", invoiceId)
    .single();
  if (!inv) return fail("Invoice not found.");
  if (inv.status === "posted") return fail("Already posted.");
  if (!["draft", "submitted", "approved"].includes(inv.status)) {
    return fail(`A ${inv.status} document can't be posted.`);
  }

  const { taxCodes, taxRates, defaults } = refs ?? (await loadPostingRefs(ctx));

  if (!defaults.input_vat || !defaults.output_vat || !defaults.ap_control) {
    return fail("System default accounts (input VAT / output VAT / AP) are not configured.");
  }

  const lines = (inv.ap_invoice_lines ?? []) as Array<{
    description: string;
    account_id: string;
    net_amount: number;
    tax_code_id: string;
    dimensions: Record<string, string>;
  }>;

  if (!lines.length) return fail("Invoice has no lines.");

  // Credit notes hold negative amounts: post the positive figures, then flip
  // every debit and credit (Dr AP, Cr expense / input VAT).
  const isCreditNote = inv.document_type === "credit_note";
  const built = buildApJournalLines({
    lines: lines.map((l) => ({
      description: l.description,
      accountId: l.account_id,
      netAmount: Math.abs(Number(l.net_amount)),
      taxCodeId: l.tax_code_id,
      dimensions: l.dimensions ?? {},
    })),
    invoiceDate: inv.invoice_date,
    taxCodes,
    taxRates,
    accounts: {
      inputVatAccountId: defaults.input_vat,
      outputVatAccountId: defaults.output_vat,
      apControlAccountId: defaults.ap_control,
    },
    supplierDimension: {
      supplier: inv.supplier_id,
    },
    memo: `AP ${inv.invoice_no} / ${inv.supplier_invoice_no ?? inv.delivery_note_no ?? ""}`,
  });

  let journal;
  try {
    journal = await postJournal(ctx.service, {
      entityId: inv.entity_id,
      venueId: inv.venue_id,
      date: inv.invoice_date,
      memo: `Supplier ${isCreditNote ? "credit note" : "invoice"} ${inv.invoice_no}`,
      sourceType: "ap",
      sourceRef: inv.id,
      lines: (isCreditNote ? flipJournalLines(built.lines) : built.lines).map((l) => ({
        accountId: l.accountId,
        debit: l.debit,
        credit: l.credit,
        taxCodeId: l.taxCodeId,
        description: l.description,
        dimensions: l.dimensions,
      })),
      status: "posted",
      actorId: ctx.userId,
      attachmentUrl: inv.attachment_url,
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Posting failed");
  }

  const now = new Date().toISOString();
  const { error } = await ctx.service
    .from("ap_invoices")
    .update({
      status: "posted",
      journal_entry_id: journal.entryId,
      posted_by: ctx.userId,
      posted_at: now,
    })
    .eq("id", invoiceId);

  if (error) return fail(error.message);

  await writeAuditLog({
    actor_id: ctx.userId,
    action: "post",
    module_key: "accounting",
    entity: "ap_invoices",
    entity_id: invoiceId,
    venue_id: ctx.venueId,
    after: {
      status: "posted",
      journal_entry_id: journal.entryId,
      entry_no: journal.entryNo,
      total_gross: inv.total_gross,
    },
  });

  revalidateAp(invoiceId);
  return { ok: true as const, journalEntryId: journal.entryId, entryNo: journal.entryNo };
}

/** Reverse a posted document's journal and return it to draft for editing. */
async function reopenPostedApDocument(
  ctx: ApCtx,
  inv: { id: string; invoice_no: string; journal_entry_id: string | null },
) {
  if (inv.journal_entry_id) {
    try {
      await reverseJournal(ctx.service, {
        entryId: inv.journal_entry_id,
        actorId: ctx.userId,
        reason: `Edit of AP ${inv.invoice_no}`,
      });
    } catch (e) {
      return fail(e instanceof Error ? e.message : "Reversal failed");
    }
  }
  // posted → reversed is the only change the immutability trigger allows;
  // from there the document can be reopened as a draft.
  let { error } = await ctx.service
    .from("ap_invoices")
    .update({ status: "reversed" })
    .eq("id", inv.id);
  if (error) return fail(error.message);
  ({ error } = await ctx.service
    .from("ap_invoices")
    .update({
      status: "draft",
      journal_entry_id: null,
      posted_by: null,
      posted_at: null,
    })
    .eq("id", inv.id));
  if (error) return fail(error.message);
  return { ok: true as const };
}

export async function voidApInvoice(invoiceId: string) {
  const ctx = await requireApAccess("edit");
  if ("error" in ctx) return fail(ctx.error);

  const { data: inv } = await ctx.service
    .from("ap_invoices")
    .select("*")
    .eq("id", invoiceId)
    .single();
  if (!inv) return fail("Invoice not found.");
  if (!["draft", "submitted", "approved"].includes(inv.status)) {
    return fail("Only unposted documents can be voided — reverse a posted one instead.");
  }

  const { error } = await ctx.service
    .from("ap_invoices")
    .update({ status: "void" })
    .eq("id", invoiceId);
  if (error) return fail(error.message);

  await writeAuditLog({
    actor_id: ctx.userId,
    action: "void",
    module_key: "accounting",
    entity: "ap_invoices",
    entity_id: invoiceId,
    venue_id: ctx.venueId,
    before: { status: inv.status },
    after: { status: "void" },
  });

  revalidateAp(invoiceId);
  return { ok: true as const };
}

export async function reverseApInvoice(invoiceId: string, reason?: string) {
  const ctx = await requireApAccess("edit");
  if ("error" in ctx) return fail(ctx.error);

  const approval = await buildApprovalCtx(
    ctx.service,
    ctx.permissions,
    ctx.userId,
    ctx.venueId,
  );
  if (!approval.isAppAdmin && !canAdminAp(ctx.permissions, ctx.venueId)) {
    return fail("Only AP admins can reverse posted invoices.");
  }

  const { data: inv } = await ctx.service
    .from("ap_invoices")
    .select("*")
    .eq("id", invoiceId)
    .single();
  if (!inv) return fail("Invoice not found.");
  if (inv.status !== "posted" || !inv.journal_entry_id) {
    return fail("Only posted invoices with a journal can be reversed.");
  }

  try {
    await reverseJournal(ctx.service, {
      entryId: inv.journal_entry_id,
      actorId: ctx.userId,
      reason: reason || `AP invoice ${inv.invoice_no}`,
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Reversal failed");
  }

  const { error } = await ctx.service
    .from("ap_invoices")
    .update({ status: "reversed" })
    .eq("id", invoiceId);
  if (error) return fail(error.message);

  await writeAuditLog({
    actor_id: ctx.userId,
    action: "reverse",
    module_key: "accounting",
    entity: "ap_invoices",
    entity_id: invoiceId,
    venue_id: ctx.venueId,
    before: { status: "posted" },
    after: { status: "reversed", reason: reason ?? null },
  });

  revalidateAp(invoiceId);
  return { ok: true as const };
}

export async function previewApJournal(input: {
  invoiceDate: string;
  memo?: string;
  supplierId?: string;
  lines: ApInvoiceLineInput[];
}) {
  const ctx = await requireApAccess("view");
  if ("error" in ctx) return fail(ctx.error);

  if (!input.lines.length) {
    return { ok: true as const, lines: [], subtotalNet: 0, taxTotal: 0, totalGross: 0 };
  }

  try {
    const taxCodes = await listTaxCodes(ctx.service);
    const taxRates = await listTaxRates(ctx.service);
    const defaults = await getSystemDefaultAccountIds(ctx.service);
    const accounts = await ctx.service
      .from("accounts")
      .select("id, code, name")
      .in("id", [
        ...input.lines.map((l) => l.accountId),
        defaults.input_vat,
        defaults.output_vat,
        defaults.ap_control,
      ].filter(Boolean));

    const accountMap = new Map(
      (accounts.data ?? []).map((a) => [a.id as string, a]),
    );

    const built = buildApJournalLines({
      lines: input.lines
        .filter((l) => l.accountId && l.taxCodeId)
        .map((l) => ({
          description: l.description,
          accountId: l.accountId,
          netAmount:
            l.netAmount > 0
              ? l.netAmount
              : roundMoney(l.quantity * l.unitPrice),
          taxCodeId: l.taxCodeId,
          dimensions: l.dimensions,
        })),
      invoiceDate: input.invoiceDate || new Date().toISOString().slice(0, 10),
      taxCodes,
      taxRates,
      accounts: {
        inputVatAccountId: defaults.input_vat,
        outputVatAccountId: defaults.output_vat,
        apControlAccountId: defaults.ap_control,
      },
      supplierDimension: input.supplierId
        ? { supplier: input.supplierId }
        : undefined,
      memo: input.memo,
    });

    return {
      ok: true as const,
      ...built,
      lines: built.lines.map((l) => ({
        ...l,
        account: accountMap.get(l.accountId) ?? null,
      })),
    };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Preview failed");
  }
}

/** Post several drafts in one go (e.g. an imported batch). */
export async function bulkPostApInvoices(ids: string[]) {
  const ctx = await requireApAccess("edit");
  if ("error" in ctx) return fail(ctx.error);
  const refs = await loadPostingRefs(ctx);
  const results: { id: string; ok: boolean; error?: string }[] = [];
  for (const id of ids) {
    const r = await postApDocument(ctx, id, refs);
    results.push(r.ok ? { id, ok: true } : { id, ok: false, error: r.error });
  }
  return { ok: true as const, results };
}
