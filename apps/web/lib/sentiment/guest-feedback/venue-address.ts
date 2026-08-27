import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPayslipLetterheadForVenue } from "@/lib/hr/payslip-letterhead";

export async function resolveVenueAddress(
  client: SupabaseClient,
  venue: { id: string; slug?: string | null; name?: string | null },
): Promise<string | null> {
  const letterhead = await loadPayslipLetterheadForVenue(client, venue).catch(
    () => null,
  );
  const address = letterhead?.companyAddress?.trim() || "";
  return address || null;
}
