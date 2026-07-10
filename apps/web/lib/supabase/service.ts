import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client — server-only. Bypasses RLS for audit writes and admin tasks.
 */
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
