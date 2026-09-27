import type { SupabaseClient } from "@supabase/supabase-js";
import { sumMoney } from "./money";
import type {
  JournalEntry,
  JournalLine,
  JournalSourceType,
  JournalStatus,
} from "./journal-types";

function normalizeLine(row: Record<string, unknown>): JournalLine {
  return {
    ...(row as unknown as JournalLine),
    debit: Number(row.debit ?? 0),
    credit: Number(row.credit ?? 0),
    dimensions: (row.dimensions as Record<string, string>) ?? {},
  };
}

function normalizeEntry(row: Record<string, unknown>): JournalEntry {
  const linesRaw = (row.journal_lines as Record<string, unknown>[] | null) ?? [];
  const lines = linesRaw.map(normalizeLine).sort((a, b) => a.line_no - b.line_no);
  const totalDebit = sumMoney(lines.map((l) => l.debit));
  const totalCredit = sumMoney(lines.map((l) => l.credit));

  return {
    ...(row as unknown as JournalEntry),
    total_debit: totalDebit,
    total_credit: totalCredit,
    journal_lines: lines,
  };
}

export async function listJournalEntries(
  client: SupabaseClient,
  opts: {
    venueId: string;
    status?: JournalStatus | JournalStatus[];
    sourceType?: JournalSourceType | JournalSourceType[];
    dateFrom?: string;
    dateTo?: string;
    search?: string;
    limit?: number;
  },
): Promise<JournalEntry[]> {
  let query = client
    .from("journal_entries")
    .select(
      `
      *,
      legal_entities ( id, entity_code, name ),
      venues ( id, name, slug ),
      journal_lines ( id, debit, credit )
    `,
    )
    .eq("venue_id", opts.venueId)
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 500);

  if (opts.status) {
    if (Array.isArray(opts.status)) {
      query = query.in("status", opts.status);
    } else {
      query = query.eq("status", opts.status);
    }
  }
  if (opts.sourceType) {
    if (Array.isArray(opts.sourceType)) {
      query = query.in("source_type", opts.sourceType);
    } else {
      query = query.eq("source_type", opts.sourceType);
    }
  }
  if (opts.dateFrom) query = query.gte("entry_date", opts.dateFrom);
  if (opts.dateTo) query = query.lte("entry_date", opts.dateTo);
  if (opts.search?.trim()) {
    const q = opts.search.trim();
    query = query.or(`entry_no.ilike.%${q}%,memo.ilike.%${q}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => normalizeEntry(row as Record<string, unknown>));
}

export async function getJournalEntry(
  client: SupabaseClient,
  id: string,
): Promise<JournalEntry | null> {
  const { data, error } = await client
    .from("journal_entries")
    .select(
      `
      *,
      legal_entities ( id, entity_code, name ),
      venues ( id, name, slug ),
      journal_lines (
        *,
        accounts ( id, code, name ),
        tax_codes ( id, code, label )
      )
    `,
    )
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const entry = normalizeEntry(data as Record<string, unknown>);

  if (entry.reversal_of) {
    const { data: original } = await client
      .from("journal_entries")
      .select("id, entry_no")
      .eq("id", entry.reversal_of)
      .maybeSingle();
    if (original) {
      entry.reversal_of_entry = original as { id: string; entry_no: string };
    }
  }
  if (entry.reversed_by) {
    const { data: reversal } = await client
      .from("journal_entries")
      .select("id, entry_no")
      .eq("id", entry.reversed_by)
      .maybeSingle();
    if (reversal) {
      entry.reversed_by_entry = reversal as { id: string; entry_no: string };
    }
  }

  return entry;
}
