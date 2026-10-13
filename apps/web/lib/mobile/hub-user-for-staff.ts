import "server-only";

import type { createServiceClient } from "@/lib/supabase/service";

/**
 * The Hub login for a staff record: the profile linked to it, or (when the
 * login isn't linked) the profile whose email matches the staff work /
 * personal email — the same fallback chat contact details use.
 */
export async function hubUserForStaff(
  service: ReturnType<typeof createServiceClient>,
  staffId: string,
): Promise<string | null> {
  const { data: linked } = await service
    .from("profiles")
    .select("id")
    .eq("staff_id", staffId)
    .limit(1)
    .maybeSingle();
  if (linked?.id) return String(linked.id);

  const { data: staff } = await service
    .from("staff")
    .select("work_email, personal_email")
    .eq("id", staffId)
    .maybeSingle();
  const emails = [staff?.work_email, staff?.personal_email]
    .map((e) => String(e ?? "").trim().toLowerCase())
    .filter(Boolean);
  for (const email of emails) {
    const { data: byEmail } = await service
      .from("profiles")
      .select("id")
      // Case-insensitive exact match: escape LIKE wildcards in the address.
      .ilike("email", email.replace(/[\\%_]/g, (c) => `\\${c}`))
      .limit(1)
      .maybeSingle();
    if (byEmail?.id) return String(byEmail.id);
  }
  return null;
}
