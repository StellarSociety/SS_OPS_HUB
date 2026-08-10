import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/audit";
import {
  assertBalanced,
  mirrorJournalLines,
  type BuiltJournalLine,
  type JournalLineInput,
} from "./posting-ap";
import { roundMoney, sumMoney } from "./money";

export type PostJournalParams = {
  entityId: string;
  venueId: string;
  date: string;
  memo?: string | null;
  sourceType: "manual" | "sales" | "ap" | "ar" | "payroll" | "inventory" | "fa" | "bank" | "fx" | "accrual";
  sourceRef?: string | null;
  lines: JournalLineInput[];
  status?: "draft" | "posted";
  actorId: string;
  attachmentUrl?: string | null;
};

export type PostJournalResult = {
  entryId: string;
  entryNo: string;
};

function toBuiltLines(lines: JournalLineInput[]): BuiltJournalLine[] {
  return lines.map((l) => {
    const debit = roundMoney(l.debit ?? 0);
    const credit = roundMoney(l.credit ?? 0);
    if ((debit > 0 && credit > 0) || (debit === 0 && credit === 0)) {
      throw new Error("Each journal line needs exactly one of debit or credit > 0");
    }
    return {
      accountId: l.accountId,
      debit,
      credit,
      taxCodeId: l.taxCodeId ?? null,
      description: l.description ?? "",
      dimensions: l.dimensions ?? {},
    };
  });
}

async function reserveSequence(
  service: SupabaseClient,
  entityId: string,
  docType: string,
  entryDate: string,
): Promise<string> {
  const { data: seq, error } = await service
    .from("sequences")
    .select("*")
    .eq("entity_id", entityId)
    .eq("doc_type", docType)
    .single();

  if (error || !seq) {
    throw new Error(`Sequence ${docType} not found for entity`);
  }

  const year = entryDate.slice(0, 4);
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

  if (updErr) {
    throw new Error(`Failed to reserve sequence: ${updErr.message}`);
  }

  const padded = String(nextValue).padStart(Number(seq.padding) || 6, "0");
  if (seq.reset_rule === "yearly") {
    return `${seq.prefix}${year}-${padded}`;
  }
  return `${seq.prefix}${padded}`;
}

async function resolveOpenPeriod(
  service: SupabaseClient,
  entityId: string,
  entryDate: string,
): Promise<string> {
  const period = `${entryDate.slice(0, 7)}-01`;
  const { data, error } = await service
    .from("fiscal_periods")
    .select("id, status")
    .eq("entity_id", entityId)
    .eq("period", period)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) {
    throw new Error(`No fiscal period for ${period}`);
  }
  if (data.status !== "open") {
    throw new Error(`Fiscal period ${period} is closed`);
  }
  return data.id as string;
}

/**
 * Single posting entry-point — never write journal_lines from feature code directly.
 */
export async function postJournal(
  service: SupabaseClient,
  params: PostJournalParams,
): Promise<PostJournalResult> {
  const built = toBuiltLines(params.lines);
  assertBalanced(built);

  const periodId = await resolveOpenPeriod(
    service,
    params.entityId,
    params.date,
  );
  const docType = params.sourceType === "ap" ? "journal" : "journal";
  const entryNo = await reserveSequence(
    service,
    params.entityId,
    docType,
    params.date,
  );

  const status = params.status ?? "posted";
  const now = new Date().toISOString();

  const { data: entry, error: entryErr } = await service
    .from("journal_entries")
    .insert({
      entity_id: params.entityId,
      venue_id: params.venueId,
      entry_no: entryNo,
      entry_date: params.date,
      period_id: periodId,
      memo: params.memo ?? null,
      status: "draft",
      source_type: params.sourceType,
      source_ref: params.sourceRef ?? null,
      created_by: params.actorId,
      attachment_url: params.attachmentUrl ?? null,
    })
    .select("id")
    .single();

  if (entryErr || !entry) {
    throw new Error(entryErr?.message ?? "Failed to create journal entry");
  }

  const lineRows = built.map((l, idx) => ({
    journal_entry_id: entry.id,
    line_no: idx + 1,
    account_id: l.accountId,
    debit: l.debit,
    credit: l.credit,
    tax_code_id: l.taxCodeId,
    description: l.description,
    dimensions: l.dimensions,
  }));

  const { data: insertedLines, error: linesErr } = await service
    .from("journal_lines")
    .insert(lineRows)
    .select("id, line_no, dimensions");

  if (linesErr) {
    await service.from("journal_entries").delete().eq("id", entry.id);
    throw new Error(linesErr.message);
  }

  // Normalize dimensions into journal_line_dimensions when value ids present
  for (const row of insertedLines ?? []) {
    const dims = (row.dimensions ?? {}) as Record<string, string>;
    for (const [dimensionId, dimensionValueId] of Object.entries(dims)) {
      if (!dimensionId || !dimensionValueId) continue;
      // Only insert when both look like UUIDs
      if (
        !/^[0-9a-f-]{36}$/i.test(dimensionId) ||
        !/^[0-9a-f-]{36}$/i.test(dimensionValueId)
      ) {
        continue;
      }
      await service.from("journal_line_dimensions").insert({
        journal_line_id: row.id,
        dimension_id: dimensionId,
        dimension_value_id: dimensionValueId,
      });
    }
  }

  if (status === "posted") {
    const { error: postErr } = await service
      .from("journal_entries")
      .update({
        status: "posted",
        posted_by: params.actorId,
        posted_at: now,
      })
      .eq("id", entry.id);

    if (postErr) {
      await service.from("journal_entries").delete().eq("id", entry.id);
      throw new Error(postErr.message);
    }
  }

  await writeAuditLog({
    actor_id: params.actorId,
    action: status === "posted" ? "post" : "create",
    module_key: "accounting",
    entity: "journal_entries",
    entity_id: entry.id,
    venue_id: params.venueId,
    after: {
      entry_no: entryNo,
      source_type: params.sourceType,
      source_ref: params.sourceRef,
      debit: sumMoney(built.map((l) => l.debit)),
      credit: sumMoney(built.map((l) => l.credit)),
      status,
    },
  });

  return { entryId: entry.id as string, entryNo };
}

export async function reverseJournal(
  service: SupabaseClient,
  params: {
    entryId: string;
    actorId: string;
    reason?: string;
  },
): Promise<PostJournalResult> {
  const { data: original, error } = await service
    .from("journal_entries")
    .select("*, journal_lines(*)")
    .eq("id", params.entryId)
    .single();

  if (error || !original) {
    throw new Error(error?.message ?? "Journal entry not found");
  }
  if (original.status !== "posted") {
    throw new Error("Only posted journals can be reversed");
  }
  if (original.reversed_by) {
    throw new Error("Journal already reversed");
  }

  const lines = ((original.journal_lines ?? []) as Array<{
    account_id: string;
    debit: number;
    credit: number;
    tax_code_id: string | null;
    description: string | null;
    dimensions: Record<string, string>;
  }>).map((l) => ({
    accountId: l.account_id,
    debit: Number(l.debit),
    credit: Number(l.credit),
    taxCodeId: l.tax_code_id,
    description: l.description ?? "",
    dimensions: l.dimensions ?? {},
  }));

  const mirrored = mirrorJournalLines(lines);

  const result = await postJournal(service, {
    entityId: original.entity_id,
    venueId: original.venue_id,
    date: new Date().toISOString().slice(0, 10),
    memo: params.reason
      ? `Reversal of ${original.entry_no}: ${params.reason}`
      : `Reversal of ${original.entry_no}`,
    sourceType: original.source_type,
    sourceRef: original.source_ref,
    lines: mirrored.map((l) => ({
      accountId: l.accountId,
      debit: l.debit,
      credit: l.credit,
      taxCodeId: l.taxCodeId,
      description: l.description,
      dimensions: l.dimensions,
    })),
    status: "posted",
    actorId: params.actorId,
  });

  // Link reversal
  await service
    .from("journal_entries")
    .update({ reversal_of: original.id })
    .eq("id", result.entryId);

  await service
    .from("journal_entries")
    .update({
      status: "reversed",
      reversed_by: result.entryId,
    })
    .eq("id", original.id);

  await writeAuditLog({
    actor_id: params.actorId,
    action: "reverse",
    module_key: "accounting",
    entity: "journal_entries",
    entity_id: original.id,
    venue_id: original.venue_id,
    before: { status: "posted" },
    after: {
      status: "reversed",
      reversed_by: result.entryId,
      reason: params.reason ?? null,
    },
  });

  return result;
}
