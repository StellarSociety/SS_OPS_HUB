import type { SupabaseClient } from "@supabase/supabase-js";
import type { VenueDailyVsWaitersComment } from "./daily-vs-waiters-types";

function isMissingCommentsTableError(error: { code?: string; message?: string }): boolean {
  if (error.code === "PGRST205") return true;
  const message = error.message ?? "";
  return (
    message.includes("PGRST205") ||
    message.includes("Could not find the table") ||
    message.includes("venue_daily_vs_waiters_comments")
  );
}

export async function listVenueDailyVsWaitersComments(
  supabase: SupabaseClient,
  venueId: string,
): Promise<VenueDailyVsWaitersComment[]> {
  const { data, error } = await supabase
    .from("venue_daily_vs_waiters_comments")
    .select("*")
    .eq("venue_id", venueId)
    .order("sale_date", { ascending: true });

  if (error) {
    if (isMissingCommentsTableError(error)) return [];
    throw error;
  }
  return (data ?? []) as VenueDailyVsWaitersComment[];
}

export async function upsertVenueDailyVsWaitersComment(
  supabase: SupabaseClient,
  venueId: string,
  userId: string,
  payload: {
    id?: string;
    sale_date: string;
    comment_text: string;
  },
): Promise<VenueDailyVsWaitersComment | null> {
  const trimmed = payload.comment_text.trim();
  if (!trimmed) {
    if (payload.id) {
      await deleteVenueDailyVsWaitersComment(supabase, venueId, payload.id);
    }
    return null;
  }

  const row = {
    venue_id: venueId,
    sale_date: payload.sale_date,
    comment_text: trimmed,
    updated_by: userId,
  };

  if (payload.id) {
    const { data, error } = await supabase
      .from("venue_daily_vs_waiters_comments")
      .update(row)
      .eq("id", payload.id)
      .eq("venue_id", venueId)
      .select("*")
      .single();

    if (error) throw error;
    return data as VenueDailyVsWaitersComment;
  }

  const { data, error } = await supabase
    .from("venue_daily_vs_waiters_comments")
    .upsert(
      { ...row, created_by: userId },
      { onConflict: "venue_id,sale_date" },
    )
    .select("*")
    .single();

  if (error) throw error;
  return data as VenueDailyVsWaitersComment;
}

export async function deleteVenueDailyVsWaitersComment(
  supabase: SupabaseClient,
  venueId: string,
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from("venue_daily_vs_waiters_comments")
    .delete()
    .eq("id", id)
    .eq("venue_id", venueId);

  if (error) throw error;
}
