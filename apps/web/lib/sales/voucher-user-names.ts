import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import type { VenueVoucher } from "./vouchers-types";

/** Display names for the users who added vouchers to the HUB, keyed by user id. */
export async function loadVoucherCreatorNames(
  vouchers: ReadonlyArray<Pick<VenueVoucher, "created_by">>,
): Promise<Record<string, string>> {
  const userIds = [
    ...new Set(
      vouchers
        .map((voucher) => voucher.created_by)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (userIds.length === 0) return {};
  const { data, error } = await createServiceClient()
    .from("profiles")
    .select("id, full_name, email")
    .in("id", userIds);
  if (error) {
    console.error("[sales/vouchers] user names:", error.message);
    return {};
  }
  return Object.fromEntries(
    (data ?? []).map((row) => [
      String(row.id),
      String(row.full_name || row.email || "Unknown user"),
    ]),
  );
}
