import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_SAVE_LOG_TYPES,
  type SaveLogRecord,
  type SaveLogType,
} from "./types";

const TYPE_COLUMNS =
  "id, venue_id, key, label, description, sort_order, required_daily, archived_at, created_at, updated_at";

const RECORD_COLUMNS =
  "id, venue_id, type_id, log_date, original_name, storage_path, file_url, content_type, file_size, notes, uploaded_by, created_at, updated_at";

export async function ensureDefaultLogTypes(
  client: SupabaseClient,
  venueId: string,
): Promise<void> {
  const { count, error } = await client
    .from("save_log_types")
    .select("id", { count: "exact", head: true })
    .eq("venue_id", venueId);

  if (error) throw error;
  if ((count ?? 0) > 0) return;

  const { error: insertError } = await client.from("save_log_types").insert(
    DEFAULT_SAVE_LOG_TYPES.map((type) => ({
      venue_id: venueId,
      key: type.key,
      label: type.label,
      description: type.description,
      sort_order: type.sort_order,
      required_daily: type.required_daily,
    })),
  );

  if (insertError && insertError.code !== "23505") throw insertError;
}

export async function listLogTypes(
  client: SupabaseClient,
  venueId: string,
  options?: { includeArchived?: boolean },
): Promise<SaveLogType[]> {
  let query = client
    .from("save_log_types")
    .select(TYPE_COLUMNS)
    .eq("venue_id", venueId)
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });

  if (!options?.includeArchived) {
    query = query.is("archived_at", null);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as SaveLogType[];
}

export async function listLogRecords(
  client: SupabaseClient,
  venueId: string,
  options?: { logDate?: string; fromDate?: string; toDate?: string },
): Promise<SaveLogRecord[]> {
  let query = client
    .from("save_log_records")
    .select(RECORD_COLUMNS)
    .eq("venue_id", venueId)
    .order("created_at", { ascending: false });

  if (options?.logDate) query = query.eq("log_date", options.logDate);
  if (options?.fromDate) query = query.gte("log_date", options.fromDate);
  if (options?.toDate) query = query.lte("log_date", options.toDate);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as Omit<SaveLogRecord, "uploaded_by_name">[];
  const names = await loadUploaderNames(client, rows);
  return rows.map((row) => ({
    ...row,
    uploaded_by_name: row.uploaded_by ? (names.get(row.uploaded_by) ?? null) : null,
  }));
}

export async function listLogDatesWithEntries(
  client: SupabaseClient,
  venueId: string,
): Promise<string[]> {
  const { data, error } = await client
    .from("save_log_records")
    .select("log_date")
    .eq("venue_id", venueId);

  if (error) throw error;
  return [...new Set((data ?? []).map((row) => String(row.log_date)))];
}

export async function getLogRecord(
  client: SupabaseClient,
  venueId: string,
  recordId: string,
): Promise<SaveLogRecord | null> {
  const { data, error } = await client
    .from("save_log_records")
    .select(RECORD_COLUMNS)
    .eq("venue_id", venueId)
    .eq("id", recordId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  const row = data as Omit<SaveLogRecord, "uploaded_by_name">;
  const names = await loadUploaderNames(client, [row]);
  return {
    ...row,
    uploaded_by_name: row.uploaded_by ? (names.get(row.uploaded_by) ?? null) : null,
  };
}

async function loadUploaderNames(
  client: SupabaseClient,
  rows: { uploaded_by: string | null }[],
): Promise<Map<string, string>> {
  const ids = [
    ...new Set(
      rows
        .map((row) => row.uploaded_by)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (ids.length === 0) return new Map();

  const { data, error } = await client
    .from("profiles")
    .select("id, full_name")
    .in("id", ids);

  if (error || !data) return new Map();
  return new Map(
    data.map((profile) => [
      String(profile.id),
      (profile.full_name as string | null)?.trim() || "Team member",
    ]),
  );
}
