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

export async function writeAuditLog(entry: AuditEntry) {
  const supabase = createServiceClient();
  const { error } = await supabase.from("audit_log").insert(entry);
  if (error) {
    console.error("[audit_log] insert failed:", error.message);
  }
}
