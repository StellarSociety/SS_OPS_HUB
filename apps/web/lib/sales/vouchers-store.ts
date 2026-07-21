import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  VenueVoucher,
  VenueVoucherInput,
  VoucherSource,
  VoucherStatus,
} from "./vouchers-types";

function mapVoucher(row: VenueVoucher): VenueVoucher {
  return {
    ...row,
    face_value_gs: Number(row.face_value_gs),
    voucher_name: row.voucher_name ?? "",
    purchaser_name: row.purchaser_name ?? "",
    recipient_name: row.recipient_name ?? "",
    notes: row.notes ?? "",
    redeemed_date: row.redeemed_date ?? null,
    expires_date: row.expires_date ?? null,
    source: (row.source ?? "manual") as VoucherSource,
    source_waiter_sales_id: row.source_waiter_sales_id ?? null,
  };
}

function normalizeStatusFields(input: VenueVoucherInput): {
  status: VoucherStatus;
  redeemed_date: string | null;
} {
  const status = input.status;
  if (status === "redeemed") {
    return {
      status,
      redeemed_date: input.redeemed_date ?? input.issued_date,
    };
  }
  return { status, redeemed_date: null };
}

export async function listVenueVouchers(
  supabase: SupabaseClient,
  venueId: string,
): Promise<VenueVoucher[]> {
  const { data, error } = await supabase
    .from("venue_vouchers")
    .select("*")
    .eq("venue_id", venueId)
    .order("issued_date", { ascending: false })
    .order("voucher_number", { ascending: true });

  if (error) throw error;
  return ((data ?? []) as VenueVoucher[]).map(mapVoucher);
}

export async function upsertVenueVoucher(
  supabase: SupabaseClient,
  venueId: string,
  userId: string,
  input: VenueVoucherInput,
): Promise<VenueVoucher> {
  const { status, redeemed_date } = normalizeStatusFields(input);
  const row = {
    venue_id: venueId,
    voucher_number: input.voucher_number.trim(),
    voucher_name: input.voucher_name.trim(),
    face_value_gs: input.face_value_gs,
    status,
    issued_date: input.issued_date,
    redeemed_date,
    expires_date: input.expires_date || null,
    purchaser_name: input.purchaser_name.trim(),
    recipient_name: input.recipient_name.trim(),
    notes: input.notes.trim(),
    source: input.source ?? "manual",
    source_waiter_sales_id: input.source_waiter_sales_id ?? null,
    updated_by: userId,
  };

  if (input.id) {
    const { data, error } = await supabase
      .from("venue_vouchers")
      .update(row)
      .eq("id", input.id)
      .eq("venue_id", venueId)
      .select("*")
      .single();

    if (error) throw error;
    return mapVoucher(data as VenueVoucher);
  }

  const { data, error } = await supabase
    .from("venue_vouchers")
    .insert({ ...row, created_by: userId })
    .select("*")
    .single();

  if (error) throw error;
  return mapVoucher(data as VenueVoucher);
}

export async function deleteVenueVoucher(
  supabase: SupabaseClient,
  venueId: string,
  id: string,
): Promise<void> {
  const { error } = await supabase
    .from("venue_vouchers")
    .delete()
    .eq("id", id)
    .eq("venue_id", venueId);

  if (error) throw error;
}

export async function upsertVenueVouchersBatch(
  supabase: SupabaseClient,
  venueId: string,
  userId: string,
  inputs: VenueVoucherInput[],
): Promise<VenueVoucher[]> {
  const results: VenueVoucher[] = [];
  for (const input of inputs) {
    results.push(await upsertVenueVoucher(supabase, venueId, userId, input));
  }
  return results;
}
