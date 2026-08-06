import { createServiceClient } from "@/lib/supabase/service";

export type AuditEntry = {
  actor_id: string | null;
  action: string;
  module_key?: string | null;
  entity?: string | null;
  entity_id?: string | null;
  venue_id?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
};

export async function writeAuditLog(entry: AuditEntry): Promise<string | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("audit_log")
    .insert(entry)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[audit_log] insert failed:", error.message);
    return null;
  }
  return data?.id ? String(data.id) : null;
}
